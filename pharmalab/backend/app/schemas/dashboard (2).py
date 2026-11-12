from typing import List
from pydantic import BaseModel


class KPIMetrics(BaseModel):
    total_products: int
    total_batches: int
    total_samples: int
    samples_under_testing: int
    tests_passed: int
    tests_failed: int
    open_deviations: int
    pending_capa: int


class MonthlyAnalyticsItem(BaseModel):
    month: str
    passed: int
    failed: int
    total: int
    compliance_rate: float


class RecentTestResultItem(BaseModel):
    result_id: str
    sample_id: str
    batch_number: str
    product_name: str
    test_name: str
    spec_range: str
    measured_value: float
    unit: str
    status: str
    tested_by: str
    tested_at: str


class BatchStatusItem(BaseModel):
    batch_number: str
    product_name: str
    mfg_date: str
    exp_date: str
    status: str
    samples_completed: int
    samples_total: int


class QualityAlertItem(BaseModel):
    alert_id: str
    severity: str
    title: str
    batch_number: str
    timestamp: str


class RecentActivityItem(BaseModel):
    log_id: str
    actor: str
    role: str
    action: str
    module: str
    timestamp: str


class DashboardSummaryResponse(BaseModel):
    kpis: KPIMetrics
    monthly_analytics: List[MonthlyAnalyticsItem]
    recent_test_results: List[RecentTestResultItem]
    batch_overview: List[BatchStatusItem]
    quality_alerts: List[QualityAlertItem]
    recent_activities: List[RecentActivityItem]
