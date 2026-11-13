"""Pydantic v2 input schemas (strict validation; unknown fields are rejected)."""
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Role = Literal["LAB_TECHNICIAN", "QC_OFFICER", "QA_OFFICER", "ADMIN"]
BatchStatus = Literal["QUARANTINED", "TESTING", "APPROVED", "REJECTED"]
Severity = Literal["MINOR", "MAJOR", "CRITICAL"]
DeviationStatus = Literal["OPEN", "INVESTIGATING", "CAPA_IN_PROGRESS", "CLOSED"]
CapaType = Literal["CORRECTIVE", "PREVENTIVE"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---- Auth / users ----
class RegisterIn(Strict):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class LoginIn(Strict):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class UserCreateIn(RegisterIn):
    role: Role = "LAB_TECHNICIAN"


class UserUpdateIn(Strict):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    role: Optional[Role] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=72)


# ---- Products / batches ----
class ProductIn(Strict):
    product_code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=150)
    dosage_form: str = Field(min_length=2, max_length=60)
    active_ingredient: str = Field(min_length=2, max_length=150)


class ProductUpdateIn(Strict):
    name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    dosage_form: Optional[str] = Field(default=None, min_length=2, max_length=60)
    active_ingredient: Optional[str] = Field(default=None, min_length=2, max_length=150)


class BatchIn(Strict):
    batch_number: str = Field(min_length=3, max_length=50)
    product_id: int = Field(gt=0)
    manufacturing_date: date
    expiry_date: date
    quantity: int = Field(gt=0, le=100_000_000)

    @model_validator(mode="after")
    def _check_dates(self):
        if self.expiry_date <= self.manufacturing_date:
            raise ValueError("expiry_date must be after manufacturing_date")
        if self.manufacturing_date > date.today():
            raise ValueError("manufacturing_date cannot be in the future")
        return self


class BatchUpdateIn(Strict):
    manufacturing_date: Optional[date] = None
    expiry_date: Optional[date] = None
    quantity: Optional[int] = Field(default=None, gt=0, le=100_000_000)


class BatchStatusIn(Strict):
    status: BatchStatus
    reason: Optional[str] = Field(default=None, max_length=1000)


# ---- Samples / tests ----
class SampleIn(Strict):
    batch_id: int = Field(gt=0)
    sample_code: Optional[str] = Field(default=None, min_length=3, max_length=40)


class TestDefinitionIn(Strict):
    __test__ = False
    product_id: int = Field(gt=0)
    test_name: str = Field(min_length=2, max_length=120)
    min_limit: Optional[float] = None
    max_limit: Optional[float] = None
    unit: str = Field(default="", max_length=30)
    mandatory: bool = True

    @model_validator(mode="after")
    def _check_limits(self):
        if self.min_limit is None and self.max_limit is None:
            raise ValueError("At least one of min_limit / max_limit is required")
        if self.min_limit is not None and self.max_limit is not None and self.min_limit > self.max_limit:
            raise ValueError("min_limit must be <= max_limit")
        return self


class TestDefinitionUpdateIn(Strict):
    __test__ = False
    test_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    min_limit: Optional[float] = None
    max_limit: Optional[float] = None
    unit: Optional[str] = Field(default=None, max_length=30)
    mandatory: Optional[bool] = None


class TestResultIn(Strict):
    __test__ = False
    sample_id: int = Field(gt=0)
    test_definition_id: int = Field(gt=0)
    measured_value: float
    remarks: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("measured_value")
    @classmethod
    def _finite(cls, v: float) -> float:
        if v != v or v in (float("inf"), float("-inf")):
            raise ValueError("measured_value must be a finite number")
        return v


class FlagOosIn(Strict):
    severity: Severity = "MAJOR"
    description: Optional[str] = Field(default=None, max_length=2000)


# ---- Deviations / CAPA ----
class DeviationIn(Strict):
    batch_id: int = Field(gt=0)
    test_result_id: Optional[int] = Field(default=None, gt=0)
    severity: Severity = "MAJOR"
    description: str = Field(min_length=5, max_length=2000)


class DeviationUpdateIn(Strict):
    severity: Optional[Severity] = None
    description: Optional[str] = Field(default=None, min_length=5, max_length=2000)
    root_cause: Optional[str] = Field(default=None, max_length=2000)
    status: Optional[DeviationStatus] = None


class CapaIn(Strict):
    deviation_id: int = Field(gt=0)
    action_plan: str = Field(min_length=5, max_length=2000)
    action_type: CapaType = "CORRECTIVE"
    assigned_to: int = Field(gt=0)
    due_date: date

    @field_validator("due_date")
    @classmethod
    def _future(cls, v: date) -> date:
        if v < date.today():
            raise ValueError("due_date cannot be in the past")
        return v


class CapaUpdateIn(Strict):
    action_plan: Optional[str] = Field(default=None, min_length=5, max_length=2000)
    action_type: Optional[CapaType] = None
    assigned_to: Optional[int] = Field(default=None, gt=0)
    due_date: Optional[date] = None


class CapaCompleteIn(Strict):
    completion_notes: str = Field(min_length=5, max_length=2000)
