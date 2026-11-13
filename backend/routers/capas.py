"""/api/capas - Corrective and Preventive Action tracking with overdue detection."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..audit import log_action, snapshot
from ..database import get_db
from ..models import CAPA_STATUSES, Capa, Deviation, User, utcnow
from ..schemas import CapaCompleteIn, CapaIn, CapaUpdateIn
from ..security import get_current_user, require_roles
from ..serializers import capa_out

router = APIRouter(prefix="/api/capas", tags=["capas"])


@router.get("")
def list_capas(status_: str | None = Query(default=None, alias="status"),
               deviation_id: int | None = None, assigned_to: int | None = None,
               overdue: bool | None = None, mine: bool = False,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(Capa)
    if status_:
        if status_ not in CAPA_STATUSES:
            raise HTTPException(422, "Invalid status filter")
        query = query.filter(Capa.status == status_)
    if deviation_id:
        query = query.filter(Capa.deviation_id == deviation_id)
    if mine:
        query = query.filter(Capa.assigned_to == user.id)
    elif assigned_to:
        query = query.filter(Capa.assigned_to == assigned_to)
    if overdue is True:
        query = query.filter(Capa.status == "OPEN", Capa.due_date < date.today())
    elif overdue is False:
        query = query.filter(~((Capa.status == "OPEN") & (Capa.due_date < date.today())))
    return [capa_out(c) for c in query.order_by(Capa.due_date, Capa.id).all()]


@router.get("/{capa_id}")
def get_capa(capa_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    c = db.get(Capa, capa_id)
    if c is None:
        raise HTTPException(404, "CAPA not found")
    return capa_out(c)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_capa(payload: CapaIn, db: Session = Depends(get_db),
                user: User = Depends(require_roles("QA_OFFICER"))):
    dev = db.get(Deviation, payload.deviation_id)
    if dev is None:
        raise HTTPException(404, "Deviation not found")
    if dev.status == "CLOSED":
        raise HTTPException(409, "Cannot add CAPAs to a closed deviation")
    assignee = db.get(User, payload.assigned_to)
    if assignee is None or not assignee.is_active:
        raise HTTPException(422, "Assignee not found or inactive")
    capa = Capa(deviation_id=dev.id, action_plan=payload.action_plan, action_type=payload.action_type,
                assigned_to=assignee.id, due_date=payload.due_date, status="OPEN")
    db.add(capa)
    db.flush()
    log_action(db, user, "CAPA_CREATED", "capa", capa.id, None, snapshot(capa))
    if dev.status in ("OPEN", "INVESTIGATING"):
        old = snapshot(dev)
        dev.status = "CAPA_IN_PROGRESS"
        db.flush()
        log_action(db, user, "DEVIATION_UPDATED", "deviation", dev.id, old, snapshot(dev))
    db.commit()
    return capa_out(capa)


@router.put("/{capa_id}")
def update_capa(capa_id: int, payload: CapaUpdateIn, db: Session = Depends(get_db),
                user: User = Depends(require_roles("QA_OFFICER"))):
    c = db.get(Capa, capa_id)
    if c is None:
        raise HTTPException(404, "CAPA not found")
    if c.status != "OPEN":
        raise HTTPException(409, f"A {c.status} CAPA can no longer be edited")
    data = payload.model_dump(exclude_unset=True)
    if data.get("assigned_to"):
        a = db.get(User, data["assigned_to"])
        if a is None or not a.is_active:
            raise HTTPException(422, "Assignee not found or inactive")
    old = snapshot(c)
    for key, value in data.items():
        if value is not None:
            setattr(c, key, value)
    db.flush()
    log_action(db, user, "CAPA_UPDATED", "capa", c.id, old, snapshot(c))
    db.commit()
    return capa_out(c)


@router.post("/{capa_id}/complete")
def complete_capa(capa_id: int, payload: CapaCompleteIn, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    c = db.get(Capa, capa_id)
    if c is None:
        raise HTTPException(404, "CAPA not found")
    if user.id != c.assigned_to and user.role not in ("QA_OFFICER", "ADMIN"):
        raise HTTPException(403, "Only the assignee or a QA Officer can complete this CAPA")
    if c.status != "OPEN":
        raise HTTPException(409, f"CAPA is already {c.status}")
    old = snapshot(c)
    c.completion_notes = payload.completion_notes
    c.status = "COMPLETED"
    c.completed_at = utcnow()
    db.flush()
    log_action(db, user, "CAPA_COMPLETED", "capa", c.id, old, snapshot(c))
    db.commit()
    return capa_out(c)


@router.post("/{capa_id}/verify")
def verify_capa(capa_id: int, db: Session = Depends(get_db),
                user: User = Depends(require_roles("QA_OFFICER"))):
    c = db.get(Capa, capa_id)
    if c is None:
        raise HTTPException(404, "CAPA not found")
    if c.status != "COMPLETED":
        raise HTTPException(409, "Only COMPLETED CAPAs can be verified")
    old = snapshot(c)
    c.status = "VERIFIED"
    c.verified_by = user.id
    db.flush()
    log_action(db, user, "CAPA_VERIFIED", "capa", c.id, old, snapshot(c))
    db.commit()
    return capa_out(c)
