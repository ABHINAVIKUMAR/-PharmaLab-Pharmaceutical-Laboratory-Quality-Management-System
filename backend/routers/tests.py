"""/api/tests - test specifications, result entry with automatic PASS/FAIL, OOS handling."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import log_action, snapshot
from ..database import get_db
from ..models import Deviation, Sample, TestDefinition, TestResult, User, utcnow
from ..models import Product
from ..schemas import FlagOosIn, TestDefinitionIn, TestDefinitionUpdateIn, TestResultIn
from ..security import get_current_user, require_roles
from ..serializers import deviation_out, result_out, spec_out
from ..services.quality import evaluate

router = APIRouter(prefix="/api/tests", tags=["tests"])


# ---------- Specifications ----------
@router.get("/definitions")
def list_definitions(product_id: int | None = None, db: Session = Depends(get_db),
                     _: User = Depends(get_current_user)):
    query = db.query(TestDefinition)
    if product_id:
        query = query.filter(TestDefinition.product_id == product_id)
    return [spec_out(d) for d in query.order_by(TestDefinition.product_id, TestDefinition.id).all()]


@router.post("/definitions", status_code=status.HTTP_201_CREATED)
def create_definition(payload: TestDefinitionIn, db: Session = Depends(get_db),
                      user: User = Depends(require_roles("QC_OFFICER"))):
    if db.get(Product, payload.product_id) is None:
        raise HTTPException(404, "Product not found")
    exists = db.query(TestDefinition).filter(TestDefinition.product_id == payload.product_id,
                                             TestDefinition.test_name == payload.test_name).first()
    if exists:
        raise HTTPException(409, f"Test '{payload.test_name}' is already defined for this product")
    d = TestDefinition(**payload.model_dump())
    db.add(d)
    db.flush()
    log_action(db, user, "TEST_DEFINITION_CREATED", "test_definition", d.id, None, snapshot(d))
    db.commit()
    return spec_out(d)


@router.put("/definitions/{definition_id}")
def update_definition(definition_id: int, payload: TestDefinitionUpdateIn, db: Session = Depends(get_db),
                      user: User = Depends(require_roles("QC_OFFICER"))):
    d = db.get(TestDefinition, definition_id)
    if d is None:
        raise HTTPException(404, "Test definition not found")
    if d.results:
        raise HTTPException(409, "Specification already has results; create a new test instead "
                                 "(results must remain traceable to the spec they were judged against)")
    data = payload.model_dump(exclude_unset=True)
    lo = data.get("min_limit", d.min_limit)
    hi = data.get("max_limit", d.max_limit)
    if lo is None and hi is None:
        raise HTTPException(422, "At least one limit is required")
    if lo is not None and hi is not None and lo > hi:
        raise HTTPException(422, "min_limit must be <= max_limit")
    old = snapshot(d)
    for key, value in data.items():
        if key in ("min_limit", "max_limit") or value is not None:
            setattr(d, key, value)
    db.flush()
    log_action(db, user, "TEST_DEFINITION_UPDATED", "test_definition", d.id, old, snapshot(d))
    db.commit()
    return spec_out(d)


@router.delete("/definitions/{definition_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_definition(definition_id: int, db: Session = Depends(get_db),
                      user: User = Depends(require_roles("QC_OFFICER"))):
    d = db.get(TestDefinition, definition_id)
    if d is None:
        raise HTTPException(404, "Test definition not found")
    if d.results:
        raise HTTPException(409, "Cannot delete a specification that already has results")
    old = snapshot(d)
    db.delete(d)
    log_action(db, user, "TEST_DEFINITION_DELETED", "test_definition", definition_id, old, None)
    db.commit()


# ---------- Results ----------
@router.get("/results")
def list_results(sample_id: int | None = None, batch_id: int | None = None,
                 auto_status: str | None = Query(default=None, pattern="^(PASS|FAIL)$"),
                 limit: int = Query(default=200, ge=1, le=1000),
                 db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(TestResult)
    if sample_id:
        query = query.filter(TestResult.sample_id == sample_id)
    if batch_id:
        query = query.join(Sample).filter(Sample.batch_id == batch_id)
    if auto_status:
        query = query.filter(TestResult.auto_status == auto_status)
    return [result_out(r) for r in query.order_by(TestResult.tested_at.desc(), TestResult.id.desc())
            .limit(limit).all()]


@router.post("/results", status_code=status.HTTP_201_CREATED)
def submit_result(payload: TestResultIn, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("LAB_TECHNICIAN", "QC_OFFICER"))):
    sample = db.get(Sample, payload.sample_id)
    if sample is None:
        raise HTTPException(404, "Sample not found")
    definition = db.get(TestDefinition, payload.test_definition_id)
    if definition is None:
        raise HTTPException(404, "Test definition not found")
    batch = sample.batch
    if definition.product_id != batch.product_id:
        raise HTTPException(422, "This test does not belong to the sample's product")
    if batch.status in ("APPROVED", "REJECTED"):
        raise HTTPException(409, f"Batch is {batch.status}; results can no longer be entered")
    if db.query(TestResult).filter(TestResult.sample_id == sample.id,
                                   TestResult.test_definition_id == definition.id).first():
        raise HTTPException(409, "A result for this test already exists on this sample")

    verdict = evaluate(payload.measured_value, definition.min_limit, definition.max_limit)
    result = TestResult(sample_id=sample.id, test_definition_id=definition.id,
                        measured_value=payload.measured_value, auto_status=verdict,
                        tested_by=user.id, remarks=payload.remarks, tested_at=utcnow())
    db.add(result)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A result for this test already exists on this sample")
    log_action(db, user, "TEST_RESULT_SUBMITTED", "test_result", result.id, None, snapshot(result))
    if verdict == "FAIL":
        log_action(db, user, "OOS_FLAGGED", "test_result", result.id, None,
                   {"test": definition.test_name, "measured_value": result.measured_value,
                    "min_limit": definition.min_limit, "max_limit": definition.max_limit,
                    "batch": batch.batch_number})

    # Sample progress
    db.refresh(sample)
    mandatory_ids = {d.id for d in batch.product.test_definitions if d.mandatory}
    done_ids = {r.test_definition_id for r in sample.results}
    new_status = "COMPLETED" if mandatory_ids <= done_ids else "IN_PROGRESS"
    if sample.status != new_status:
        old = snapshot(sample)
        sample.status = new_status
        db.flush()
        log_action(db, user, "SAMPLE_STATUS_CHANGED", "sample", sample.id, old, snapshot(sample))
    db.commit()
    out = result_out(result)
    out["oos_flagged"] = verdict == "FAIL"
    return out


@router.post("/results/{result_id}/verify")
def verify_result(result_id: int, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("QC_OFFICER"))):
    r = db.get(TestResult, result_id)
    if r is None:
        raise HTTPException(404, "Result not found")
    if r.verified_by is not None:
        raise HTTPException(409, "Result is already verified")
    if r.tested_by == user.id and user.role != "ADMIN":
        raise HTTPException(403, "Segregation of duties: you cannot verify your own result")
    old = snapshot(r)
    r.verified_by = user.id
    r.verified_at = utcnow()
    db.flush()
    log_action(db, user, "TEST_RESULT_VERIFIED", "test_result", r.id, old, snapshot(r))
    db.commit()
    return result_out(r)


@router.post("/results/{result_id}/flag-oos", status_code=status.HTTP_201_CREATED)
def flag_oos(result_id: int, payload: FlagOosIn | None = None, db: Session = Depends(get_db),
             user: User = Depends(require_roles("QC_OFFICER", "QA_OFFICER"))):
    """One-click Out-of-Specification deviation creation for a failed result."""
    r = db.get(TestResult, result_id)
    if r is None:
        raise HTTPException(404, "Result not found")
    if r.auto_status != "FAIL":
        raise HTTPException(409, "Only FAIL results can be raised as OOS deviations")
    if r.deviations:
        raise HTTPException(409, f"Deviation {r.deviations[0].deviation_code} already exists for this result")
    payload = payload or FlagOosIn()
    d = r.test_definition
    limits = f"{d.min_limit if d.min_limit is not None else '-'} to {d.max_limit if d.max_limit is not None else '-'} {d.unit}".strip()
    description = payload.description or (
        f"OOS result: {d.test_name} measured {r.measured_value} {d.unit} "
        f"(specification {limits}) on sample {r.sample.sample_code}, batch {r.sample.batch.batch_number}."
    )
    dev = Deviation(deviation_code=f"TMP-{r.id}-{datetime.now().timestamp()}", batch_id=r.sample.batch_id,
                    test_result_id=r.id, severity=payload.severity, description=description,
                    status="OPEN", raised_by=user.id)
    db.add(dev)
    db.flush()
    dev.deviation_code = f"DEV-{dev.created_at:%Y}-{dev.id:04d}"
    db.flush()
    log_action(db, user, "DEVIATION_CREATED", "deviation", dev.id, None, snapshot(dev))
    db.commit()
    return deviation_out(dev, detail=True)
