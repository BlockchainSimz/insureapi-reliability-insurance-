import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function predictOutage(history: any[]) {
  const prompt = `Analyze the following API performance history and predict the likelihood of an outage in the next 24 hours. 
  Performance History: ${JSON.stringify(history)}
  
  Consider patterns like increasing latency, intermittent timeouts, and historical degradation.
  Provide a probability (0-100), a reasoning, and recommended preventive actions.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          probability: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          riskLevel: { type: Type.STRING, enum: ["Low", "Medium", "High", "Critical"] }
        },
        required: ["probability", "reasoning", "recommendations", "riskLevel"]
      }
    }
  });

  return JSON.parse(response.text);
}

export async function quantifyDamages(downtimeMinutes: number, businessContext: string) {
  const prompt = `Quantify the financial damages for an API outage lasting ${downtimeMinutes} minutes.
  Business Context: ${businessContext}
  
  Provide an estimated loss in USD, a breakdown of direct vs indirect costs, and a justification for an insurance claim.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          estimatedLoss: { type: Type.NUMBER },
          breakdown: {
            type: Type.OBJECT,
            properties: {
              directLoss: { type: Type.NUMBER },
              indirectLoss: { type: Type.NUMBER },
              reputationDamage: { type: Type.NUMBER }
            }
          },
          claimJustification: { type: Type.STRING }
        },
        required: ["estimatedLoss", "breakdown", "claimJustification"]
      }
    }
  });

  return JSON.parse(response.text);
}
