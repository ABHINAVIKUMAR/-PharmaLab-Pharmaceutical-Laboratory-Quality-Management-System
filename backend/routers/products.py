"""/api/products - medicine product catalogue."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import log_action, snapshot
from ..database import get_db
from ..models import Product, User
from ..schemas import ProductIn, ProductUpdateIn
from ..security import get_current_user, require_roles
from ..serializers import product_out

router = APIRouter(prefix="/api/products", tags=["products"])
EDITORS = ("QC_OFFICER", "QA_OFFICER")


@router.get("")
def list_products(q: str | None = Query(default=None, max_length=100), db: Session = Depends(get_db),
                  _: User = Depends(get_current_user)):
    query = db.query(Product)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Product.name.ilike(like), Product.product_code.ilike(like),
                                 Product.active_ingredient.ilike(like)))
    return [product_out(p, with_specs=True) for p in query.order_by(Product.name).all()]


@router.get("/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(404, "Product not found")
    return product_out(p, with_specs=True)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductIn, db: Session = Depends(get_db),
                   user: User = Depends(require_roles(*EDITORS))):
    code = payload.product_code.upper()
    if db.query(Product).filter(Product.product_code == code).first():
        raise HTTPException(409, f"Product code {code} already exists")
    p = Product(product_code=code, name=payload.name, dosage_form=payload.dosage_form,
                active_ingredient=payload.active_ingredient)
    db.add(p)
    db.flush()
    log_action(db, user, "PRODUCT_CREATED", "product", p.id, None, snapshot(p))
    db.commit()
    return product_out(p, with_specs=True)


@router.put("/{product_id}")
def update_product(product_id: int, payload: ProductUpdateIn, db: Session = Depends(get_db),
                   user: User = Depends(require_roles(*EDITORS))):
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(404, "Product not found")
    old = snapshot(p)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(p, key, value)
    db.flush()
    log_action(db, user, "PRODUCT_UPDATED", "product", p.id, old, snapshot(p))
    db.commit()
    return product_out(p, with_specs=True)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db),
                   user: User = Depends(require_roles())):
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(404, "Product not found")
    if p.batches:
        raise HTTPException(409, "Cannot delete a product that has batches")
    old = snapshot(p)
    for spec in list(p.test_definitions):
        db.delete(spec)
    db.delete(p)
    log_action(db, user, "PRODUCT_DELETED", "product", product_id, old, None)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Product is referenced by other records")
