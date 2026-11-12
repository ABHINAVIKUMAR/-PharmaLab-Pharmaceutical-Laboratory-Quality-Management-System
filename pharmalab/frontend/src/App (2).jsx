import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard";
import ModulePlaceholder from "./pages/ModulePlaceholder";

const App = () => {
  const [activeRole, setActiveRole] = useState("QA Officer");

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<MainLayout activeRole={activeRole} setActiveRole={setActiveRole} />}
        >
          <Route index element={<Dashboard activeRole={activeRole} />} />
          <Route
            path="products"
            element={
              <ModulePlaceholder
                title="Module 2: Pharmaceutical Product Management"
                phase="Phase 5"
                description="Manage registered formulations, dosage forms, strengths, and manufacturer specifications."
                fields={["Product ID (PK)", "Product Name", "Manufacturer", "Dosage Form", "Strength", "Description"]}
                allowedRoles={["Administrator", "QC Officer", "QA Officer"]}
                activeRole={activeRole}
              />
            }
          />
          <Route
            path="batches"
            element={
              <ModulePlaceholder
                title="Module 3: Medicine Batch Management"
                phase="Phase 5"
                description="Create medicine batches, generate unique batch numbers, and track manufacturing/expiry dates."
                fields={["Batch ID (PK)", "Batch Number (Unique)", "Product ID (FK)", "Manufacturing Date", "Expiry Date", "Batch Status"]}
                allowedRoles={["Administrator", "QC Officer", "QA Officer"]}
                activeRole={activeRole}
              />
            }
          />
          <Route
            path="samples"
            element={
              <ModulePlaceholder
                title="Module 4: Laboratory Sample Management"
                phase="Phase 6"
                description="Register physical samples drawn from medicine batches and assign laboratory technicians."
                fields={["Sample ID (PK)", "Unique Sample Code", "Batch ID (FK)", "Collection Date", "Assigned Technician (FK)", "Testing Status"]}
                allowedRoles={["Administrator", "Laboratory Technician", "QC Officer"]}
                activeRole={activeRole}
              />
            }
          />
          <Route
            path="tests"
            element={
              <ModulePlaceholder
                title="Module 5: Laboratory Test Specifications"
                phase="Phase 6"
                description="Define analytical test methods, units of measurement, and min/max acceptable specification limits."
                fields={["Test ID (PK)", "Test Name", "Analytical Method", "Min Acceptable Value", "Max Acceptable Value", "Unit of Measurement"]}
                allowedRoles={["Administrator", "QC Officer", "QA Officer"]}
                activeRole={activeRole}
              />
            }
          />
          <Route
            path="test-results"
            element={
              <ModulePlaceholder
                title="Module 6: Test Result Submission & Automatic PASS/FAIL Engine"
                phase="Phase 7"
                description="Submit laboratory measurements with automated backend PASS/FAIL validation against specifications."
                fields={["Result ID (PK)", "Test ID (FK)", "Sample ID (FK)", "Measured Value", "Evaluation Status (PASS/FAIL)", "Tested By (FK)", "Testing Date"]}
                allowedRoles={["Laboratory Technician", "QC Officer"]}
                activeRole={activeRole}
              />
            }
          />
          <Route
            path="deviations"
            element={
              <ModulePlaceholder
                title="Module 7: Quality Deviation Management"
                phase="Phase 8"
                description="Log Out-of-Specification (OOS) events, classify severity, and manage root-cause investigations."
                fields={["Deviation ID (PK)", "Batch ID (FK)", "Severity Level", "Deviation Description", "Investigation Status", "Resolution Details"]}
                allowedRoles={["Administrator", "Laboratory Technician", "QC Officer", "QA Officer"]}
                activeRole={activeRole}
              />
            }
          />
          <Route
            path="capa"
            element={
              <ModulePlaceholder
                title="Module 8: Corrective and Preventive Actions (CAPA)"
                phase="Phase 8"
                description="Assign corrective and preventive actions, set target dates, and record QA verification."
                fields={["CAPA ID (PK)", "Deviation ID (FK)", "Responsible Employee (FK)", "Corrective Action", "Preventive Action", "Target Date", "Verification Status"]}
                allowedRoles={["Administrator", "QC Officer", "QA Officer"]}
                activeRole={activeRole}
              />
            }
          />
          <Route
            path="audit-logs"
            element={
              <ModulePlaceholder
                title="Module 9: Immutable Audit Trail"
                phase="Phase 9"
                description="Tamper-protected log of logins, product edits, batch updates, test submissions, and CAPA approvals."
                fields={["Audit ID (PK)", "User ID (FK)", "Action Type", "Entity Name", "Entity ID", "Timestamp (UTC)", "IP / Client Metadata"]}
                allowedRoles={["Administrator", "QA Officer"]}
                activeRole={activeRole}
              />
            }
          />
          <Route
            path="reports"
            element={
              <ModulePlaceholder
                title="Module 10: Quality Reports, CSV Exports & Power BI Analytics"
                phase="Phase 9"
                description="Filterable batch quality certificates, PASS/FAIL trend analytics, and CSV exports."
                fields={["Date Range Filter", "Batch Quality Report", "PASS/FAIL Trend Export", "Deviation & CAPA Summary", "Power BI SQL Views"]}
                allowedRoles={["Administrator", "QC Officer", "QA Officer"]}
                activeRole={activeRole}
              />
            }
          />
          <Route
            path="users"
            element={
              <ModulePlaceholder
                title="Module 1: User Authentication & RBAC Administration"
                phase="Phase 3"
                description="Manage laboratory personnel accounts, bcrypt password hashes, JWT sessions, and role assignments."
                fields={["User ID (PK)", "Full Name", "Email (Unique)", "Password Hash", "Role ID (FK)", "Account Status"]}
                allowedRoles={["Administrator"]}
                activeRole={activeRole}
              />
            }
          />
          <Route
            path="settings"
            element={
              <ModulePlaceholder
                title="Cloud & Environment Configuration"
                phase="Phase 10"
                description="Azure SQL Database connection telemetry, Azure Blob Storage container settings, and system metadata."
                fields={["Azure SQL Pool Status", "Blob Storage Container", "JWT Token Expiry Policy", "Audit Retention Policy"]}
                allowedRoles={["Administrator"]}
                activeRole={activeRole}
              />
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
