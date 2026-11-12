import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package,
  Layers,
  FlaskConical,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Download,
  RefreshCw,
  Activity,
  Calculator,
  Server,
} from "lucide-react";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { fetchDashboardSummary } from "../services/api";

const FALLBACK_SUMMARY = {
  kpis: {
    total_products: 48,
    total_batches: 134,
    total_samples: 412,
    samples_under_testing: 27,
    tests_passed: 358,
    tests_failed: 27,
    open_deviations: 6,
    pending_capa: 4,
  },
  monthly_analytics: [
    { month: "Jun 2026", passed: 54, failed: 4, total: 58, compliance_rate: 93.1 },
    { month: "Jul 2026", passed: 61, failed: 5, total: 66, compliance_rate: 92.4 },
    { month: "Aug 2026", passed: 58, failed: 3, total: 61, compliance_rate: 95.1 },
    { month: "Sep 2026", passed: 63, failed: 6, total: 69, compliance_rate: 91.3 },
    { month: "Oct 2026", passed: 60, failed: 4, total: 64, compliance_rate: 93.8 },
    { month: "Nov 2026", passed: 62, failed: 5, total: 67, compliance_rate: 92.5 },
  ],
  recent_test_results: [
    {
      result_id: "TR-2026-0891",
      sample_id: "SMP-2611-042",
      batch_number: "BTH-AMX-2611A",
      product_name: "Amoxicillin Trihydrate 500mg Capsules",
      test_name: "Aqueous Solution pH",
      spec_range: "6.5 - 7.5 pH",
      measured_value: 7.0,
      unit: "pH",
      status: "PASS",
      tested_by: "Rohan Sharma (Lab Tech)",
      tested_at: "2026-11-11 14:20",
    },
    {
      result_id: "TR-2026-0892",
      sample_id: "SMP-2611-045",
      batch_number: "BTH-PCM-2611C",
      product_name: "Paracetamol IV Infusion 10mg/mL",
      test_name: "Aqueous Solution pH",
      spec_range: "6.5 - 7.5 pH",
      measured_value: 8.0,
      unit: "pH",
      status: "FAIL",
      tested_by: "Ananya Verma (Lab Tech)",
      tested_at: "2026-11-11 15:05",
    },
    {
      result_id: "TR-2026-0893",
      sample_id: "SMP-2611-048",
      batch_number: "BTH-MET-2610B",
      product_name: "Metformin HCl 850mg Film-Coated Tablets",
      test_name: "HPLC Assay Potency",
      spec_range: "95.0 - 105.0 %",
      measured_value: 99.4,
      unit: "%",
      status: "PASS",
      tested_by: "Rohan Sharma (Lab Tech)",
      tested_at: "2026-11-11 16:12",
    },
    {
      result_id: "TR-2026-0894",
      sample_id: "SMP-2611-051",
      batch_number: "BTH-AZM-2611D",
      product_name: "Azithromycin Dihydrate 250mg Tablets",
      test_name: "Dissolution Rate (45 min)",
      spec_range: "80.0 - 100.0 %",
      measured_value: 74.2,
      unit: "%",
      status: "FAIL",
      tested_by: "Vikram Nair (Lab Tech)",
      tested_at: "2026-11-11 17:30",
    },
  ],
  batch_overview: [
    {
      batch_number: "BTH-AMX-2611A",
      product_name: "Amoxicillin Trihydrate 500mg Capsules",
      mfg_date: "2026-11-01",
      exp_date: "2028-10-31",
      status: "Released",
      samples_completed: 8,
      samples_total: 8,
    },
    {
      batch_number: "BTH-PCM-2611C",
      product_name: "Paracetamol IV Infusion 10mg/mL",
      mfg_date: "2026-11-04",
      exp_date: "2028-11-03",
      status: "Under Quarantine",
      samples_completed: 5,
      samples_total: 6,
    },
    {
      batch_number: "BTH-MET-2610B",
      product_name: "Metformin HCl 850mg Film-Coated Tablets",
      mfg_date: "2026-10-25",
      exp_date: "2029-10-24",
      status: "Testing in Progress",
      samples_completed: 4,
      samples_total: 6,
    },
  ],
  quality_alerts: [
    {
      alert_id: "DEV-2026-019",
      severity: "Critical",
      title: "Out-of-Specification (OOS) pH 8.0 detected in Paracetamol IV Infusion (Spec: 6.5–7.5)",
      batch_number: "BTH-PCM-2611C",
      timestamp: "15 mins ago",
    },
    {
      alert_id: "DEV-2026-018",
      severity: "Major",
      title: "Dissolution rate below 80% threshold (Measured: 74.2%) in Azithromycin 250mg",
      batch_number: "BTH-AZM-2611D",
      timestamp: "2 hours ago",
    },
  ],
  recent_activities: [
    {
      log_id: "AUD-99412",
      actor: "Ananya Verma",
      role: "Laboratory Technician",
      action: "Submitted pH test result (8.0 pH -> AUTO FAIL) for Sample SMP-2611-045",
      module: "Test Results",
      timestamp: "2026-11-11 15:05:19",
    },
    {
      log_id: "AUD-99411",
      actor: "Dr. Meera Krishnan",
      role: "QA Officer",
      action: "Initiated Deviation DEV-2026-019 and placed Batch BTH-PCM-2611C under Quarantine",
      module: "Deviations",
      timestamp: "2026-11-11 15:12:44",
    },
  ],
};

