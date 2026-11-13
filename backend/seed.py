"""Demo data: `python -m backend.seed` (idempotent – skips if users already exist).

Creates 4 demo accounts (one per role), 4 products with specifications, 9 batches in every
lifecycle state, samples, results, OOS deviations, CAPAs (incl. an overdue one) and audit entries.
"""
import random
from datetime import date, datetime, timedelta

from sqlalchemy import func, select

from . import models as m
from .audit import log_change
from .database import Base, SessionLocal, engine
from .security import hash_password
from .services import quality

DEMO_PASSWORD = "PharmaLab@2026"

USERS = [
    ("admin", "Dr. Meera Iyer", "admin@pharmalab.io", m.ROLE_ADMIN),
    ("qa", "Rohan Kapoor", "qa@pharmalab.io", m.ROLE_QA),
    ("qc", "Ananya Sharma", "qc@pharmalab.io", m.ROLE_QC),
    ("tech", "Vikram Singh", "tech@pharmalab.io", m.ROLE_TECH),
    ("tech2", "Priya Nair", "tech2@pharmalab.io", m.ROLE_TECH),
]

# product_code: (name, dosage form, active ingredient, [(test, min, max, unit, mandatory)])
PRODUCTS = {
    "PCM-500": (
        "Paracetamol 500mg Tablets", "Tablet", "Paracetamol",
        [
            ("Assay", 95.0, 105.0, "% label claim", True),
            ("Dissolution (Q, 30 min)", 80.0, 110.0, "%", True),
            ("Disintegration Time", 0.0, 15.0, "min", True),
            ("Water Content (KF)", 0.0, 1.0, "% w/w", False),
            ("Microbial Limit (TAMC)", 0.0, 1000.0, "CFU/g", True),
        ],
    ),
    "AMX-250": (
        "Amoxicillin 250mg Capsules", "Capsule", "Amoxicillin trihydrate",
        [
            ("Assay", 90.0, 120.0, "% label claim", True),
            ("Dissolution (Q, 45 min)", 80.0, 110.0, "%", True),
            ("Water Content (KF)", 11.5, 14.5, "% w/w", True),
            ("Microbial Limit (TAMC)", 0.0, 1000.0, "CFU/g", True),
        ],
    ),
    "MET-500": (
        "Metformin HCl 500mg Tablets", "Tablet", "Metformin hydrochloride",
        [
            ("Assay", 95.0, 105.0, "% label claim", True),
            ("Dissolution (Q, 45 min)", 80.0, 110.0, "%", True),
            ("pH (1% solution)", 6.0, 7.5, "pH", True),
            ("Hardness", 8.0, 20.0, "kp", False),
            ("Microbial Limit (TAMC)", 0.0, 1000.0, "CFU/g", True),
        ],
    ),
    "ATV-010": (
        "Atorvastatin 10mg Tablets", "Tablet", "Atorvastatin calcium",
        [
            ("Assay", 90.0, 110.0, "% label claim", True),
            ("Dissolution (Q, 30 min)", 75.0, 110.0, "%", True),
            ("Related Substances (Total)", 0.0, 2.0, "%", True),
            ("Microbial Limit (TAMC)", 0.0, 1000.0, "CFU/g", True),
        ],
    ),
}


def seed_if_empty() -> bool:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(func.count(m.User.id))):
            print("Database already contains users; skipping seed.")
            return False
        seed(db)
        db.commit()
    print("Seed complete.")
    return True


