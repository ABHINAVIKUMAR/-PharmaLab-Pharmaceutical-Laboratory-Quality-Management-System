"""/api/deviations - quality deviation lifecycle."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..audit import log_action, snapshot
from ..database import get_db
from ..models import DEVIATION_STATUSES, SEVERITIES, Batch, Deviation, TestResult, User, utcnow
from ..schemas import DeviationIn, DeviationUpdateIn
from ..security import get_current_user, require_roles
from ..serializers import deviation_out

router = APIRouter(prefix="/api/deviations", tags=["deviations"])

TRANSITIONS = {
    "OPEN": {"INVESTIGATING", "CLOSED"},
    "INVESTIGATING": {"OPEN", "CAPA_IN_PROGRESS", "CLOSED"},
    "CAPA_IN_PROGRESS": {"INVESTIGATING", "CLOSED"},
    "CLOSED": set(),
}


@router.get("")
def list_deviations(status_: str | None = Query(default=None, alias="status"),
                    severity: str | None = None, batch_id: int | None = None,
                    q: str | None = Query(default=None, max_length=100),
                    db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(Deviation)
    if status_:
        if status_ not in DEVIATION_STATUSES:
            raise HTTPException(422, "Invalid status filter")
        query = query.filter(Deviation.status == status_)
    if severity:
        if severity not in SEVERITIES:
            raise HTTPException(422, "Invalid severity filter")
        query = query.filter(Deviation.severity == severity)
    if batch_id:
        query = query.filter(Deviation.batch_id == batch_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Deviation.deviation_code.ilike(like), Deviation.description.ilike(like)))
    return [deviation_out(d) for d in query.order_by(Deviation.id.desc()).all()]


@router.get("/{deviation_id}")
def get_deviation(deviation_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    d = db.get(Deviation, deviation_id)
    if d is None:
        raise HTTPException(404, "Deviation not found")
    return deviation_out(d, detail=True)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_deviation(payload: DeviationIn, db: Session = Depends(get_db),
                     user: User = Depends(require_roles("QC_OFFICER", "QA_OFFICER"))):
    batch = db.get(Batch, payload.batch_id)
    if batch is None:
        raise HTTPException(404, "Batch not found")
    if payload.test_result_id:
        tr = db.get(TestResult, payload.test_result_id)
        if tr is None or tr.sample.batch_id != batch.id:
            raise HTTPException(422, "Test result does not belong to this batch")
    d = Deviation(deviation_code=f"TMP-{uuid.uuid4().hex[:12]}", batch_id=batch.id,
                  test_result_id=payload.test_result_id, severity=payload.severity,
                  description=payload.description, status="OPEN", raised_by=user.id)
    db.add(d)
    db.flush()
    d.deviation_code = f"DEV-{d.created_at:%Y}-{d.id:04d}"
    db.flush()
    log_action(db, user, "DEVIATION_CREATED", "deviation", d.id, None, snapshot(d))
    db.commit()
    return deviation_out(d, detail=True)


@router.put("/{deviation_id}")
def update_deviation(deviation_id: int, payload: DeviationUpdateIn, db: Session = Depends(get_db),
                     user: User = Depends(require_roles("QC_OFFICER", "QA_OFFICER"))):
    d = db.get(Deviation, deviation_id)
    if d is None:
        raise HTTPException(404, "Deviation not found")
    if d.status == "CLOSED":
        raise HTTPException(409, "A closed deviation cannot be modified")
    data = payload.model_dump(exclude_unset=True)
    old = snapshot(d)

    for key in ("severity", "description", "root_cause"):
        if key in data and data[key] is not None:
            setattr(d, key, data[key])

    target = data.get("status")
    if target and target != d.status:
        if target not in TRANSITIONS[d.status]:
            raise HTTPException(409, f"Invalid transition {d.status} -> {target}")
        if target == "CAPA_IN_PROGRESS" and not d.capas:
            raise HTTPException(409, "Assign at least one CAPA before moving to CAPA_IN_PROGRESS")
        if target == "CLOSED":
            if user.role not in ("QA_OFFICER", "ADMIN"):
                raise HTTPException(403, "Only QA Officers can close deviations")
            if not (d.root_cause and d.root_cause.strip()):
                raise HTTPException(409, "Document the root cause before closing the deviation")
            pending = [c for c in d.capas if c.status != "VERIFIED"]
            if pending:
                raise HTTPException(409, f"{len(pending)} CAPA(s) must be VERIFIED before closing")
            d.closed_at = utcnow()
        d.status = target
    db.flush()
    log_action(db, user, "DEVIATION_CLOSED" if d.status == "CLOSED" else "DEVIATION_UPDATED",
               "deviation", d.id, old, snapshot(d))
    db.commit()
    return deviation_out(d, detail=True)
