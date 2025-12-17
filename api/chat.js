export default async function handler(req, res) {
  // CORS Handling
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { provider, messages, config, apiKey: userApiKey } = req.body;

  try {
    let responseText = "";
    
    // 1. Google Gemini
    if (provider === 'Google Gemini 2.5') {
        const apiKey = userApiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Server missing GEMINI_API_KEY");

        // Convert messages to Gemini format
        // Note: Simple conversion. For production, handle multi-turn history more carefully.
        const systemMessage = messages.find(m => m.role === 'system');
        const userMessages = messages.filter(m => m.role !== 'system');
        
        let contents = userMessages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }));

        // If simple prompt string was passed (legacy support)
        if (typeof messages === 'string') {
            contents = [{ role: 'user', parts: [{ text: messages }] }];
        }

        const payload = {
            contents: contents,
            generationConfig: {
                temperature: config?.temperature || 0.2,
                response_mime_type: config?.responseMimeType,
                response_schema: config?.responseSchema
            }
        };

        if (systemMessage) {
            payload.systemInstruction = { parts: [{ text: systemMessage.content }] };
        }

        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Gemini API Error: ${err}`);
        }

        const data = await resp.json();
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } 
    // 2. Alibaba Qwen
    else if (provider === 'Alibaba Qwen Plus (通义千问)') {
        const apiKey = userApiKey || process.env.QWEN_API_KEY;
        if (!apiKey) throw new Error("Server missing QWEN_API_KEY");

        const resp = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "qwen-plus",
                messages: messages,
                response_format: config?.jsonMode ? { type: "json_object" } : undefined,
                temperature: 0.2
            })
        });

        if (!resp.ok) throw new Error(`Qwen API Error: ${await resp.text()}`);
        const data = await resp.json();
        responseText = data.choices?.[0]?.message?.content || "";
    }
    // 3. Moonshot Kimi
    else if (provider === 'Moonshot Kimi (月之暗面)') {
        const apiKey = userApiKey || process.env.MOONSHOT_API_KEY;
        if (!apiKey) throw new Error("Server missing MOONSHOT_API_KEY");

        const resp = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "kimi-k2-turbo-preview",
                messages: messages,
                response_format: config?.jsonMode ? { type: "json_object" } : undefined,
                temperature: 0.3
            })
        });

        if (!resp.ok) throw new Error(`Moonshot API Error: ${await resp.text()}`);
        const data = await resp.json();
        responseText = data.choices?.[0]?.message?.content || "";
    }
    // 4. ByteDance Doubao
    else if (provider === 'ByteDance Doubao (字节豆包)') {
        const apiKey = userApiKey || process.env.DOUBAO_API_KEY;
        if (!apiKey) throw new Error("Server missing DOUBAO_API_KEY");

        const resp = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "doubao-seed-1-6-lite-251015",
                messages: messages,
                stream: false,
                temperature: 0.3
            })
        });

        if (!resp.ok) throw new Error(`Doubao API Error: ${await resp.text()}`);
        const data = await resp.json();
        responseText = data.choices?.[0]?.message?.content || "";
    }
    // 5. Xiaomi MiMo
    else if (provider === 'Xiaomi MiMo (小米)') {
        const apiKey = userApiKey || process.env.MIMO_API_KEY;
        if (!apiKey) throw new Error("Server missing MIMO_API_KEY");

        const resp = await fetch("https://api.xiaomimimo.com/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "mimo-1.0",
                messages: messages,
                stream: false,
                temperature: 0.3,
                response_format: config?.jsonMode ? { type: "json_object" } : undefined
            })
        });

        if (!resp.ok) throw new Error(`MiMo API Error: ${await resp.text()}`);
        const data = await resp.json();
        responseText = data.choices?.[0]?.message?.content || "";
    }
    else {
        throw new Error("Unknown Provider");
    }

    res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
}