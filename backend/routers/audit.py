"""/api/audit - read-only audit trail for administrators."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import cast, String, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuditLog, User
from ..security import require_roles
from ..serializers import audit_out

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
def list_audit_logs(q: str | None = Query(default=None, max_length=100),
                    entity_type: str | None = None, action: str | None = None,
                    user_id: int | None = None, date_from: date | None = None,
                    date_to: date | None = None, limit: int = Query(default=50, ge=1, le=500),
                    offset: int = Query(default=0, ge=0),
                    db: Session = Depends(get_db), _: User = Depends(require_roles())):
    query = db.query(AuditLog).outerjoin(User, AuditLog.user_id == User.id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(AuditLog.action.ilike(like), AuditLog.entity_type.ilike(like),
                                 User.full_name.ilike(like), User.email.ilike(like),
                                 cast(AuditLog.entity_id, String).ilike(like)))
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if date_from:
        query = query.filter(AuditLog.timestamp >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(AuditLog.timestamp < datetime.combine(date_to + timedelta(days=1),
                                                                   datetime.min.time()))
    total = query.count()
    items = query.order_by(AuditLog.timestamp.desc(), AuditLog.id.desc()).offset(offset).limit(limit).all()
    facets = {
        "actions": [a for (a,) in db.query(AuditLog.action).distinct().order_by(AuditLog.action).all()],
        "entity_types": [e for (e,) in db.query(AuditLog.entity_type).distinct()
                         .order_by(AuditLog.entity_type).all()],
    }
    return {"total": total, "limit": limit, "offset": offset, "items": [audit_out(a) for a in items],
            "facets": facets}
