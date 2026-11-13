"""/api/auth - registration, login, current user, and admin user management."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..audit import log_action, snapshot
from ..database import get_db
from ..models import User
from ..schemas import LoginIn, RegisterIn, UserCreateIn, UserUpdateIn
from ..security import (create_access_token, get_current_user, hash_password, require_roles,
                        verify_password)
from ..serializers import user_brief, user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    """Public self-registration. New accounts are always LAB_TECHNICIAN; admins can promote them."""
    email = payload.email.lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered")
    user = User(full_name=payload.full_name, email=email, hashed_password=hash_password(payload.password),
                role="LAB_TECHNICIAN")
    db.add(user)
    db.flush()
    log_action(db, user, "USER_REGISTERED", "user", user.id, None, snapshot(user))
    db.commit()
    return user_out(user)


@router.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(func.lower(User.email) == payload.email.lower()).first()
    if user is None or not verify_password(payload.password, user.hashed_password):
        log_action(db, None, "LOGIN_FAILED", "user", user.id if user else None, None,
                   {"email": payload.email.lower()})
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is deactivated")
    log_action(db, user, "LOGIN", "user", user.id, None, {"role": user.role})
    db.commit()
    return {"access_token": create_access_token(user), "token_type": "bearer", "role": user.role,
            "user": user_out(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.get("/assignees")
def assignees(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Active users that can be assigned CAPAs (visible to every authenticated user)."""
    users = db.query(User).filter(User.is_active.is_(True)).order_by(User.full_name).all()
    return [user_brief(u) for u in users]


# ---- Admin-only user management ----
@router.get("/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(require_roles())):
    return [user_out(u) for u in db.query(User).order_by(User.id).all()]


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreateIn, db: Session = Depends(get_db),
                admin: User = Depends(require_roles())):
    email = payload.email.lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered")
    user = User(full_name=payload.full_name, email=email, hashed_password=hash_password(payload.password),
                role=payload.role)
    db.add(user)
    db.flush()
    log_action(db, admin, "USER_CREATED", "user", user.id, None, snapshot(user))
    db.commit()
    return user_out(user)


@router.put("/users/{user_id}")
def update_user(user_id: int, payload: UserUpdateIn, db: Session = Depends(get_db),
                admin: User = Depends(require_roles())):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    data = payload.model_dump(exclude_unset=True)
    if user.id == admin.id and (data.get("is_active") is False or
                                ("role" in data and data["role"] != "ADMIN")):
        raise HTTPException(400, "You cannot deactivate or demote your own admin account")
    old = snapshot(user)
    password = data.pop("password", None)
    for key, value in data.items():
        if value is not None:
            setattr(user, key, value)
    if password:
        user.hashed_password = hash_password(password)
    db.flush()
    log_action(db, admin, "USER_UPDATED", "user", user.id, old, snapshot(user))
    db.commit()
    return user_out(user)
