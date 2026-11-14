import { authenticatedFetch } from "./auth";

export type OutageRiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface OutagePrediction {
  probability: number;
  reasoning: string;
  recommendations: string[];
  riskLevel: OutageRiskLevel;
}

export interface DamageEstimate {
  estimatedLoss: number;
  breakdown: {
    directLoss: number;
    indirectLoss: number;
    reputationDamage: number;
  };
  claimJustification: string;
}

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

export async function predictOutage(history: unknown[]): Promise<OutagePrediction> {
  return requestAI<OutagePrediction>("/api/ai/predict-outage", { history });
}

export async function quantifyDamages(
  downtimeMinutes: number,
  businessContext: string
): Promise<DamageEstimate> {
  return requestAI<DamageEstimate>("/api/ai/quantify-damages", { downtimeMinutes, businessContext });
}
