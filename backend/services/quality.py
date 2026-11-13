"""Domain rules: spec evaluation, batch progress and release gating."""
from datetime import date


def evaluate(measured: float, min_limit: float | None, max_limit: float | None) -> str:
    """PASS iff min_limit <= measured <= max_limit (an absent limit is unbounded)."""
    if min_limit is not None and measured < min_limit:
        return "FAIL"
    if max_limit is not None and measured > max_limit:
        return "FAIL"
    return "PASS"


def latest_results_by_definition(batch) -> dict:
    """Latest test result per test definition across all samples of a batch."""
    latest = {}
    for sample in batch.samples:
        for r in sample.results:
            cur = latest.get(r.test_definition_id)
            if cur is None or (r.tested_at, r.id) > (cur.tested_at, cur.id):
                latest[r.test_definition_id] = r
    return latest


def batch_progress(batch) -> dict:
    mandatory = [d for d in batch.product.test_definitions if d.mandatory]
    latest = latest_results_by_definition(batch)
    done = [d for d in mandatory if d.id in latest]
    percent = round(100 * len(done) / len(mandatory)) if mandatory else 0
    return {
        "required": len(mandatory),
        "completed": len(done),
        "mandatory_total": len(mandatory),
        "mandatory_tested": len(done),
        "percent_complete": percent,
        "passed": sum(1 for d in done if latest[d.id].auto_status == "PASS"),
        "failed": sum(1 for d in done if latest[d.id].auto_status == "FAIL"),
        "verified": sum(1 for d in done if latest[d.id].verified_by is not None),
        "open_deviations": sum(1 for dev in batch.deviations if dev.status != "CLOSED"),
    }


def test_matrix(batch) -> list[dict]:
    """Per-specification view of a batch: definition, latest result and PENDING/PASS/FAIL."""
    latest = latest_results_by_definition(batch)
    rows = []
    for d in batch.product.test_definitions:
        r = latest.get(d.id)
        rows.append({"definition": d, "result": r, "status": r.auto_status if r else "PENDING"})
    return rows


def next_code(db, model, column, prefix: str, width: int = 4) -> str:
    """Next sequential business code, e.g. DEV-2026-0004 (used by the seed script)."""
    existing = [c for (c,) in db.query(column).filter(column.like(f"{prefix}%")).all()]
    numbers = []
    for code in existing:
        tail = code[len(prefix):]
        if tail.isdigit():
            numbers.append(int(tail))
    return f"{prefix}{(max(numbers) + 1 if numbers else 1):0{width}d}"


def release_blockers(batch) -> list[str]:
    """Reasons why a batch may NOT be approved/released (empty list => releasable)."""
    reasons = []
    if batch.expiry_date <= date.today():
        reasons.append(f"Batch expired on {batch.expiry_date.isoformat()}")
    latest = latest_results_by_definition(batch)
    for d in batch.product.test_definitions:
        if not d.mandatory:
            continue
        r = latest.get(d.id)
        if r is None:
            reasons.append(f"Mandatory test '{d.test_name}' has no result")
        elif r.auto_status == "FAIL":
            reasons.append(f"Mandatory test '{d.test_name}' failed specification (OOS)")
        elif r.verified_by is None:
            reasons.append(f"Result for '{d.test_name}' is awaiting QC verification")
    for dev in batch.deviations:
        if dev.status != "CLOSED":
            reasons.append(f"Open deviation {dev.deviation_code} ({dev.status})")
    return reasons
