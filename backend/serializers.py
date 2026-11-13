"""Explicit ORM -> JSON-friendly dict serializers (never leak password hashes)."""
from datetime import date

from .services.quality import batch_progress, release_blockers, test_matrix


def user_out(u) -> dict:
    return {"id": u.id, "full_name": u.full_name, "email": u.email, "role": u.role,
            "is_active": u.is_active, "created_at": u.created_at}


def user_brief(u) -> dict | None:
    return None if u is None else {"id": u.id, "full_name": u.full_name, "role": u.role}


def spec_out(d) -> dict:
    return {"id": d.id, "product_id": d.product_id, "test_name": d.test_name, "min_limit": d.min_limit,
            "max_limit": d.max_limit, "unit": d.unit, "mandatory": d.mandatory}


def product_out(p, with_specs: bool = False) -> dict:
    out = {"id": p.id, "product_code": p.product_code, "name": p.name, "dosage_form": p.dosage_form,
           "active_ingredient": p.active_ingredient, "created_at": p.created_at,
           "batch_count": len(p.batches), "spec_count": len(p.test_definitions),
           "test_count": len(p.test_definitions)}
    if with_specs:
        out["test_definitions"] = [spec_out(d) for d in p.test_definitions]
    return out


def batch_out(b, detail: bool = False) -> dict:
    today = date.today()
    out = {
        "id": b.id, "batch_number": b.batch_number, "product_id": b.product_id,
        "product_code": b.product.product_code, "product_name": b.product.name,
        "dosage_form": b.product.dosage_form,
        "manufacturing_date": b.manufacturing_date, "expiry_date": b.expiry_date,
        "days_to_expiry": (b.expiry_date - today).days, "is_expired": b.expiry_date <= today,
        "quantity": b.quantity, "status": b.status, "created_by": b.created_by,
        "created_by_name": b.creator.full_name if b.creator else None, "created_at": b.created_at,
        "progress": batch_progress(b),
        "open_deviations": sum(1 for d in b.deviations if d.status != "CLOSED"),
        "sample_count": len(b.samples),
    }
    if detail:
        blockers = release_blockers(b) if b.status not in ("APPROVED", "REJECTED") else []
        out["blockers"] = blockers
        out["release_blockers"] = blockers
        out["tests"] = [
            {"definition": spec_out(row["definition"]),
             "result": result_out(row["result"]) if row["result"] else None,
             "status": row["status"]}
            for row in test_matrix(b)
        ]
        out["samples"] = [sample_out(s, with_results=True) for s in b.samples]
        out["deviations"] = [deviation_out(d) for d in b.deviations]
        out["test_definitions"] = [spec_out(d) for d in b.product.test_definitions]
    return out


def result_out(r) -> dict:
    d = r.test_definition
    open_dev = next((x for x in r.deviations), None)
    return {
        "id": r.id, "sample_id": r.sample_id, "sample_code": r.sample.sample_code,
        "batch_id": r.sample.batch_id, "batch_number": r.sample.batch.batch_number,
        "product_name": r.sample.batch.product.name,
        "test_definition_id": r.test_definition_id, "test_name": d.test_name, "unit": d.unit,
        "min_limit": d.min_limit, "max_limit": d.max_limit, "mandatory": d.mandatory,
        "measured_value": r.measured_value, "auto_status": r.auto_status,
        "is_oos": r.auto_status == "FAIL",
        "tested_by": r.tested_by, "tested_by_name": r.tester.full_name if r.tester else None,
        "verified_by": r.verified_by, "verified_by_name": r.verifier.full_name if r.verifier else None,
        "verified_at": r.verified_at, "report_blob_url": r.report_blob_url, "remarks": r.remarks,
        "tested_at": r.tested_at,
        "deviation_id": open_dev.id if open_dev else None,
        "deviation_code": open_dev.deviation_code if open_dev else None,
    }


def sample_out(s, with_results: bool = False) -> dict:
    out = {
        "id": s.id, "sample_code": s.sample_code, "batch_id": s.batch_id,
        "batch_number": s.batch.batch_number, "product_id": s.batch.product_id,
        "product_name": s.batch.product.name, "batch_status": s.batch.status,
        "collected_by": s.collected_by, "collected_by_name": s.collector.full_name if s.collector else None,
        "collected_at": s.collected_at, "status": s.status, "result_count": len(s.results),
        "oos_count": sum(1 for r in s.results if r.auto_status == "FAIL"),
    }
    if with_results:
        out["results"] = [result_out(r) for r in s.results]
    return out


def capa_out(c) -> dict:
    today = date.today()
    return {
        "id": c.id, "deviation_id": c.deviation_id, "deviation_code": c.deviation.deviation_code,
        "batch_number": c.deviation.batch.batch_number,
        "action_plan": c.action_plan, "action_type": c.action_type,
        "assigned_to": c.assigned_to, "assigned_to_name": c.assignee.full_name if c.assignee else None,
        "due_date": c.due_date, "completion_notes": c.completion_notes, "status": c.status,
        "created_at": c.created_at, "completed_at": c.completed_at,
        "verified_by": c.verified_by, "verified_by_name": c.verifier.full_name if c.verifier else None,
        "is_overdue": c.status == "OPEN" and c.due_date < today,
        "days_overdue": (today - c.due_date).days if c.status == "OPEN" and c.due_date < today else 0,
    }


def deviation_out(d, detail: bool = False) -> dict:
    tr = d.test_result
    out = {
        "id": d.id, "deviation_code": d.deviation_code, "batch_id": d.batch_id,
        "batch_number": d.batch.batch_number, "product_name": d.batch.product.name,
        "test_result_id": d.test_result_id,
        "test_name": tr.test_definition.test_name if tr else None,
        "measured_value": tr.measured_value if tr else None,
        "severity": d.severity, "description": d.description, "root_cause": d.root_cause,
        "status": d.status, "raised_by": d.raised_by,
        "raised_by_name": d.raiser.full_name if d.raiser else None,
        "created_at": d.created_at, "closed_at": d.closed_at,
        "capa_total": len(d.capas),
        "capa_open": sum(1 for c in d.capas if c.status == "OPEN"),
        "capa_overdue": sum(1 for c in d.capas if c.status == "OPEN" and c.due_date < date.today()),
    }
    if detail:
        out["capas"] = [capa_out(c) for c in d.capas]
        if tr:
            out["test_result"] = result_out(tr)
    return out


def audit_out(a) -> dict:
    return {
        "id": a.id, "user_id": a.user_id,
        "user_name": a.user.full_name if a.user else "System",
        "user_email": a.user.email if a.user else None,
        "user_role": a.user.role if a.user else None,
        "action": a.action, "entity_type": a.entity_type, "entity_id": a.entity_id,
        "old_value": a.old_value, "new_value": a.new_value, "timestamp": a.timestamp,
    }
