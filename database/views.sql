-- PharmaLab QMS – analytical views for Power BI / SQL reporting (PostgreSQL)
-- Azure SQL Database version: database/views_azure_sql.sql (identical columns, T-SQL syntax).
-- Run after the tables exist (the API creates them on first start).

-- 1) One row per batch: status, test progress and open deviations --------------------------
CREATE OR REPLACE VIEW vw_batch_quality_summary AS
SELECT
    b.id                                   AS batch_id,
    b.batch_number,
    p.product_code,
    p.name                                 AS product_name,
    p.dosage_form,
    b.status                               AS batch_status,
    b.manufacturing_date,
    b.expiry_date,
    (b.expiry_date - CURRENT_DATE)         AS days_to_expiry,
    b.quantity,
    COUNT(tr.id)                           AS tests_recorded,
    COALESCE(SUM(CASE WHEN tr.auto_status = 'PASS' THEN 1 ELSE 0 END), 0) AS tests_passed,
    COALESCE(SUM(CASE WHEN tr.auto_status = 'FAIL' THEN 1 ELSE 0 END), 0) AS tests_failed,
    ROUND(100.0 * SUM(CASE WHEN tr.auto_status = 'PASS' THEN 1 ELSE 0 END) / NULLIF(COUNT(tr.id), 0), 2) AS pass_rate_pct,
    (SELECT COUNT(*) FROM deviations d WHERE d.batch_id = b.id AND d.status <> 'CLOSED') AS open_deviations
FROM batches b
JOIN products p              ON p.id = b.product_id
LEFT JOIN samples s          ON s.batch_id = b.id
LEFT JOIN test_results tr    ON tr.sample_id = s.id
GROUP BY b.id, b.batch_number, p.product_code, p.name, p.dosage_form, b.status,
         b.manufacturing_date, b.expiry_date, b.quantity;

-- 2) Pass rate per product and test ---------------------------------------------------------
CREATE OR REPLACE VIEW vw_test_pass_rates AS
SELECT
    p.product_code,
    p.name                                  AS product_name,
    td.test_name,
    td.unit,
    td.min_limit,
    td.max_limit,
    COUNT(tr.id)                            AS total_results,
    COALESCE(SUM(CASE WHEN tr.auto_status = 'PASS' THEN 1 ELSE 0 END), 0) AS passed,
    COALESCE(SUM(CASE WHEN tr.auto_status = 'FAIL' THEN 1 ELSE 0 END), 0) AS failed,
    ROUND(100.0 * SUM(CASE WHEN tr.auto_status = 'PASS' THEN 1 ELSE 0 END) / NULLIF(COUNT(tr.id), 0), 2) AS pass_rate_pct,
    AVG(tr.measured_value)                  AS avg_measured_value
FROM test_definitions td
JOIN products p          ON p.id = td.product_id
LEFT JOIN test_results tr ON tr.test_definition_id = td.id
GROUP BY p.product_code, p.name, td.test_name, td.unit, td.min_limit, td.max_limit;

-- 3) CAPA compliance: open / overdue / completed with due-date arithmetic --------------------
CREATE OR REPLACE VIEW vw_capa_compliance_tracker AS
SELECT
    c.id                         AS capa_id,
    d.deviation_code,
    b.batch_number,
    c.action_type,
    c.status                     AS capa_status,
    u.full_name                  AS assigned_to,
    c.due_date,
    CASE WHEN c.status = 'OPEN' AND c.due_date < CURRENT_DATE THEN 1 ELSE 0 END AS is_overdue,
    CASE WHEN c.status = 'OPEN' AND c.due_date < CURRENT_DATE THEN (CURRENT_DATE - c.due_date) ELSE 0 END AS days_overdue,
    c.created_at,
    c.completed_at
FROM capas c
JOIN deviations d ON d.id = c.deviation_id
JOIN batches b    ON b.id = d.batch_id
JOIN users u      ON u.id = c.assigned_to;

-- 4) OOS deviation pipeline: every deviation with its originating failed result --------------
CREATE OR REPLACE VIEW vw_oos_deviation_pipeline AS
SELECT
    d.deviation_code,
    d.severity,
    d.status                     AS deviation_status,
    b.batch_number,
    p.name                       AS product_name,
    td.test_name,
    tr.measured_value,
    td.min_limit,
    td.max_limit,
    td.unit,
    d.created_at                 AS raised_at,
    d.closed_at,
    ru.full_name                 AS raised_by,
    (SELECT COUNT(*) FROM capas c WHERE c.deviation_id = d.id) AS capa_count,
    (SELECT COUNT(*) FROM capas c WHERE c.deviation_id = d.id AND c.status = 'VERIFIED') AS capa_verified
FROM deviations d
JOIN batches b                 ON b.id = d.batch_id
JOIN products p                ON p.id = b.product_id
JOIN users ru                  ON ru.id = d.raised_by
LEFT JOIN test_results tr      ON tr.id = d.test_result_id
LEFT JOIN test_definitions td  ON td.id = tr.test_definition_id;
