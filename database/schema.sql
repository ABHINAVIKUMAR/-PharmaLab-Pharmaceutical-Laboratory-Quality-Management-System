-- PharmaLab QMS – PostgreSQL schema (mirrors backend/models.py)
-- The API creates these tables automatically on start-up (SQLAlchemy create_all);
-- use this file to create/inspect the schema manually or to review it with an examiner.
-- On Azure SQL Database the same tables are created by the API (SQLAlchemy) when DATABASE_URL points
-- at the Azure SQL server; then run database/views_azure_sql.sql for the Power BI views.

CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    full_name        VARCHAR(120)  NOT NULL,
    email            VARCHAR(255)  NOT NULL UNIQUE,
    hashed_password  VARCHAR(255)  NOT NULL,
    role             VARCHAR(20)   NOT NULL
                     CONSTRAINT ck_users_role CHECK (role IN ('LAB_TECHNICIAN','QC_OFFICER','QA_OFFICER','ADMIN')),
    is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id                 SERIAL PRIMARY KEY,
    product_code       VARCHAR(40)  NOT NULL UNIQUE,
    name               VARCHAR(150) NOT NULL,
    dosage_form        VARCHAR(60)  NOT NULL,
    active_ingredient  VARCHAR(150) NOT NULL,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batches (
    id                  SERIAL PRIMARY KEY,
    batch_number        VARCHAR(50) NOT NULL UNIQUE,
    product_id          INTEGER     NOT NULL REFERENCES products(id),
    manufacturing_date  DATE        NOT NULL,
    expiry_date         DATE        NOT NULL,
    quantity            INTEGER     NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'QUARANTINED',
    created_by          INTEGER     NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_batches_status   CHECK (status IN ('QUARANTINED','TESTING','APPROVED','REJECTED')),
    CONSTRAINT ck_batches_dates    CHECK (expiry_date > manufacturing_date),
    CONSTRAINT ck_batches_quantity CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS ix_batches_product ON batches(product_id);
CREATE INDEX IF NOT EXISTS ix_batches_status  ON batches(status);

CREATE TABLE IF NOT EXISTS test_definitions (
    id          SERIAL PRIMARY KEY,
    product_id  INTEGER      NOT NULL REFERENCES products(id),
    test_name   VARCHAR(120) NOT NULL,
    min_limit   DOUBLE PRECISION,              -- NULL = no lower limit
    max_limit   DOUBLE PRECISION,              -- NULL = no upper limit
    unit        VARCHAR(30)  NOT NULL DEFAULT '',
    mandatory   BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_testdef_has_limit CHECK (min_limit IS NOT NULL OR max_limit IS NOT NULL),
    CONSTRAINT ck_testdef_limits    CHECK (min_limit IS NULL OR max_limit IS NULL OR min_limit <= max_limit),
    CONSTRAINT uq_testdef_product_name UNIQUE (product_id, test_name)
);

CREATE TABLE IF NOT EXISTS samples (
    id            SERIAL PRIMARY KEY,
    sample_code   VARCHAR(40) NOT NULL UNIQUE,
    batch_id      INTEGER     NOT NULL REFERENCES batches(id),
    collected_by  INTEGER     NOT NULL REFERENCES users(id),
    collected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    CONSTRAINT ck_samples_status CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED'))
);
CREATE INDEX IF NOT EXISTS ix_samples_batch ON samples(batch_id);

CREATE TABLE IF NOT EXISTS test_results (
    id                  SERIAL PRIMARY KEY,
    sample_id           INTEGER     NOT NULL REFERENCES samples(id),
    test_definition_id  INTEGER     NOT NULL REFERENCES test_definitions(id),
    measured_value      DOUBLE PRECISION NOT NULL,
    auto_status         VARCHAR(4)  NOT NULL,
    tested_by           INTEGER     NOT NULL REFERENCES users(id),
    verified_by         INTEGER     REFERENCES users(id),
    verified_at         TIMESTAMPTZ,
    report_blob_url     VARCHAR(500),
    remarks             TEXT,
    tested_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_results_status CHECK (auto_status IN ('PASS','FAIL')),
    CONSTRAINT uq_result_sample_test UNIQUE (sample_id, test_definition_id)
);
CREATE INDEX IF NOT EXISTS ix_results_status ON test_results(auto_status);
CREATE INDEX IF NOT EXISTS ix_results_tested_at ON test_results(tested_at);

CREATE TABLE IF NOT EXISTS deviations (
    id               SERIAL PRIMARY KEY,
    deviation_code   VARCHAR(40) NOT NULL UNIQUE,
    batch_id         INTEGER     NOT NULL REFERENCES batches(id),
    test_result_id   INTEGER     REFERENCES test_results(id),
    severity         VARCHAR(10) NOT NULL,
    description      TEXT        NOT NULL,
    root_cause       TEXT,
    status           VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    raised_by        INTEGER     NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at        TIMESTAMPTZ,
    CONSTRAINT ck_deviations_severity CHECK (severity IN ('MINOR','MAJOR','CRITICAL')),
    CONSTRAINT ck_deviations_status   CHECK (status IN ('OPEN','INVESTIGATING','CAPA_IN_PROGRESS','CLOSED'))
);
CREATE INDEX IF NOT EXISTS ix_deviations_batch  ON deviations(batch_id);
CREATE INDEX IF NOT EXISTS ix_deviations_status ON deviations(status);

CREATE TABLE IF NOT EXISTS capas (
    id                SERIAL PRIMARY KEY,
    deviation_id      INTEGER     NOT NULL REFERENCES deviations(id),
    action_plan       TEXT        NOT NULL,
    action_type       VARCHAR(12) NOT NULL,
    assigned_to       INTEGER     NOT NULL REFERENCES users(id),
    due_date          DATE        NOT NULL,
    completion_notes  TEXT,
    status            VARCHAR(12) NOT NULL DEFAULT 'OPEN',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMPTZ,
    verified_by       INTEGER     REFERENCES users(id),
    CONSTRAINT ck_capas_type   CHECK (action_type IN ('CORRECTIVE','PREVENTIVE')),
    CONSTRAINT ck_capas_status CHECK (status IN ('OPEN','COMPLETED','VERIFIED'))
);
CREATE INDEX IF NOT EXISTS ix_capas_deviation ON capas(deviation_id);
CREATE INDEX IF NOT EXISTS ix_capas_status    ON capas(status);

CREATE TABLE IF NOT EXISTS audit_logs (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER     REFERENCES users(id),
    action       VARCHAR(60) NOT NULL,
    entity_type  VARCHAR(40) NOT NULL,
    entity_id    INTEGER,
    old_value    JSONB,
    new_value    JSONB,
    timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_time   ON audit_logs(timestamp);

-- Audit log is append-only: block UPDATE / DELETE at database level (21 CFR Part 11 inspired).
CREATE OR REPLACE FUNCTION fn_audit_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_immutable ON audit_logs;
CREATE TRIGGER trg_audit_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION fn_audit_immutable();