def seed(db) -> None:
    rng = random.Random(2026)
    now = m.utcnow()
    today = date.today()

    def ago(days: float) -> datetime:
        return now - timedelta(days=days)

    # ------------------------------------------------------------------ users
    pw_hash = hash_password(DEMO_PASSWORD)
    u = {}
    for key, name, email, role in USERS:
        u[key] = m.User(full_name=name, email=email, hashed_password=pw_hash, role=role)
        db.add(u[key])
    db.flush()
    for key in u:
        log_change(db, u["admin"], "USER_CREATED", "user", u[key], ts=ago(60))

    # --------------------------------------------------- products & test specs
    prods, defs = {}, {}
    for code, (name, form, ingredient, tests) in PRODUCTS.items():
        p = m.Product(product_code=code, name=name, dosage_form=form, active_ingredient=ingredient)
        db.add(p)
        db.flush()
        log_change(db, u["qc"], "PRODUCT_CREATED", "product", p, ts=ago(55))
        prods[code], defs[code] = p, {}
        for test_name, lo, hi, unit, mandatory in tests:
            d = m.TestDefinition(
                product_id=p.id, test_name=test_name, min_limit=lo, max_limit=hi, unit=unit, mandatory=mandatory
            )
            db.add(d)
            db.flush()
            log_change(db, u["qc"], "SPEC_CREATED", "test_definition", d, ts=ago(54))
            defs[code][test_name] = d

    # ---------------------------------------------------------------- helpers
    def make_batch(number, code, mfg_days_ago, shelf_days, qty, created_days_ago, creator="qc"):
        mfg = today - timedelta(days=mfg_days_ago)
        b = m.Batch(
            batch_number=number,
            product_id=prods[code].id,
            manufacturing_date=mfg,
            expiry_date=mfg + timedelta(days=shelf_days),
            quantity=qty,
            status="QUARANTINED",
            created_by=u[creator].id,
            created_at=ago(created_days_ago),
        )
        db.add(b)
        log_change(db, u[creator], "BATCH_CREATED", "batch", b, ts=ago(created_days_ago))
        return b

    def good_values(code):
        out = {}
        for name, d in defs[code].items():
            span = d.max_limit - d.min_limit
            val = d.min_limit + span * rng.uniform(0.35, 0.65)
            out[name] = round(val) if d.unit == "CFU/g" else round(val, 2)
        return out

    def run_tests(batch, code, tester, start_days_ago, values, verifier="qc", verified=True, complete=False):
        """Register a sample and record results (PASS/FAIL evaluated automatically)."""
        when0 = ago(start_days_ago)
        t = u[tester]
        sample = m.Sample(
            sample_code=quality.next_code(db, m.Sample, m.Sample.sample_code, f"SMP-{when0:%Y%m%d}-", width=3),
            batch_id=batch.id,
            collected_by=t.id,
            collected_at=when0,
            status="COMPLETED" if complete else "IN_PROGRESS",
        )
        db.add(sample)
        log_change(db, t, "SAMPLE_REGISTERED", "sample", sample, ts=when0)
        if batch.status == "QUARANTINED":
            batch.status = "TESTING"
            log_change(db, t, "BATCH_TESTING", "batch", batch, ts=when0)
        results = {}
        for i, (name, d) in enumerate(defs[code].items()):
            if name not in values:
                continue
            when = min(when0 + timedelta(days=i * 0.7, hours=3), now - timedelta(minutes=5))
            value = values[name]
            r = m.TestResult(
                sample_id=sample.id,
                test_definition_id=d.id,
                measured_value=value,
                auto_status=quality.evaluate(value, d.min_limit, d.max_limit),
                tested_by=t.id,
                verified_by=u[verifier].id if verified else None,
                verified_at=when + timedelta(hours=5) if verified else None,
                tested_at=when,
            )
            db.add(r)
            log_change(db, t, "RESULT_SUBMITTED", "test_result", r, ts=when)
            if r.auto_status == "FAIL":
                log_change(db, t, "OOS_DETECTED", "test_result", r, ts=when)
            if verified:
                log_change(db, u[verifier], "RESULT_VERIFIED", "test_result", r, ts=when + timedelta(hours=5))
            results[name] = r
        db.flush()
        return sample, results

    def set_status(batch, status, user_key, days_ago, remarks=None):
        batch.status = status
        new = {"status": status}
        if remarks:
            new["remarks"] = remarks
        log_change(db, u[user_key], f"BATCH_{status}", "batch", batch, new=new, ts=ago(days_ago))

    def make_dev(batch, result, severity, desc, status, days_ago, root_cause=None, closed_days_ago=None, raiser="qc"):
        dev = m.Deviation(
            deviation_code=quality.next_code(db, m.Deviation, m.Deviation.deviation_code, f"DEV-{today.year}-"),
            batch_id=batch.id,
            test_result_id=result.id if result else None,
            severity=severity,
            description=desc,
            root_cause=root_cause,
            status=status,
            raised_by=u[raiser].id,
            created_at=ago(days_ago),
            closed_at=ago(closed_days_ago) if closed_days_ago is not None else None,
        )
        db.add(dev)
        log_change(db, u[raiser], "OOS_DEVIATION_RAISED" if result else "DEVIATION_CREATED", "deviation", dev, ts=ago(days_ago))
        return dev

    def make_capa(dev, plan, kind, assignee, due_in_days, status, created_days_ago, notes=None, completed_days_ago=None):
        capa = m.Capa(
            deviation_id=dev.id,
            action_plan=plan,
            action_type=kind,
            assigned_to=u[assignee].id,
            due_date=today + timedelta(days=due_in_days),
            status=status,
            completion_notes=notes,
            created_at=ago(created_days_ago),
            completed_at=ago(completed_days_ago) if completed_days_ago is not None else None,
            verified_by=u["qa"].id if status == "VERIFIED" else None,
        )
        db.add(capa)
        log_change(db, u["qa"], "CAPA_CREATED", "capa", capa, ts=ago(created_days_ago))
        if status in ("COMPLETED", "VERIFIED"):
            log_change(db, u[assignee], "CAPA_COMPLETED", "capa", capa, ts=ago(completed_days_ago or 1))
        if status == "VERIFIED":
            log_change(db, u["qa"], "CAPA_VERIFIED", "capa", capa, ts=ago((completed_days_ago or 1) - 0.5))
        return capa

    # ------------------------------------------------------------------ BATCHES
    # B1 – fully tested, released
    b1 = make_batch("PCM-2610-001", "PCM-500", 45, 730, 250_000, 44)
    run_tests(b1, "PCM-500", "tech", 27, good_values("PCM-500"), complete=True)
    set_status(b1, "APPROVED", "qa", 21)

    # B2 – dissolution OOS, deviation under investigation
    b2 = make_batch("PCM-2611-002", "PCM-500", 14, 730, 180_000, 13)
    vals = good_values("PCM-500")
    vals["Dissolution (Q, 30 min)"] = 74.2
    _, r2 = run_tests(b2, "PCM-500", "tech", 6, vals, verified=False)
    make_dev(
        b2, r2["Dissolution (Q, 30 min)"], "MAJOR",
        "OOS result: Dissolution (Q, 30 min) measured 74.2 % (specification 80 – 110) on batch PCM-2611-002.",
        "INVESTIGATING", 5,
    )

    # B3 – water-content OOS, CAPAs in progress (one overdue)
    b3 = make_batch("AMX-2610-003", "AMX-250", 30, 730, 320_000, 29, creator="qa")
    vals = good_values("AMX-250")
    vals["Water Content (KF)"] = 15.8
    _, r3 = run_tests(b3, "AMX-250", "tech2", 12, vals)
    d3 = make_dev(
        b3, r3["Water Content (KF)"], "MAJOR",
        "OOS result: Water Content (KF) measured 15.8 % w/w (specification 11.5 – 14.5) on batch AMX-2610-003.",
        "CAPA_IN_PROGRESS", 10,
        root_cause="Relative humidity above 60 % in the capsule-filling suite during shift B; hopper desiccant not replaced.",
    )
    db.flush()
    make_capa(d3, "Quarantine affected intermediate lots, re-dry and repeat Karl Fischer testing on retained samples.",
              "CORRECTIVE", "qc", -5, "OPEN", 9)
    make_capa(d3, "Install continuous RH monitoring with alarms in the filling suite and revise SOP-MFG-014 to add 2-hourly humidity checks.",
              "PREVENTIVE", "admin", 21, "OPEN", 9)
    make_capa(d3, "Train filling-suite operators on humidity limits and desiccant replacement; record attendance.",
              "CORRECTIVE", "tech", 2, "COMPLETED", 9, notes="Training delivered to all 14 operators on both shifts; attendance sheets filed under TR-2026-118.",
              completed_days_ago=2)

    # B4 – microbial failure, rejected, deviation closed
    b4 = make_batch("AMX-2609-004", "AMX-250", 60, 730, 300_000, 59)
    vals = good_values("AMX-250")
    vals["Microbial Limit (TAMC)"] = 4200
    _, r4 = run_tests(b4, "AMX-250", "tech", 24, vals)
    d4 = make_dev(
        b4, r4["Microbial Limit (TAMC)"], "CRITICAL",
        "OOS result: Microbial Limit (TAMC) measured 4200 CFU/g (specification 0 – 1000) on batch AMX-2609-004.",
        "CLOSED", 20, closed_days_ago=8,
        root_cause="Contaminated purified-water loop sanitisation skipped after maintenance; biofilm detected at use-point 4.",
    )
    db.flush()
    make_capa(d4, "Sanitise purified-water loop, replace use-point 4 valve and re-qualify the loop.",
              "CORRECTIVE", "tech2", -12, "VERIFIED", 19, notes="Loop sanitised with 0.5 % peracetic acid; 3 consecutive clean samples obtained.", completed_days_ago=11)
    make_capa(d4, "Add post-maintenance sanitisation sign-off to the engineering work-order checklist.",
              "PREVENTIVE", "admin", -10, "VERIFIED", 19, notes="Checklist revision EN-CL-007 v3 effective; engineers trained.", completed_days_ago=10)
    set_status(b4, "REJECTED", "qa", 19, remarks="Failed microbial limit – critical deviation raised.")

    # B5 – all tests pass, ready for QA release
    b5 = make_batch("MET-2611-005", "MET-500", 8, 730, 400_000, 7)
    run_tests(b5, "MET-500", "tech", 3, good_values("MET-500"), complete=True)

    # B6 – newly received, quarantined
    make_batch("ATV-2611-006", "ATV-010", 4, 730, 150_000, 3)

    # B7 – approved but approaching expiry
    b7 = make_batch("MET-2501-007", "MET-500", 300, 345, 220_000, 299)
    run_tests(b7, "MET-500", "tech2", 18, good_values("MET-500"), complete=True)
    set_status(b7, "APPROVED", "qa", 14)

    # B8 – related-substances OOS not yet raised as deviation
    b8 = make_batch("ATV-2611-008", "ATV-010", 6, 730, 175_000, 5)
    vals = good_values("ATV-010")
    vals["Related Substances (Total)"] = 2.8
    run_tests(b8, "ATV-010", "tech", 2, vals, verified=False)

    # B9 – second approved batch
    b9 = make_batch("AMX-2610-009", "AMX-250", 40, 730, 280_000, 39)
    run_tests(b9, "AMX-250", "tech2", 25, good_values("AMX-250"), complete=True)
    set_status(b9, "APPROVED", "qa", 19)

    db.flush()


if __name__ == "__main__":
    seed_if_empty()
