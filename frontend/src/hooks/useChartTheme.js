import { useMemo } from "react";
import { useTheme } from "./useTheme";

/**
 * Central chart colors for Recharts across both application themes.
 */
export function useChartTheme() {
  const { isDark } = useTheme();
  return useMemo(
    () => isDark ? ({
      isDark: true,
      grid: "#2a2a2e",
      tick: "rgba(255, 255, 255, 0.75)",
      axis: "#3f3f46",
      divergent0: "#18181b",
      divergent100: "#1f1f23",
      tooltipBg: "#1f1f23",
      tooltipBorder: "#3f3f46",
      tooltipText: "#ffffff",
      legendText: "rgba(255, 255, 255, 0.9)",
      barLabel: "#ffffff",
      surface: "#18181b",
    }) : ({
      isDark: false,
      grid: "#e2e8f0",
      tick: "#64748b",
      axis: "#cbd5e1",
      divergent0: "#ffffff",
      divergent100: "#f8fafc",
      tooltipBg: "#ffffff",
      tooltipBorder: "#e2e8f0",
      tooltipText: "#1e293b",
      legendText: "#475569",
      barLabel: "#1e293b",
      surface: "#ffffff",
    }),
    [isDark]
  );
}
