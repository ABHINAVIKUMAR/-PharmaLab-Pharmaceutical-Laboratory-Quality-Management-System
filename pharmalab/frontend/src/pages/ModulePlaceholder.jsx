import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Lock } from "lucide-react";

const ModulePlaceholder = ({ title, phase, description, fields, allowedRoles, activeRole }) => {
  const navigate = useNavigate();
  const isAuthorized = allowedRoles.includes(activeRole);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-sky-600 bg-sky-50 px-2.5 py-1 rounded-md mb-2">
            Scheduled for {phase}
          </span>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        </div>
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>

      <div
        className={`p-4 rounded-lg border flex items-center justify-between ${
          isAuthorized
            ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
            : "bg-rose-50/70 border-rose-200 text-rose-900"
        }`}
      >
        <div className="flex items-center gap-3">
          {isAuthorized ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <Lock className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <div>
            <p className="text-xs font-bold">
              Current Active Role: {activeRole} —{" "}
              {isAuthorized ? "Authorized for Write/Action Access" : "Read-Only / Restricted"}
            </p>
            <p className="text-[11px] opacity-80">
              Permitted Roles: {allowedRoles.join(", ")}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Module Data Attributes & Relational Fields
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {fields.map((field) => (
            <div
              key={field}
              className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
            >
              {field}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ModulePlaceholder;
