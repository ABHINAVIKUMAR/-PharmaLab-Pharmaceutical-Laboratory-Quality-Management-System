"""Audit trail helper: writes immutable DB rows + structured log lines (21 CFR Part 11 inspired)."""
import json
import logging
from datetime import date, datetime
from logging.handlers import RotatingFileHandler

from sqlalchemy.orm import Session

from .config import settings
from .models import AuditLog

logger = logging.getLogger("pharmalab.audit")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    logger.addHandler(logging.StreamHandler())
    try:
        settings.LOG_DIR.mkdir(parents=True, exist_ok=True)
        _fh = RotatingFileHandler(settings.LOG_DIR / "audit.log", maxBytes=2_000_000, backupCount=3,
                                  encoding="utf-8")
        _fh.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
        logger.addHandler(_fh)
    except OSError:  # read-only file systems (e.g. some PaaS) -> console only
        pass

_SENSITIVE = {"hashed_password"}


def _jsonable(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def snapshot(obj) -> dict | None:
    """Column snapshot of an ORM object as a JSON-safe dict (secrets excluded)."""
    if obj is None:
        return None
    return {c.key: _jsonable(getattr(obj, c.key)) for c in obj.__table__.columns if c.key not in _SENSITIVE}


def log_action(db: Session, user, action: str, entity_type: str, entity_id: int | None,
               old=None, new=None, timestamp: datetime | None = None) -> AuditLog:
    """Add an audit row to the *current* transaction (committed together with the change itself)."""
    entry = AuditLog(
        user_id=getattr(user, "id", None),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=old,
        new_value=new,
    )
    if timestamp is not None:
        entry.timestamp = timestamp
    db.add(entry)
    logger.info(json.dumps({
        "user": getattr(user, "email", None), "action": action,
        "entity": f"{entity_type}:{entity_id}",
    }))
    return entry


def log_change(db: Session, user, action: str, entity_type: str, obj, new: dict | None = None,
               ts: datetime | None = None) -> AuditLog:
    """Audit helper for objects that may not have an id yet (flushes first). Used by the seed script."""
    db.flush()
    state = snapshot(obj) or {}
    if new:
        state = {**state, **new}
    return log_action(db, user, action, entity_type, getattr(obj, "id", None), None, state, timestamp=ts)
