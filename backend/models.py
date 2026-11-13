"""ORM models for PharmaLab QMS (normalized, with FK + CHECK constraints)."""
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, CheckConstraint, Column, Date, DateTime, Float,
                        ForeignKey, Index, Integer, String, Text, UniqueConstraint, event)
from sqlalchemy.orm import relationship

from .database import Base

ROLES = ("LAB_TECHNICIAN", "QC_OFFICER", "QA_OFFICER", "ADMIN")
ROLE_TECH, ROLE_QC, ROLE_QA, ROLE_ADMIN = ROLES
BATCH_STATUSES = ("QUARANTINED", "TESTING", "APPROVED", "REJECTED")
SAMPLE_STATUSES = ("PENDING", "IN_PROGRESS", "COMPLETED")
TEST_STATUSES = ("PASS", "FAIL")
SEVERITIES = ("MINOR", "MAJOR", "CRITICAL")
DEVIATION_STATUSES = ("OPEN", "INVESTIGATING", "CAPA_IN_PROGRESS", "CLOSED")
CAPA_TYPES = ("CORRECTIVE", "PREVENTIVE")
CAPA_STATUSES = ("OPEN", "COMPLETED", "VERIFIED")


def utcnow() -> datetime:
    """Naive UTC timestamp (portable across PostgreSQL / Azure SQL / SQLite)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _in(column: str, values) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(_in("role", ROLES), name="ck_users_role"),)

    id = Column(Integer, primary_key=True)
    full_name = Column(String(120), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="LAB_TECHNICIAN")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True)
    product_code = Column(String(40), nullable=False, unique=True, index=True)
    name = Column(String(150), nullable=False)
    dosage_form = Column(String(60), nullable=False)
    active_ingredient = Column(String(150), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    batches = relationship("Batch", back_populates="product")
    test_definitions = relationship("TestDefinition", back_populates="product",
                                    order_by="TestDefinition.id")


class Batch(Base):
    __tablename__ = "batches"
    __table_args__ = (
        CheckConstraint(_in("status", BATCH_STATUSES), name="ck_batches_status"),
        CheckConstraint("expiry_date > manufacturing_date", name="ck_batches_dates"),
        CheckConstraint("quantity > 0", name="ck_batches_quantity"),
    )

    id = Column(Integer, primary_key=True)
    batch_number = Column(String(50), nullable=False, unique=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    manufacturing_date = Column(Date, nullable=False)
    expiry_date = Column(Date, nullable=False)
    quantity = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="QUARANTINED", index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    product = relationship("Product", back_populates="batches")
    creator = relationship("User", foreign_keys=[created_by])
    samples = relationship("Sample", back_populates="batch", order_by="Sample.id")
    deviations = relationship("Deviation", back_populates="batch", order_by="Deviation.id")


class TestDefinition(Base):
    __test__ = False  # not a pytest class
    __tablename__ = "test_definitions"
    __table_args__ = (
        UniqueConstraint("product_id", "test_name", name="uq_testdef_product_name"),
        CheckConstraint("min_limit IS NOT NULL OR max_limit IS NOT NULL", name="ck_testdef_has_limit"),
        CheckConstraint("min_limit IS NULL OR max_limit IS NULL OR min_limit <= max_limit",
                        name="ck_testdef_limits"),
    )

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    test_name = Column(String(120), nullable=False)
    min_limit = Column(Float, nullable=True)
    max_limit = Column(Float, nullable=True)
    unit = Column(String(30), nullable=False, default="")
    mandatory = Column(Boolean, nullable=False, default=True)

    product = relationship("Product", back_populates="test_definitions")
    results = relationship("TestResult", back_populates="test_definition")


class Sample(Base):
    __tablename__ = "samples"
    __table_args__ = (CheckConstraint(_in("status", SAMPLE_STATUSES), name="ck_samples_status"),)

    id = Column(Integer, primary_key=True)
    sample_code = Column(String(40), nullable=False, unique=True, index=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False, index=True)
    collected_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    collected_at = Column(DateTime, nullable=False, default=utcnow)
    status = Column(String(20), nullable=False, default="PENDING")

    batch = relationship("Batch", back_populates="samples")
    collector = relationship("User", foreign_keys=[collected_by])
    results = relationship("TestResult", back_populates="sample", order_by="TestResult.id")


class TestResult(Base):
    __test__ = False
    __tablename__ = "test_results"
    __table_args__ = (
        UniqueConstraint("sample_id", "test_definition_id", name="uq_result_sample_test"),
        CheckConstraint(_in("auto_status", TEST_STATUSES), name="ck_results_status"),
    )

    id = Column(Integer, primary_key=True)
    sample_id = Column(Integer, ForeignKey("samples.id"), nullable=False, index=True)
    test_definition_id = Column(Integer, ForeignKey("test_definitions.id"), nullable=False, index=True)
    measured_value = Column(Float, nullable=False)
    auto_status = Column(String(4), nullable=False)
    tested_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    report_blob_url = Column(String(500), nullable=True)
    remarks = Column(Text, nullable=True)
    tested_at = Column(DateTime, nullable=False, default=utcnow, index=True)

    sample = relationship("Sample", back_populates="results")
    test_definition = relationship("TestDefinition", back_populates="results")
    tester = relationship("User", foreign_keys=[tested_by])
    verifier = relationship("User", foreign_keys=[verified_by])
    deviations = relationship("Deviation", back_populates="test_result")


class Deviation(Base):
    __tablename__ = "deviations"
    __table_args__ = (
        CheckConstraint(_in("severity", SEVERITIES), name="ck_deviations_severity"),
        CheckConstraint(_in("status", DEVIATION_STATUSES), name="ck_deviations_status"),
    )

    id = Column(Integer, primary_key=True)
    deviation_code = Column(String(40), nullable=False, unique=True, index=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False, index=True)
    test_result_id = Column(Integer, ForeignKey("test_results.id"), nullable=True)
    severity = Column(String(10), nullable=False, default="MAJOR")
    description = Column(Text, nullable=False)
    root_cause = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="OPEN", index=True)
    raised_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    closed_at = Column(DateTime, nullable=True)

    batch = relationship("Batch", back_populates="deviations")
    test_result = relationship("TestResult", back_populates="deviations")
    raiser = relationship("User", foreign_keys=[raised_by])
    capas = relationship("Capa", back_populates="deviation", order_by="Capa.id")


class Capa(Base):
    __tablename__ = "capas"
    __table_args__ = (
        CheckConstraint(_in("action_type", CAPA_TYPES), name="ck_capas_type"),
        CheckConstraint(_in("status", CAPA_STATUSES), name="ck_capas_status"),
    )

    id = Column(Integer, primary_key=True)
    deviation_id = Column(Integer, ForeignKey("deviations.id"), nullable=False, index=True)
    action_plan = Column(Text, nullable=False)
    action_type = Column(String(12), nullable=False, default="CORRECTIVE")
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=False)
    due_date = Column(Date, nullable=False)
    completion_notes = Column(Text, nullable=True)
    status = Column(String(12), nullable=False, default="OPEN", index=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    completed_at = Column(DateTime, nullable=True)
    verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    deviation = relationship("Deviation", back_populates="capas")
    assignee = relationship("User", foreign_keys=[assigned_to])
    verifier = relationship("User", foreign_keys=[verified_by])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(60), nullable=False, index=True)
    entity_type = Column(String(40), nullable=False, index=True)
    entity_id = Column(Integer, nullable=True)
    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    timestamp = Column(DateTime, nullable=False, default=utcnow, index=True)

    user = relationship("User", foreign_keys=[user_id])


Index("ix_audit_entity", AuditLog.entity_type, AuditLog.entity_id)


# --- Audit log immutability (application level; schema.sql adds a DB-level trigger) -------------
@event.listens_for(AuditLog, "before_update")
def _audit_no_update(mapper, connection, target):
    raise ValueError("audit_logs are immutable and cannot be updated")


@event.listens_for(AuditLog, "before_delete")
def _audit_no_delete(mapper, connection, target):
    raise ValueError("audit_logs are immutable and cannot be deleted")
