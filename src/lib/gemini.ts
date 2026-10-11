import { authenticatedFetch } from "./auth";

async function requestAI<T>(endpoint: string, payload: unknown): Promise<T> {
  const response = await authenticatedFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "AI request failed");
  }
  return data as T;
}

export async function predictOutage(history: unknown[]) {
  return requestAI("/api/ai/predict-outage", { history });
}

export async function quantifyDamages(downtimeMinutes: number, businessContext: string) {
  return requestAI("/api/ai/quantify-damages", { downtimeMinutes, businessContext });
}
