import React from "react";

const StatusBadge = ({ status }) => {
  const normalized = (status || "").toUpperCase();

  let badgeStyle = "bg-slate-100 text-slate-700 border-slate-200";
  if (normalized === "PASS" || normalized === "RELEASED" || normalized === "COMPLETED") {
    badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200";
  } else if (
    normalized === "FAIL" ||
    normalized === "CRITICAL" ||
    normalized === "REJECTED" ||
    normalized === "UNDER QUARANTINE"
  ) {
    badgeStyle = "bg-rose-50 text-rose-700 border-rose-200";
  } else if (
    normalized === "TESTING IN PROGRESS" ||
    normalized === "MAJOR" ||
    normalized === "OPEN"
  ) {
    badgeStyle = "bg-amber-50 text-amber-700 border-amber-200";
  } else if (normalized === "MINOR") {
    badgeStyle = "bg-sky-50 text-sky-700 border-sky-200";
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeStyle}`}
    >
      {status}
    </span>
  );
};

export default StatusBadge;
