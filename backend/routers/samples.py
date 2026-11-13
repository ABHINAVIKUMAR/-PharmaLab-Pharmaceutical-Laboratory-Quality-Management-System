"""/api/samples - laboratory sample registration."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..audit import log_action, snapshot
from ..database import get_db
from ..models import Batch, Sample, User
from ..schemas import SampleIn
from ..security import get_current_user, require_roles
from ..serializers import sample_out

router = APIRouter(prefix="/api/samples", tags=["samples"])


@router.get("")
def list_samples(batch_id: int | None = None,
                 status_: str | None = Query(default=None, alias="status"),
                 db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(Sample)
    if batch_id:
        query = query.filter(Sample.batch_id == batch_id)
    if status_:
        query = query.filter(Sample.status == status_)
    return [sample_out(s) for s in query.order_by(Sample.id.desc()).all()]


@router.get("/{sample_id}")
def get_sample(sample_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = db.get(Sample, sample_id)
    if s is None:
        raise HTTPException(404, "Sample not found")
    out = sample_out(s, with_results=True)
    out["test_definitions"] = [
        {"id": d.id, "test_name": d.test_name, "min_limit": d.min_limit, "max_limit": d.max_limit,
         "unit": d.unit, "mandatory": d.mandatory}
        for d in s.batch.product.test_definitions
    ]
    return out


@router.post("", status_code=status.HTTP_201_CREATED)
def create_sample(payload: SampleIn, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("LAB_TECHNICIAN", "QC_OFFICER"))):
    batch = db.get(Batch, payload.batch_id)
    if batch is None:
        raise HTTPException(404, "Batch not found")
    if batch.status in ("APPROVED", "REJECTED"):
        raise HTTPException(409, f"Cannot register samples for a {batch.status} batch")
    if payload.sample_code:
        code = payload.sample_code.upper()
        if db.query(Sample).filter(Sample.sample_code == code).first():
            raise HTTPException(409, f"Sample code {code} already exists")
    else:
        code = f"TMP-{uuid.uuid4().hex[:12]}"
    sample = Sample(sample_code=code, batch_id=batch.id, collected_by=user.id, status="PENDING")
    db.add(sample)
    db.flush()
    if not payload.sample_code:
        sample.sample_code = f"SMP-{sample.collected_at:%Y%m%d}-{sample.id:04d}"
    log_action(db, user, "SAMPLE_REGISTERED", "sample", sample.id, None, snapshot(sample))
    if batch.status == "QUARANTINED":
        old = snapshot(batch)
        batch.status = "TESTING"
        db.flush()
        log_action(db, user, "BATCH_STATUS_CHANGED", "batch", batch.id, old, snapshot(batch))
    db.commit()
    return sample_out(sample, with_results=True)
