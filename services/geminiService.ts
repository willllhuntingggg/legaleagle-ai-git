
import { GoogleGenAI, Type } from "@google/genai";
import { ContractStance, ReviewStrictness, RiskLevel, RiskPoint, ModelProvider } from "../types";

// --- Helpers ---

// Client-Side AI Call Helper
const callAIProvider = async (
    provider: ModelProvider, 
    messages: any[], 
    config: any = {},
    userApiKey: string
): Promise<string> => {
    if (!userApiKey) {
        throw new Error(`请在左侧设置中填写 ${provider.split(' ')[0]} 的 API Key`);
    }

    try {
        // 1. Google Gemini
        if (provider === ModelProvider.GEMINI) {
            const ai = new GoogleGenAI({ apiKey: userApiKey });
            
            const systemMsg = messages.find(m => m.role === 'system')?.content;
            const userMsg = messages.find(m => m.role === 'user')?.content;

            const modelId = 'gemini-3-pro-preview';
            
            const generateConfig: any = {
                responseMimeType: config.responseMimeType,
                responseSchema: config.responseSchema,
                temperature: config.temperature || 0.2
            };
            
            if (systemMsg) {
                generateConfig.systemInstruction = systemMsg;
            }

            const result = await ai.models.generateContent({
                model: modelId,
                contents: userMsg, 
                config: generateConfig
            });
            
            return result.text || "";
        }
        
        // 2. Alibaba Qwen
        else if (provider === ModelProvider.QWEN) {
            const resp = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${userApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "qwen-plus",
                    messages: messages,
                    response_format: config.jsonMode ? { type: "json_object" } : undefined,
                    temperature: 0.2
                })
            });
            if (!resp.ok) {
                 const err = await resp.text();
                 throw new Error(`Qwen API Error: ${err}`);
            }
            const data = await resp.json();
            return data.choices?.[0]?.message?.content || "";
        }
        
        // 3. Moonshot Kimi
        else if (provider === ModelProvider.KIMI) {
            const resp = await fetch("https://api.moonshot.cn/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${userApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "kimi-k2-turbo-preview",
                    messages: messages,
                    response_format: config.jsonMode ? { type: "json_object" } : undefined,
                    temperature: 0.3
                })
            });
            if (!resp.ok) {
                 const err = await resp.text();
                 throw new Error(`Moonshot API Error: ${err}`);
            }
            const data = await resp.json();
            return data.choices?.[0]?.message?.content || "";
        }

        // 4. ByteDance Doubao
        else if (provider === ModelProvider.DOUBAO) {
             const resp = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${userApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "doubao-seed-1-6-lite-251015",
                    messages: messages,
                    stream: false
                })
            });
             if (!resp.ok) throw new Error(`Doubao API Error: ${await resp.text()}`);
            const data = await resp.json();
            return data.choices?.[0]?.message?.content || "";
        }

        throw new Error("Unknown Provider");

    } catch (e: any) {
        console.error(`${provider} Request Failed`, e);
        
        if (e.message.includes("Failed to fetch") || e.message.includes("CORS")) {
             console.warn("Network/CORS error detected, falling back to Mock response.");
             const lastMsg = messages[messages.length-1].content;
             
             if (lastMsg.includes("Identify risks")) {
                 return JSON.stringify([{
                     originalText: "Provider's total liability... limited to $5,000",
                     riskDescription: "Liability Cap Too Low (Local Mock)",
                     reason: "API call failed. Please check console for CORS errors. This is a simulated risk.",
                     level: "HIGH",
                     suggestedText: "Provider's total liability shall match the Contract Price."
                 }]);
             }
        }
        
        throw e;
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

export const analyzeContractRisks = async (
  text: string, 
  stance: ContractStance, 
  strictness: ReviewStrictness,
  rulesContext: string,
  provider: ModelProvider = ModelProvider.QWEN,
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

  const geminiSchema: any = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        originalText: { type: Type.STRING },
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

    const content = await callAIProvider(provider, messages, config, apiKey || "");
    
    let rawRisks = safeJsonParse(content, []);
    
    if (!Array.isArray(rawRisks)) {
        if (rawRisks && typeof rawRisks === 'object') {
             rawRisks = rawRisks.originalText ? [rawRisks] : [];
        } else {
            rawRisks = [];
        }
    }

    const providerPrefix = provider.split(' ')[0].toLowerCase();
    return rawRisks.map((r: any, index: number) => ({ ...r, id: `risk-${providerPrefix}-${index}-${Date.now()}`, isAddressed: false }));
  } catch (e) {
    console.error(`${provider} Analysis Failed`, e);
    throw e;
  }
};

export const draftNewContract = async (type: string, requirements: string, provider: ModelProvider = ModelProvider.QWEN, apiKey?: string): Promise<string> => {
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
      return await callAIProvider(provider, messages, {}, apiKey || "");
  } catch (e: any) {
      console.error("Drafting failed:", e);
      return `Error drafting contract: ${e.message}`;
  }
};
