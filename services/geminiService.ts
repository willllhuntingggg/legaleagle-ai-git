
import { GoogleGenAI, Type } from "@google/genai";
import { ContractStance, ReviewStrictness, RiskLevel, ContractSummary, RiskPoint, ModelProvider } from "../types";

// --- Configuration ---

// Helper to get Gemini API key safely
const getGeminiApiKey = () => {
  try {
    return process.env.API_KEY || '';
  } catch (e) {
    console.warn("process.env is not defined, using empty key.");
    return '';
  }
};

// Alibaba Qwen Configuration (Default fallback)
const QWEN_DEFAULT_API_KEY = "sk-48d1263fb12944c5a307f090e2f66b10";
const QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

// Moonshot Kimi Configuration
// Updated with user provided key
const MOONSHOT_DEFAULT_API_KEY = "sk-Jl6AirNkcsXrpYnoik02cB2KfwWDJydLibTZadz6tV3lcnQq";
const MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1/chat/completions";
const MOONSHOT_MODEL = "kimi-k2-0905-preview"; 

const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

// --- Helpers ---

// Qwen API Call Helper
const callQwenAI = async (messages: any[], apiKey?: string, jsonMode: boolean = false): Promise<string> => {
    const key = apiKey || QWEN_DEFAULT_API_KEY;
    try {
        const response = await fetch(QWEN_BASE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "qwen-plus",
                messages: messages,
                response_format: jsonMode ? { type: "json_object" } : undefined,
                temperature: 0.2
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Qwen API Error: ${err}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (error) {
        console.error("Call to Qwen failed:", error);
        throw error;
    }
};

// Moonshot API Call Helper
const callMoonshotAI = async (messages: any[], apiKey?: string, jsonMode: boolean = false): Promise<string> => {
    const key = apiKey || MOONSHOT_DEFAULT_API_KEY;
    
    if (!key) {
        throw new Error("Missing Moonshot Kimi API Key");
    }

    try {
        const response = await fetch(MOONSHOT_BASE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: MOONSHOT_MODEL,
                messages: messages,
                // Attempt to use json_object if supported, otherwise rely on prompt
                response_format: jsonMode ? { type: "json_object" } : undefined,
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Moonshot API Error: ${err}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (error) {
        console.error("Call to Moonshot failed:", error);
        throw error;
    }
};

// Parse JSON from potentially Markdown-wrapped string
const safeJsonParse = (text: string, defaultVal: any) => {
    try {
        // Strip markdown code blocks if present (e.g. ```json ... ```)
        const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("JSON Parsing failed", e);
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

  if (provider === ModelProvider.QWEN) {
      try {
          const content = await callQwenAI([systemMessage, userMessage], apiKey, true);
          return safeJsonParse(content, getUnknownSummary("Could not analyze text (Qwen)."));
      } catch (e) {
          return getUnknownSummary("Error calling Qwen API.");
      }
  }

  if (provider === ModelProvider.KIMI) {
      try {
          const content = await callMoonshotAI([systemMessage, userMessage], apiKey, true);
          return safeJsonParse(content, getUnknownSummary("Could not analyze text (Kimi)."));
      } catch (e) {
          return getUnknownSummary("Error calling Moonshot API.");
      }
  }

  // Default: Gemini
  const schema: any = {
    type: Type.OBJECT,
    properties: {
      type: { type: Type.STRING, description: "Type of the contract (e.g., NDA, Sales Agreement)" },
      parties: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Names of the parties involved" },
      amount: { type: Type.STRING, description: "Total contract value or payment terms summary" },
      duration: { type: Type.STRING, description: "Start and end dates or duration" },
      mainSubject: { type: Type.STRING, description: "One sentence summary of what is being exchanged or agreed" },
    },
    required: ["type", "parties", "amount", "duration", "mainSubject"],
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const json = JSON.parse(response.text || "{}");
    return json as ContractSummary;
  } catch (error) {
    console.error("Summary generation failed:", error);
    return getUnknownSummary("Could not analyze text.");
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
  `;
  
  const userPrompt = `
    Identify risks based on my stance. For each risk:
    1. Quote the *exact* original text snippet.
    2. Provide a safer, rewritten version.
    
    Return a raw JSON array of objects with keys: originalText, riskDescription, reason, level (HIGH/MEDIUM/LOW), suggestedText.
    
    Contract Text:
    "${text}"
  `;

  // --- External Providers (Qwen / Kimi) ---
  if (provider === ModelProvider.QWEN || provider === ModelProvider.KIMI) {
      const messages = [
          { role: "system", content: systemPrompt + " Respond ONLY with a JSON array." },
          { role: "user", content: userPrompt }
      ];

      try {
        let content = "";
        if (provider === ModelProvider.QWEN) {
            content = await callQwenAI(messages, apiKey, true);
        } else {
            content = await callMoonshotAI(messages, apiKey, true);
        }
        
        const rawRisks = safeJsonParse(content, []);
        const providerPrefix = provider === ModelProvider.QWEN ? 'qwen' : 'kimi';
        return rawRisks.map((r: any, index: number) => ({ ...r, id: `risk-${providerPrefix}-${index}-${Date.now()}`, isAddressed: false }));
      } catch (e) {
        console.error(`${provider} Analysis Failed`, e);
        // Re-throw to show in UI
        throw e;
      }
  }

  // --- Gemini Implementation ---
  const schema: any = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        originalText: { type: Type.STRING, description: "The exact substring from the contract that contains the risk. Must match exactly." },
        riskDescription: { type: Type.STRING, description: "Short title of the risk" },
        reason: { type: Type.STRING, description: "Detailed explanation of why this is a risk for my stance" },
        level: { type: Type.STRING, enum: [RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.LOW] },
        suggestedText: { type: Type.STRING, description: "The modified text to replace the original text." }
      },
      required: ["originalText", "riskDescription", "reason", "level", "suggestedText"]
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: systemPrompt + "\n" + userPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2
      }
    });

    const rawRisks = JSON.parse(response.text || "[]");
    return rawRisks.map((r: any, index: number) => ({ ...r, id: `risk-gemini-${index}-${Date.now()}`, isAddressed: false }));
  } catch (error) {
    console.error("Risk analysis failed:", error);
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

  if (provider === ModelProvider.QWEN) {
      try {
          return await callQwenAI(messages, apiKey);
      } catch (e) {
          return "Error drafting contract with Qwen.";
      }
  }

  if (provider === ModelProvider.KIMI) {
      try {
          return await callMoonshotAI(messages, apiKey);
      } catch (e) {
          return `Error drafting contract with Kimi (Moonshot): ${e instanceof Error ? e.message : 'Unknown error'}`;
      }
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Drafting failed.";
  } catch (error) {
    console.error("Drafting failed:", error);
    return "Error drafting contract.";
  }
};
