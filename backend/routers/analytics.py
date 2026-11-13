"""/api/analytics - aggregate SQL KPIs for the quality dashboard (also feeds Power BI style reporting)."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (BATCH_STATUSES, SEVERITIES, Batch, Capa, Deviation, Product, TestDefinition,
                      TestResult, User)
from ..security import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _count_if(condition):
    return func.coalesce(func.sum(case((condition, 1), else_=0)), 0)


@router.get("/dashboard")
def dashboard(trend_days: int = Query(default=30, ge=7, le=180), db: Session = Depends(get_db),
              _: User = Depends(get_current_user)):
    today = date.today()

    # ---- Batches by status -------------------------------------------------------------------
    counts = dict(db.query(Batch.status, func.count(Batch.id)).group_by(Batch.status).all())
    batches_by_status = [{"status": s, "count": int(counts.get(s, 0))} for s in BATCH_STATUSES]
    total_batches = sum(x["count"] for x in batches_by_status)
    active_batches = int(counts.get("QUARANTINED", 0)) + int(counts.get("TESTING", 0))

    # ---- Overall pass / fail ----------------------------------------------------------------
    passed, failed = db.query(_count_if(TestResult.auto_status == "PASS"),
                              _count_if(TestResult.auto_status == "FAIL")).one()
    passed, failed = int(passed), int(failed)
    total_tests = passed + failed
    pass_rate = round(passed * 100.0 / total_tests, 1) if total_tests else None

    # ---- Results per product (pass / fail) --------------------------------------------------
    rows = (db.query(Product.name, _count_if(TestResult.auto_status == "PASS"),
                     _count_if(TestResult.auto_status == "FAIL"))
            .join(TestDefinition, TestDefinition.product_id == Product.id)
            .join(TestResult, TestResult.test_definition_id == TestDefinition.id)
            .group_by(Product.id, Product.name).order_by(Product.name).all())
    tests_by_product = [{"product": name, "passed": int(p), "failed": int(f)} for name, p, f in rows]
    failed_by_product = sorted(
        ({"product": r["product"], "failed": r["failed"]} for r in tests_by_product if r["failed"] > 0),
        key=lambda r: -r["failed"])

    # ---- Deviations -------------------------------------------------------------------------
    open_deviations = db.query(func.count(Deviation.id)).filter(Deviation.status != "CLOSED").scalar() or 0
    sev = dict(db.query(Deviation.severity, func.count(Deviation.id))
               .filter(Deviation.status != "CLOSED").group_by(Deviation.severity).all())
    open_by_severity = [{"severity": s, "count": int(sev.get(s, 0))} for s in SEVERITIES]

    # ---- CAPAs: open vs overdue -------------------------------------------------------------
    capa_counts = dict(db.query(Capa.status, func.count(Capa.id)).group_by(Capa.status).all())
    open_capas = int(capa_counts.get("OPEN", 0))
    overdue = (db.query(func.count(Capa.id))
               .filter(Capa.status == "OPEN", Capa.due_date < today).scalar() or 0)
    capa_summary = {"open_on_time": max(open_capas - overdue, 0), "overdue": int(overdue),
                    "completed": int(capa_counts.get("COMPLETED", 0)),
                    "verified": int(capa_counts.get("VERIFIED", 0))}

    # ---- Daily pass/fail trend (bucketed in Python for cross-database portability) -----------
    since = datetime.combine(today - timedelta(days=trend_days - 1), datetime.min.time())
    buckets = {(today - timedelta(days=i)).isoformat(): {"pass": 0, "fail": 0}
               for i in range(trend_days - 1, -1, -1)}
    for tested_at, verdict in db.query(TestResult.tested_at, TestResult.auto_status) \
            .filter(TestResult.tested_at >= since).all():
        bucket = buckets.get(tested_at.date().isoformat())
        if bucket is not None:
            bucket["pass" if verdict == "PASS" else "fail"] += 1
    trend = [{"date": k, **v} for k, v in buckets.items()]

    # ---- Recent OOS alerts ------------------------------------------------------------------
    oos = (db.query(TestResult).filter(TestResult.auto_status == "FAIL")
           .order_by(TestResult.tested_at.desc(), TestResult.id.desc()).limit(8).all())
    recent_oos = []
    for r in oos:
        d, batch = r.test_definition, r.sample.batch
        dev = r.deviations[0] if r.deviations else None
        recent_oos.append({
            "id": r.id, "sample_code": r.sample.sample_code, "batch_id": batch.id,
            "batch_number": batch.batch_number, "product_name": batch.product.name,
            "test_name": d.test_name, "unit": d.unit, "measured_value": r.measured_value,
            "min_limit": d.min_limit, "max_limit": d.max_limit, "tested_at": r.tested_at,
            "deviation_id": dev.id if dev else None,
            "deviation_code": dev.deviation_code if dev else None,
        })

    # ---- Batches expiring within 90 days ----------------------------------------------------
    expiring = (db.query(Batch).filter(Batch.status != "REJECTED", Batch.expiry_date > today,
                                       Batch.expiry_date <= today + timedelta(days=90))
                .order_by(Batch.expiry_date).limit(6).all())

    return {
        "kpis": {
            "total_batches": total_batches, "active_batches": active_batches,
            "total_tests": total_tests, "passed_tests": passed, "failed_tests": failed,
            "pass_rate": pass_rate, "open_deviations": int(open_deviations),
            "open_capas": open_capas, "overdue_capas": int(overdue),
        },
        "batches_by_status": batches_by_status,
        "trend": trend,
        "tests_by_product": tests_by_product,
        "failed_by_product": failed_by_product,
        "capa_summary": capa_summary,
        "open_deviations_by_severity": open_by_severity,
        "recent_oos": recent_oos,
        "expiring_batches": [{
            "id": b.id, "batch_number": b.batch_number, "product_name": b.product.name,
            "expiry_date": b.expiry_date, "days_to_expiry": (b.expiry_date - today).days,
            "status": b.status,
        } for b in expiring],
    }
