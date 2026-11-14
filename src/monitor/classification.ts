export type CheckClassification = {
  httpHealthy: boolean;
  ok: boolean;
  status: "up" | "degraded" | "down";
  errorCode: string | null;
};

export function classifyCheck(
  statusCode: number | null,
  latencyMs: number,
  expectedMin: number,
  expectedMax: number,
  latencyThresholdMs: number
): CheckClassification {
  const httpHealthy =
    statusCode !== null &&
    statusCode >= expectedMin &&
    statusCode <= expectedMax;

  if (!httpHealthy) {
    return {
      httpHealthy: false,
      ok: false,
      status: "down",
      errorCode: statusCode === null ? "CHECK_FAILED" : "HTTP_STATUS"
    };
  }

  const degraded = latencyMs > latencyThresholdMs;
  return {
    httpHealthy: true,
    ok: true,
    status: degraded ? "degraded" : "up",
    errorCode: degraded ? "LATENCY" : null
  };
}
