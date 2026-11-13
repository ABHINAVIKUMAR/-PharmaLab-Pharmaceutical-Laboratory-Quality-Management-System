import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Layers,
  FlaskConical,
  SlidersHorizontal,
  ClipboardCheck,
  AlertTriangle,
  ShieldAlert,
  FileSearch,
  BarChart3,
  Users,
  Settings,
  ShieldCheck,
  Bell,
  Menu,
  X,
} from "lucide-react";

const NAVIGATION_ITEMS = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
  { name: "Products", path: "/products", icon: Package },
  { name: "Medicine Batches", path: "/batches", icon: Layers },
  { name: "Samples", path: "/samples", icon: FlaskConical },
  { name: "Test Management", path: "/tests", icon: SlidersHorizontal },
  { name: "Test Results", path: "/test-results", icon: ClipboardCheck },
  { name: "Deviations", path: "/deviations", icon: AlertTriangle },
  { name: "CAPA", path: "/capa", icon: ShieldAlert },
  { name: "Audit Logs", path: "/audit-logs", icon: FileSearch },
  { name: "Reports", path: "/reports", icon: BarChart3 },
  { name: "Users", path: "/users", icon: Users },
  { name: "Settings", path: "/settings", icon: Settings },
];

const MainLayout = ({ activeRole, setActiveRole }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-slate-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-[#0f172a] text-slate-200 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800">
          <div
            onClick={() => navigate("/")}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-sky-500 flex items-center justify-center text-white shadow-sm">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white">
                Pharma<span className="text-sky-400">Lab</span>
              </span>
              <span className="block text-[10px] uppercase tracking-widest text-slate-400">
                Cloud QMS Platform
              </span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-sky-500/15 text-sky-400 border-l-4 border-sky-400 pl-2.5"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 m-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2 text-sky-400 font-semibold mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Academic Prototype</span>
          </div>
          <p className="leading-relaxed text-[11px]">
            Azure SQL + FastAPI + React QMS. Non-validated academic build.
          </p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                Pharmaceutical Quality Control & Batch Release Portal
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                Automated Specification Evaluation & CAPA Governance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <span className="text-xs text-slate-500 font-medium">Active Role:</span>
              <select
                value={activeRole}
                onChange={(e) => setActiveRole(e.target.value)}
                className="text-xs font-semibold text-sky-700 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="Administrator">Administrator</option>
                <option value="Laboratory Technician">Laboratory Technician</option>
                <option value="QC Officer">QC Officer</option>
                <option value="QA Officer">QA Officer</option>
              </select>
            </div>

            <button
              onClick={() => navigate("/deviations")}
              title="View Quality Alerts & Deviations"
              className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
