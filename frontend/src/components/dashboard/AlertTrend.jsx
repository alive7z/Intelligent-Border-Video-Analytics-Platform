import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import Card from "../common/Card";
import { mockAlertTrend } from "../../data/mockData";
import { useChartTheme } from "../../hooks/useChartTheme";

const seriesConfig = {
  Critical: { color: "#dc2626" },
  High: { color: "#f97316" },
  Medium: { color: "#eab308" },
  Low: { color: "#22c55e" },
};

/**
 * Alert trend line chart, last 7 days.
 */
function AlertTrend() {
  const chart = useChartTheme();
  const data = mockAlertTrend.days.map((day, i) => ({
    day,
    Critical: mockAlertTrend.series.Critical[i],
    High: mockAlertTrend.series.High[i],
    Medium: mockAlertTrend.series.Medium[i],
    Low: mockAlertTrend.series.Low[i],
  }));

  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Alert Trend – Last 7 Days
        </h3>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: chart.tick }}
              axisLine={{ stroke: chart.axis }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: chart.tick }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: `1px solid ${chart.tooltipBorder}`,
                background: chart.tooltipBg,
                boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              }}
              labelStyle={{ color: chart.tooltipText }}
              itemStyle={{ color: chart.tooltipText }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: chart.legendText }} />
            {Object.entries(seriesConfig).map(([key, cfg]) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={cfg.color}
                strokeWidth={2}
                dot={{ r: 3, fill: cfg.color, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default AlertTrend;
