type RouteMetrics = {
  count: number;
  totalDurationMs: number;
  avgDurationMs: number;
};

const routeMetrics = new Map<string, RouteMetrics>();
let totalRequests = 0;
let totalErrors = 0;

export const recordRequestMetric = (route: string, durationMs: number, statusCode: number) => {
  totalRequests += 1;
  if (statusCode >= 400) {
    totalErrors += 1;
  }

  const existing = routeMetrics.get(route) ?? {
    count: 0,
    totalDurationMs: 0,
    avgDurationMs: 0
  };

  existing.count += 1;
  existing.totalDurationMs += durationMs;
  existing.avgDurationMs = Number((existing.totalDurationMs / existing.count).toFixed(2));
  routeMetrics.set(route, existing);
};

export const getMetricsSnapshot = () => ({
  totalRequests,
  totalErrors,
  errorRate: totalRequests ? Number(((totalErrors / totalRequests) * 100).toFixed(2)) : 0,
  routes: [...routeMetrics.entries()].map(([route, stats]) => ({
    route,
    ...stats
  }))
});
