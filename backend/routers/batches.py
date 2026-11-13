"""/api/batches - batch registration, expiry tracking and QA release gate."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..audit import log_action, snapshot
from ..database import get_db
from ..models import BATCH_STATUSES, Batch, Product, User
from ..schemas import BatchIn, BatchStatusIn, BatchUpdateIn
from ..security import get_current_user, require_roles
from ..serializers import batch_out
from ..services.quality import release_blockers

router = APIRouter(prefix="/api/batches", tags=["batches"])

# Allowed status transitions: current -> permitted next states
TRANSITIONS = {
    "QUARANTINED": {"TESTING", "REJECTED"},
    "TESTING": {"QUARANTINED", "APPROVED", "REJECTED"},
    "APPROVED": {"REJECTED"},   # recall / post-release rejection
    "REJECTED": set(),
}
QA_ONLY_TARGETS = {"APPROVED", "REJECTED"}


@router.get("")
def list_batches(status_: str | None = Query(default=None, alias="status"),
                 product_id: int | None = None,
                 q: str | None = Query(default=None, max_length=100),
                 expiring_within_days: int | None = Query(default=None, ge=1, le=3650),
                 db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(Batch)
    if status_:
        if status_ not in BATCH_STATUSES:
            raise HTTPException(422, "Invalid status filter")
        query = query.filter(Batch.status == status_)
    if product_id:
        query = query.filter(Batch.product_id == product_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.join(Product).filter(or_(Batch.batch_number.ilike(like), Product.name.ilike(like)))
    batches = query.order_by(Batch.id.desc()).all()
    out = [batch_out(b) for b in batches]
    if expiring_within_days:
        out = [b for b in out if b["days_to_expiry"] <= expiring_within_days]
    return out


@router.get("/{batch_id}")
def get_batch(batch_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    b = db.get(Batch, batch_id)
    if b is None:
        raise HTTPException(404, "Batch not found")
    return batch_out(b, detail=True)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_batch(payload: BatchIn, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("QC_OFFICER", "QA_OFFICER"))):
    if db.get(Product, payload.product_id) is None:
        raise HTTPException(404, "Product not found")
    number = payload.batch_number.upper()
    if db.query(Batch).filter(Batch.batch_number == number).first():
        raise HTTPException(409, f"Batch number {number} already exists")
    if payload.expiry_date <= date.today():
        raise HTTPException(422, "Cannot register a batch that is already expired")
    b = Batch(batch_number=number, product_id=payload.product_id,
              manufacturing_date=payload.manufacturing_date, expiry_date=payload.expiry_date,
              quantity=payload.quantity, status="QUARANTINED", created_by=user.id)
    db.add(b)
    db.flush()
    log_action(db, user, "BATCH_CREATED", "batch", b.id, None, snapshot(b))
    db.commit()
    return batch_out(b, detail=True)


@router.put("/{batch_id}")
def update_batch(batch_id: int, payload: BatchUpdateIn, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("QC_OFFICER", "QA_OFFICER"))):
    b = db.get(Batch, batch_id)
    if b is None:
        raise HTTPException(404, "Batch not found")
    if b.status in ("APPROVED", "REJECTED"):
        raise HTTPException(409, f"A {b.status} batch can no longer be edited")
    data = payload.model_dump(exclude_unset=True)
    mfg = data.get("manufacturing_date") or b.manufacturing_date
    exp = data.get("expiry_date") or b.expiry_date
    if exp <= mfg:
        raise HTTPException(422, "expiry_date must be after manufacturing_date")
    old = snapshot(b)
    for key, value in data.items():
        if value is not None:
            setattr(b, key, value)
    db.flush()
    log_action(db, user, "BATCH_UPDATED", "batch", b.id, old, snapshot(b))
    db.commit()
    return batch_out(b, detail=True)


@router.post("/{batch_id}/status")
def change_status(batch_id: int, payload: BatchStatusIn, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("QC_OFFICER", "QA_OFFICER"))):
    b = db.get(Batch, batch_id)
    if b is None:
        raise HTTPException(404, "Batch not found")
    target = payload.status
    if target == b.status:
        raise HTTPException(409, f"Batch is already {target}")
    if target not in TRANSITIONS[b.status]:
        raise HTTPException(409, f"Invalid transition {b.status} -> {target}")
    if target in QA_ONLY_TARGETS and user.role not in ("QA_OFFICER", "ADMIN"):
        raise HTTPException(403, "Only QA Officers can approve or reject batches")
    if target == "REJECTED" and not (payload.reason and payload.reason.strip()):
        raise HTTPException(422, "A reason is required to reject a batch")
    if target == "APPROVED":
        blockers = release_blockers(b)
        if blockers:
            raise HTTPException(409, detail={"message": "Batch cannot be approved", "blockers": blockers})
    old = snapshot(b)
    b.status = target
    db.flush()
    new = snapshot(b)
    new["reason"] = payload.reason
    log_action(db, user, f"BATCH_{target}" if target in QA_ONLY_TARGETS else "BATCH_STATUS_CHANGED",
               "batch", b.id, old, new)
    db.commit()
    return batch_out(b, detail=True)


@router.delete("/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_batch(batch_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles())):
    b = db.get(Batch, batch_id)
    if b is None:
        raise HTTPException(404, "Batch not found")
    if b.samples or b.deviations:
        raise HTTPException(409, "Cannot delete a batch that has samples or deviations (GxP traceability)")
    old = snapshot(b)
    db.delete(b)
    log_action(db, user, "BATCH_DELETED", "batch", batch_id, old, None)
    db.commit()
