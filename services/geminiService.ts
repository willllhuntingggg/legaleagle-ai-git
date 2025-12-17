
import { Type } from "@google/genai";
import { ContractStance, ReviewStrictness, RiskLevel, ContractSummary, RiskPoint, ModelProvider } from "../types";

// --- Helpers ---

// Unified Backend Call Helper
const callBackendAPI = async (
    provider: ModelProvider, 
    messages: any[], 
    config: any = {},
    userApiKey?: string
): Promise<string> => {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                provider,
                messages,
                config,
                apiKey: userApiKey // Optional: Pass user provided key if available
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(errData.error || `Backend Error: ${response.status}`);
        }

        const data = await response.json();
        return data.text || "";
    } catch (error: any) {
        console.error(`Call to ${provider} failed:`, error);
        
        // --- Fallback Mock Logic (Preserved from previous version) ---
        // Handles cases where the Backend fails (e.g., 500, Network Error, or Upstream API down)
        if (provider === ModelProvider.MIMO || error.message.includes('MiMo')) {
             console.warn("Using Fallback Mock for Xiaomi MiMo due to backend failure.");
             
             const lastMessage = messages[messages.length - 1]?.content || "";
             
             if (lastMessage.includes("Analyze the following legal contract")) {
                 return JSON.stringify({
                     type: "Service Agreement (Mocked)",
                     parties: ["Client (Unknown)", "Provider (Unknown)"],
                     amount: "Refer to Contract",
                     duration: "Unknown",
                     mainSubject: "Network connection to Xiaomi failed; this is a placeholder summary."
                 });
             }
             if (lastMessage.includes("Identify risks")) {
                 return JSON.stringify([
                     {
                         originalText: "Provider's total liability under this Agreement shall be limited to $5,000",
                         riskDescription: "Liability Cap Low (Mock)",
                         reason: "Unable to reach Xiaomi API. This is a simulated risk for demonstration purposes.",
                         level: "HIGH",
                         suggestedText: "Liability cap should be increased to match contract value."
                     }
                 ]);
             }
             if (lastMessage.includes("Draft a professional")) {
                 return "# Contract Draft (Offline Mode)\n\n**Note:** The Xiaomi MiMo API could not be reached. This is a placeholder draft.";
             }
        }
        
        throw error;
    }
};

// Parse JSON from potentially Markdown-wrapped string
const safeJsonParse = (text: string, defaultVal: any) => {
    if (!text) return defaultVal;
    
    try {
        return JSON.parse(text);
    } catch (e1) {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match) {
            try { return JSON.parse(match[1]); } catch (e2) {}
        }
        // Try finding array/object structure
        try {
            const firstBracket = text.indexOf('[');
            const lastBracket = text.lastIndexOf(']');
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            let start = -1; let end = -1;

            if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
                 if (lastBracket > firstBracket) { start = firstBracket; end = lastBracket; }
            } else if (firstBrace !== -1) {
                 if (lastBrace > firstBrace) { start = firstBrace; end = lastBrace; }
            }
            if (start !== -1 && end !== -1) {
                return JSON.parse(text.substring(start, end + 1));
            }
        } catch (e3) {}
        console.error("JSON Parsing failed", text.substring(0, 100));
        return defaultVal;
    }
};

// --- Services ---

export const generateContractSummary = async (text: string, provider: ModelProvider = ModelProvider.GEMINI, apiKey?: string): Promise<ContractSummary> => {
  const promptText = `
    Analyze the following legal contract text and extract key information. 
    Return a JSON object with keys: type, parties (array), amount, duration, mainSubject.
    
    Text: "${text.substring(0, 10000)}..."
  `;

  const systemMessage = { role: "system", content: "You are a legal assistant. Respond in pure JSON." };
  const userMessage = { role: "user", content: promptText };
  const messages = [systemMessage, userMessage];

  // Config for Gemini (Schema)
  const geminiSchema: any = {
    type: Type.OBJECT,
    properties: {
      type: { type: Type.STRING, description: "Type of the contract" },
      parties: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Names of the parties" },
      amount: { type: Type.STRING, description: "Total value" },
      duration: { type: Type.STRING, description: "Duration" },
      mainSubject: { type: Type.STRING, description: "Summary" },
    },
    required: ["type", "parties", "amount", "duration", "mainSubject"],
  };

  try {
      const config = {
          responseMimeType: "application/json",
          responseSchema: provider === ModelProvider.GEMINI ? geminiSchema : undefined,
          jsonMode: true
      };

      const content = await callBackendAPI(provider, messages, config, apiKey);
      return safeJsonParse(content, getUnknownSummary("Could not analyze text."));
  } catch (e: any) {
      return getUnknownSummary(`Error calling ${provider}: ${e.message}`);
  }
};