const Dashboard = ({ activeRole }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(FALLBACK_SUMMARY);
  const [apiConnected, setApiConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [simMin, setSimMin] = useState(6.5);
  const [simMax, setSimMax] = useState(7.5);
  const [simMeasured, setSimMeasured] = useState(7.0);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetchDashboardSummary();
      setData(res);
      setApiConnected(true);
    } catch {
      setApiConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const { kpis, monthly_analytics, recent_test_results, batch_overview, quality_alerts, recent_activities } = data;
  const passRate = (
    (kpis.tests_passed / Math.max(1, kpis.tests_passed + kpis.tests_failed)) *
    100
  ).toFixed(1);

  const filteredResults = recent_test_results.filter((item) =>
    statusFilter === "ALL" ? true : item.status === statusFilter
  );

  const simStatus =
    Number(simMeasured) >= Number(simMin) && Number(simMeasured) <= Number(simMax)
      ? "PASS"
      : "FAIL";

  const exportTestResultsCSV = () => {
    const headers = [
      "Result ID,Sample ID,Batch Number,Product Name,Test Name,Spec Range,Measured Value,Unit,Status,Tested By,Timestamp",
    ];
    const rows = recent_test_results.map(
      (r) =>
        `${r.result_id},${r.sample_id},${r.batch_number},"${r.product_name}","${r.test_name}","${r.spec_range}",${r.measured_value},${r.unit},${r.status},"${r.tested_by}",${r.tested_at}`
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "pharmalab_recent_test_results.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg ${
              apiConnected ? "bg-emerald-50 text-emerald-600" : "bg-sky-50 text-sky-600"
            }`}
          >
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                System Telemetry & Role Context: {activeRole}
              </h2>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  apiConnected
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {apiConnected
                  ? "Connected to FastAPI (/api/v1/dashboard/summary)"
                  : "Demo Preview Mode (Start FastAPI on port 8000 for live API)"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Overall Laboratory First-Time-Right (FTR) Specification Compliance:{" "}
              <strong className="text-slate-800">{passRate}%</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Telemetry
          </button>
          <button
            onClick={exportTestResultsCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export QC CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Products"
          value={kpis.total_products}
          subtitle="Active Formulations"
          icon={Package}
          accentColor="sky"
          onClick={() => navigate("/products")}
        />
        <StatCard
          title="Total Medicine Batches"
          value={kpis.total_batches}
          subtitle="Tracked in Manufacturing"
          icon={Layers}
          accentColor="indigo"
          onClick={() => navigate("/batches")}
        />
        <StatCard
          title="Total Samples"
          value={kpis.total_samples}
          subtitle="Registered in LIMS"
          icon={FlaskConical}
          accentColor="sky"
          onClick={() => navigate("/samples")}
        />
        <StatCard
          title="Samples Under Testing"
          value={kpis.samples_under_testing}
          subtitle="Active Bench Queue"
          icon={Clock}
          accentColor="amber"
          onClick={() => navigate("/samples")}
        />
        <StatCard
          title="Tests Passed"
          value={kpis.tests_passed}
          subtitle={`${passRate}% Specification Pass Rate`}
          icon={CheckCircle2}
          accentColor="emerald"
          onClick={() => navigate("/test-results")}
        />
        <StatCard
          title="Tests Failed (OOS)"
          value={kpis.tests_failed}
          subtitle="Requires Deviation Review"
          icon={XCircle}
          accentColor="rose"
          onClick={() => navigate("/test-results")}
        />
        <StatCard
          title="Open Deviations"
          value={kpis.open_deviations}
          subtitle="2 Critical, 4 Major/Minor"
          icon={AlertTriangle}
          accentColor="rose"
          onClick={() => navigate("/deviations")}
        />
        <StatCard
          title="Pending CAPA"
          value={kpis.pending_capa}
          subtitle="Corrective & Preventive Actions"
          icon={ShieldAlert}
          accentColor="amber"
          onClick={() => navigate("/capa")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Monthly Laboratory Testing & Specification Compliance
              </h3>
              <p className="text-xs text-slate-500">
                Comparison of Passed vs. Out-of-Specification (FAIL) sample tests over 6 months
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Passed
              </span>
              <span className="flex items-center gap-1.5 text-rose-700">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Failed (OOS)
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {monthly_analytics.map((item) => {
              const passWidth = Math.round((item.passed / item.total) * 100);
              const failWidth = 100 - passWidth;
              return (
                <div key={item.month} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-700">{item.month}</span>
                    <span className="text-slate-500">
                      <strong className="text-emerald-700">{item.passed} PASS</strong> /{" "}
                      <strong className="text-rose-600">{item.failed} FAIL</strong> (
                      {item.compliance_rate}% compliance)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${passWidth}%` }}
                      className="bg-emerald-500 h-full transition-all duration-300"
                    />
                    <div
                      style={{ width: `${failWidth}%` }}
                      className="bg-rose-500 h-full transition-all duration-300"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sky-600 mb-1">
              <Calculator className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Module 6 Engine Preview
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Automatic PASS / FAIL Evaluator
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Test how the backend evaluates quantitative measurements against min/max limits.
            </p>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Min Acceptable (pH)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={simMin}
                    onChange={(e) => setSimMin(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Max Acceptable (pH)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={simMax}
                    onChange={(e) => setSimMax(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Measured Lab Value
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={simMeasured}
                  onChange={(e) => setSimMeasured(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 block">Backend Evaluation:</span>
              <span className="text-xs font-medium text-slate-700">
                Spec: {simMin} – {simMax}
              </span>
            </div>
            <StatusBadge status={simStatus} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Recent Laboratory Test Results & Automatic Specification Verdicts
            </h3>
            <p className="text-xs text-slate-500">
              Real-time feed of analytical tests verified against pharmacopeial limits
            </p>
          </div>
          <div className="flex items-center gap-2">
            {["ALL", "PASS", "FAIL"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === status
                    ? "bg-sky-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Result / Sample ID</th>
                <th className="py-3 px-4">Product & Batch</th>
                <th className="py-3 px-4">Test Parameter</th>
                <th className="py-3 px-4">Spec Range</th>
                <th className="py-3 px-4 text-right">Measured</th>
                <th className="py-3 px-4 text-center">Evaluation</th>
                <th className="py-3 px-4">Tested By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredResults.map((row) => (
                <tr key={row.result_id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {row.result_id}
                    <span className="block text-[11px] font-normal text-slate-500">
                      {row.sample_id}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-slate-800">{row.product_name}</span>
                    <span className="block text-[11px] text-sky-600 font-semibold">
                      {row.batch_number}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 font-medium">{row.test_name}</td>
                  <td className="py-3 px-4 text-slate-600">{row.spec_range}</td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">
                    {row.measured_value} {row.unit}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {row.tested_by}
                    <span className="block text-[10px] text-slate-400">{row.tested_at}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">
            Medicine Batch Status Overview
          </h3>
          <div className="space-y-3">
            {batch_overview.map((batch) => (
              <div
                key={batch.batch_number}
                className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-700">
                    {batch.batch_number}
                  </span>
                  <StatusBadge status={batch.status} />
                </div>
                <p className="text-xs font-semibold text-slate-800">
                  {batch.product_name}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Exp: {batch.exp_date}</span>
                  <span>
                    Samples: {batch.samples_completed}/{batch.samples_total}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">
            Active Quality & Deviation Alerts
          </h3>
          <div className="space-y-3">
            {quality_alerts.map((alert) => (
              <div
                key={alert.alert_id}
                className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    {alert.alert_id} · {alert.batch_number}
                  </span>
                  <StatusBadge status={alert.severity} />
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{alert.title}</p>
                <span className="block text-[10px] text-slate-400">{alert.timestamp}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Recent Audit Log Events</h3>
            <Activity className="w-4 h-4 text-sky-600" />
          </div>
          <div className="space-y-3">
            {recent_activities.map((log) => (
              <div
                key={log.log_id}
                className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-1"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-900">{log.actor}</span>
                  <span className="text-sky-600 font-semibold">{log.role}</span>
                </div>
                <p className="text-xs text-slate-700">{log.action}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>{log.log_id}</span>
                  <span>{log.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
