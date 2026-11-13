"""End-to-end API tests (isolated temp SQLite DB + temp upload dir).

Run from the project root:   pytest backend/tests -v
"""
import os
import tempfile
from datetime import date, timedelta

_tmp = tempfile.mkdtemp(prefix="pharmalab-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.replace(os.sep, '/')}/test.db"
os.environ["UPLOAD_DIR"] = os.path.join(_tmp, "uploads")
os.environ["LOG_DIR"] = os.path.join(_tmp, "logs")
os.environ["AZURE_STORAGE_CONNECTION_STRING"] = ""
os.environ["AUTO_SEED"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402
from backend.seed import DEMO_PASSWORD, seed_if_empty  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        assert seed_if_empty() is True
        yield c


def login(client, email):
    res = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_login_and_rbac(client):
    bad = client.post("/api/auth/login", json={"email": "admin@pharmalab.io", "password": "wrong"})
    assert bad.status_code == 401
    assert client.get("/api/batches").status_code == 401

    tech, qc, qa, admin = (login(client, f"{r}@pharmalab.io") for r in ("tech", "qc", "qa", "admin"))
    me = client.get("/api/auth/me", headers=tech).json()
    assert me["role"] == "LAB_TECHNICIAN"

    product = {"product_code": "ZZ-1", "name": "Test Product", "dosage_form": "Tablet", "active_ingredient": "Testium"}
    assert client.post("/api/products", json=product, headers=tech).status_code == 403
    assert client.get("/api/audit", headers=qa).status_code == 403
    assert client.get("/api/audit", headers=tech).status_code == 403
    audit = client.get("/api/audit", headers=admin)
    assert audit.status_code == 200 and audit.json()["total"] > 0
    assert client.get("/api/auth/users", headers=qc).status_code == 403
    assert client.get("/api/auth/users", headers=admin).status_code == 200


def test_seed_dashboard(client):
    admin = login(client, "admin@pharmalab.io")
    data = client.get("/api/analytics/dashboard", headers=admin).json()
    k = data["kpis"]
    assert k["total_batches"] == 9
    assert k["open_deviations"] == 2
    assert k["overdue_capas"] == 1
    assert 0 < k["pass_rate"] < 100
    assert data["recent_oos"]


def test_full_qc_workflow(client):
    tech, qc, qa = (login(client, f"{r}@pharmalab.io") for r in ("tech", "qc", "qa"))
    today = date.today()

    # product + specs (QC)
    prod = client.post(
        "/api/products",
        json={"product_code": "IBU-400", "name": "Ibuprofen 400mg", "dosage_form": "Tablet", "active_ingredient": "Ibuprofen"},
        headers=qc,
    )
    assert prod.status_code == 201, prod.text
    pid = prod.json()["id"]
    d_assay = client.post(
        "/api/tests/definitions",
        json={"product_id": pid, "test_name": "Assay", "min_limit": 95, "max_limit": 105, "unit": "%", "mandatory": True},
        headers=qc,
    ).json()
    d_ph = client.post(
        "/api/tests/definitions",
        json={"product_id": pid, "test_name": "pH", "min_limit": 5.0, "max_limit": 7.0, "unit": "pH", "mandatory": True},
        headers=qc,
    ).json()

    # invalid dates rejected
    bad = client.post(
        "/api/batches",
        json={"batch_number": "IBU-BAD", "product_id": pid, "manufacturing_date": str(today), "expiry_date": str(today - timedelta(days=1)), "quantity": 10},
        headers=qc,
    )
    assert bad.status_code == 422

    batch = client.post(
        "/api/batches",
        json={
            "batch_number": "ibu-2611-001",
            "product_id": pid,
            "manufacturing_date": str(today - timedelta(days=5)),
            "expiry_date": str(today + timedelta(days=700)),
            "quantity": 5000,
        },
        headers=qc,
    )
    assert batch.status_code == 201, batch.text
    bid = batch.json()["id"]
    assert batch.json()["status"] == "QUARANTINED"

    # sample registration moves batch to TESTING
    sample = client.post("/api/samples", json={"batch_id": bid}, headers=tech)
    assert sample.status_code == 201, sample.text
    sid = sample.json()["id"]
    assert client.get(f"/api/batches/{bid}", headers=qc).json()["status"] == "TESTING"

    # automatic pass/fail evaluation
    ok = client.post("/api/tests/results", json={"sample_id": sid, "test_definition_id": d_assay["id"], "measured_value": 100.2}, headers=tech)
    assert ok.status_code == 201 and ok.json()["auto_status"] == "PASS"
    fail = client.post("/api/tests/results", json={"sample_id": sid, "test_definition_id": d_ph["id"], "measured_value": 7.6}, headers=tech)
    assert fail.status_code == 201 and fail.json()["auto_status"] == "FAIL" and fail.json()["is_oos"]
    fail_id = fail.json()["id"]
    # duplicate result on same sample/test is blocked
    dup = client.post("/api/tests/results", json={"sample_id": sid, "test_definition_id": d_ph["id"], "measured_value": 6.0}, headers=tech)
    assert dup.status_code == 409

    # four-eyes verification
    assert client.post(f"/api/tests/results/{ok.json()['id']}/verify", headers=qc).status_code == 200
    assert client.post(f"/api/tests/results/{ok.json()['id']}/verify", headers=qc).status_code == 409

    # release is blocked while a mandatory test failed
    blocked = client.post(f"/api/batches/{bid}/status", json={"status": "APPROVED"}, headers=qa)
    assert blocked.status_code == 409
    assert any("failed" in b for b in blocked.json()["detail"]["blockers"])

    # one-click deviation from OOS result
    dev = client.post(f"/api/tests/results/{fail_id}/flag-oos", json={"severity": "MAJOR"}, headers=qc)
    assert dev.status_code == 201, dev.text
    dev_id = dev.json()["id"]
    assert client.post(f"/api/tests/results/{fail_id}/flag-oos", json={}, headers=qc).status_code == 409

    # retest on a new sample passes -> latest result is PASS, but the deviation still blocks release
    sample2 = client.post("/api/samples", json={"batch_id": bid}, headers=tech).json()
    retest = client.post("/api/tests/results", json={"sample_id": sample2["id"], "test_definition_id": d_ph["id"], "measured_value": 6.4}, headers=tech)
    assert retest.json()["auto_status"] == "PASS"
    still = client.post(f"/api/batches/{bid}/status", json={"status": "APPROVED"}, headers=qa)
    assert still.status_code == 409
    assert any("deviation" in b.lower() for b in still.json()["detail"]["blockers"])
    # the retest result must also be QC-verified before release
    assert client.post(f"/api/tests/results/{retest.json()['id']}/verify", headers=qc).status_code == 200

    # deviation cannot close without root cause / CAPA
    assert client.put(f"/api/deviations/{dev_id}", json={"status": "CLOSED"}, headers=qa).status_code == 409
    assert client.put(f"/api/deviations/{dev_id}", json={"root_cause": "Buffer prepared with expired reagent; pH meter drift."}, headers=qc).status_code == 200
    assert client.put(f"/api/deviations/{dev_id}", json={"status": "INVESTIGATING"}, headers=qc).status_code == 200

    # CAPA lifecycle (QA assigns, assignee completes, QA verifies)
    assert client.get("/api/auth/assignees", headers=qa).status_code == 200
    tech_id = client.get("/api/auth/me", headers=tech).json()["id"]
    capa = client.post(
        "/api/capas",
        json={"deviation_id": dev_id, "action_plan": "Replace reagent stock and re-calibrate pH meter daily.", "action_type": "CORRECTIVE", "assigned_to": tech_id, "due_date": str(today + timedelta(days=7))},
        headers=qa,
    )
    assert capa.status_code == 201, capa.text
    capa_id = capa.json()["id"]
    assert client.get(f"/api/deviations/{dev_id}", headers=qa).json()["status"] == "CAPA_IN_PROGRESS"
    assert client.post(f"/api/capas/{capa_id}/verify", headers=qa).status_code == 409  # not completed yet
    assert client.put(f"/api/deviations/{dev_id}", json={"status": "CLOSED"}, headers=qa).status_code == 409
    done = client.post(f"/api/capas/{capa_id}/complete", json={"completion_notes": "Reagents replaced; calibration log updated."}, headers=tech)
    assert done.status_code == 200 and done.json()["status"] == "COMPLETED"
    assert client.post(f"/api/capas/{capa_id}/verify", headers=qa).json()["status"] == "VERIFIED"
    closed = client.put(f"/api/deviations/{dev_id}", json={"status": "CLOSED"}, headers=qa)
    assert closed.status_code == 200 and closed.json()["status"] == "CLOSED"

    # QC cannot approve; QA can once criteria are met
    assert client.post(f"/api/batches/{bid}/status", json={"status": "APPROVED"}, headers=qc).status_code == 403
    approved = client.post(f"/api/batches/{bid}/status", json={"status": "APPROVED"}, headers=qa)
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "APPROVED"

    # audit trail captured the lifecycle
    admin = login(client, "admin@pharmalab.io")
    logs = client.get("/api/audit", params={"q": "BATCH_APPROVED"}, headers=admin).json()
    assert logs["total"] >= 1


def test_spec_evaluation_boundaries():
    from backend.services.quality import evaluate

    assert evaluate(95.0, 95.0, 105.0) == "PASS"      # limits are inclusive
    assert evaluate(105.0, 95.0, 105.0) == "PASS"
    assert evaluate(94.99, 95.0, 105.0) == "FAIL"
    assert evaluate(105.01, 95.0, 105.0) == "FAIL"
    assert evaluate(999, None, 1000) == "PASS"          # one-sided specification
    assert evaluate(-1, 0, None) == "FAIL"


def test_file_upload_roundtrip(client):
    tech = login(client, "tech@pharmalab.io")
    up = client.post("/api/files/upload", files={"file": ("report.pdf", b"%PDF-1.4 test", "application/pdf")}, headers=tech)
    assert up.status_code == 201, up.text
    url = up.json()["url"]
    assert url.startswith("/api/files/") and up.json()["storage"] == "local"
    dl = client.get(url, headers=tech)
    assert dl.status_code == 200 and dl.content == b"%PDF-1.4 test"
    assert client.get(url).status_code == 401                       # downloads require a token
    bad = client.post("/api/files/upload", files={"file": ("evil.exe", b"MZ", "application/octet-stream")}, headers=tech)
    assert bad.status_code == 415
    assert client.get("/api/files/not-a-valid-stored-name", headers=tech).status_code == 400


def test_report_attached_to_result_is_audited(client):
    qc, tech = login(client, "qc@pharmalab.io"), login(client, "tech@pharmalab.io")
    results = client.get("/api/tests/results", params={"limit": 200}, headers=qc).json()
    own = next(r for r in results if r["tested_by_name"] == "Vikram Singh")
    up = client.post("/api/files/upload", data={"result_id": own["id"]},
                     files={"file": ("coa.pdf", b"%PDF-1.4 coa", "application/pdf")}, headers=tech)
    assert up.status_code == 201, up.text
    refreshed = client.get("/api/tests/results", params={"sample_id": own["sample_id"]}, headers=qc).json()
    assert any(r["id"] == own["id"] and r["report_blob_url"] == up.json()["url"] for r in refreshed)