const getUnknownSummary = (reason: string): ContractSummary => ({
    type: "Unknown",
    parties: [],
    amount: "Unknown",
    duration: "Unknown",
    mainSubject: reason
});

export const analyzeContractRisks = async (
  text: string, 
  stance: ContractStance, 
  strictness: ReviewStrictness,
  rulesContext: string,
  provider: ModelProvider = ModelProvider.GEMINI,
  apiKey?: string
): Promise<RiskPoint[]> => {
  const systemPrompt = `
    You are a senior legal consultant. Review the contract.
    My Stance: ${stance}
    Review Strategy: ${strictness}
    Knowledge Base: ${rulesContext}
    Respond ONLY with a JSON array.
  `;
  
  const userPrompt = `
    Identify risks based on my stance. For each risk:
    1. Quote the *exact* original text snippet.
    2. Provide a safer, rewritten version.
    
    Return a raw JSON array of objects with keys: originalText, riskDescription, reason, level (HIGH/MEDIUM/LOW), suggestedText.
    
    Contract Text:
    "${text}"
  `;

  const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
  ];

  // Schema for Gemini
  const geminiSchema: any = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        originalText: { type: Type.STRING, description: "Exact substring" },
        riskDescription: { type: Type.STRING },
        reason: { type: Type.STRING },
        level: { type: Type.STRING, enum: [RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.LOW] },
        suggestedText: { type: Type.STRING }
      },
      required: ["originalText", "riskDescription", "reason", "level", "suggestedText"]
    }
  };

  try {
    const config = {
        responseMimeType: "application/json",
        responseSchema: provider === ModelProvider.GEMINI ? geminiSchema : undefined,
        jsonMode: true,
        temperature: 0.2
    };

    const content = await callBackendAPI(provider, messages, config, apiKey);
    
    let rawRisks = safeJsonParse(content, []);
    
    if (!Array.isArray(rawRisks)) {
        if (rawRisks && typeof rawRisks === 'object') {
            if (rawRisks.originalText) {
                rawRisks = [rawRisks];
            } else {
                const values = Object.values(rawRisks);
                const foundArray = values.find(v => Array.isArray(v));
                if (foundArray) rawRisks = foundArray;
                else rawRisks = []; 
            }
        } else {
            rawRisks = [];
        }
    }

    const providerPrefix = provider.split(' ')[0].toLowerCase();
    return rawRisks.map((r: any, index: number) => ({ ...r, id: `risk-${providerPrefix}-${index}-${Date.now()}`, isAddressed: false }));
  } catch (e) {
    console.error(`${provider} Analysis Failed`, e);
    return [];
  }
};

export const draftNewContract = async (type: string, requirements: string, provider: ModelProvider = ModelProvider.GEMINI, apiKey?: string): Promise<string> => {
  const prompt = `
    Draft a professional legal contract.
    Type: ${type}
    Requirements: ${requirements}
    
    Return only the contract text in Markdown format.
  `;
  
  const messages = [
      { role: "system", content: "You are an expert legal drafter." },
      { role: "user", content: prompt }
  ];

  try {
      return await callBackendAPI(provider, messages, {}, apiKey);
  } catch (e: any) {
      console.error("Drafting failed:", e);
      return `Error drafting contract: ${e.message}`;
  }
};
