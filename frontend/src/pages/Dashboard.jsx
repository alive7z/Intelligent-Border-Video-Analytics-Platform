import React, { useEffect, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import { KpiSkeleton } from "../components/common/Skeleton";
import StatCard from "../components/dashboard/StatCard";
import LiveSurveillance from "../components/dashboard/LiveSurveillance";
import BorderMapPreview from "../components/dashboard/BorderMapPreview";
import AlertTrend from "../components/dashboard/AlertTrend";
import RiskDistribution from "../components/dashboard/RiskDistribution";
import RecentAlerts from "../components/dashboard/RecentAlerts";
import SystemHealth from "../components/dashboard/SystemHealth";
import IntelligenceSummary from "../components/dashboard/IntelligenceSummary";
import QuickActions from "../components/dashboard/QuickActions";
import { getSummary } from "../services/analyticsApi";

function Dashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let active = true;
    getSummary()
      .then((res) => active && setSummary(res.data))
      .catch(() => active && setSummary(null));
    return () => {
      active = false;
    };
  }, []);

  if (!summary) {
    return (
      <div>
        <div className="mb-6">
          <div className="h-7 w-40 animate-shimmer rounded-md" />
          <div className="mt-2 h-4 w-64 animate-shimmer rounded-md" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-72 animate-shimmer" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Command dashboard – real-time border surveillance status"
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          type="cameras"
          value={summary.camerasOnline}
          label="Active Cameras"
          sub={`Online: ${summary.camerasOnline} / ${summary.activeCameras}`}
        />
        <StatCard
          type="alerts"
          value={summary.activeAlerts}
          label="Active Alerts"
          sub="Requiring attention"
        />
        <StatCard
          type="highRisk"
          value={summary.highRiskEventsToday}
          label="High-Risk Events Today"
          sub="Critical + High severity"
        />
        <StatCard
          type="anpr"
          value={summary.anprDetections}
          label="ANPR Detections"
          sub="Last 24 hours"
        />
        <StatCard
          type="health"
          value={summary.systemHealth}
          label="System Health"
          sub={`Uptime ${summary.uptime}`}
          status="healthy"
          statusText="Healthy"
        />
      </div>

      {/* Surveillance / map / trend */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <LiveSurveillance />
        </div>
        <div className="xl:col-span-1">
          <BorderMapPreview />
        </div>
        <div className="xl:col-span-1">
          <AlertTrend />
        </div>
      </div>

      {/* Recent alerts / risk + intelligence */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RecentAlerts />
        </div>
        <div className="space-y-6">
          <RiskDistribution />
          <IntelligenceSummary />
        </div>
      </div>

      {/* System health / quick actions */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SystemHealth />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
