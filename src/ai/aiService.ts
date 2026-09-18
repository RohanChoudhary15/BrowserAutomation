import { AiConfig, AiProvider, ModelOption, VisionLlmParams } from './types';

const STORAGE_KEY = 'autoflow_ai_config';

export const DEFAULT_OPENAI_BASE_URL = 'https://api.experientiallabs.ai';
export const DEFAULT_OPENAI_API_KEY = 'xpl_b81a9b3b640cb97185a3f135ed97f8922ec849ee';

export const DEFAULT_MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
export const DEFAULT_MISTRAL_API_KEY = 'xT6AO2YesBGeD3corU4a8ThNSKVHqBPf';

export const DEFAULT_CONFIG: AiConfig = {
  provider: 'openai',
  apiKey: DEFAULT_OPENAI_API_KEY,
  openaiBaseUrl: DEFAULT_OPENAI_BASE_URL,
  model: 'gpt-5.6-sol',
};

export function getOpenAiBaseUrl(config?: Partial<AiConfig>): string {
  const raw = config?.openaiBaseUrl?.trim() || DEFAULT_OPENAI_BASE_URL;
  const stripped = raw.replace(/\/+$/, '');
  return stripped.endsWith('/v1') ? stripped : `${stripped}/v1`;
}

export const DEFAULT_FALLBACK_MODELS: Record<AiProvider, ModelOption[]> = {
  'built-in': [
    { id: 'semantic-parser-v1', name: 'Built-in Rule Synthesizer (Offline & Zero Config)' },
  ],
  openai: [
    { id: 'gpt-5.6-sol', name: 'gpt-5.6-sol (Default)' },
    { id: 'gpt-4o-mini', name: 'gpt-4o-mini (Fast & Intelligent)' },
    { id: 'gpt-4o', name: 'gpt-4o (Flagship Omni)' },
    { id: 'o3-mini', name: 'o3-mini (Advanced Reasoning)' },
    { id: 'o1-mini', name: 'o1-mini (Reasoning)' },
    { id: 'gpt-4-turbo', name: 'gpt-4-turbo' },
    { id: 'gpt-3.5-turbo', name: 'gpt-3.5-turbo' },
  ],
  mistral: [
    { id: 'ministral-8b-latest', name: 'ministral-8b-latest (Vision & Chat - Recommended)' },
    { id: 'mistral-small-latest', name: 'mistral-small-latest (Vision & Chat)' },
    { id: 'mistral-medium-latest', name: 'mistral-medium-latest (Vision & Chat)' },
    { id: 'codestral-latest', name: 'codestral-latest (Code Specialist)' },
    { id: 'ministral-3b-latest', name: 'ministral-3b-latest (Lightweight Vision)' },
    { id: 'mistral-large-latest', name: 'mistral-large-latest' },
  ],
  gemini: [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Fast Multimodal)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Deep Reasoning)' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Next-Gen)' },
    { id: 'gemini-2.0-flash-lite-preview-02-05', name: 'Gemini 2.0 Flash Lite' },
  ],
  openrouter: [
    { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o-mini' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Anthropic: Claude 3.5 Sonnet' },
    { id: 'google/gemini-2.0-flash-001', name: 'Google: Gemini 2.0 Flash' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek: DeepSeek-V3' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Meta: Llama 3.3 70B Instruct' },
  ],
  custom: [
    { id: 'default', name: 'Default Model' },
    { id: 'llama3', name: 'Llama 3' },
    { id: 'mistral', name: 'Mistral' },
  ],
};

export function getDefaultModelForProvider(provider: AiProvider): string {
  return DEFAULT_FALLBACK_MODELS[provider]?.[0]?.id || 'gpt-5.6-sol';
}

export async function getAiConfig(): Promise<AiConfig> {
  try {
    let saved: Partial<AiConfig> = {};
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(STORAGE_KEY);
      saved = res[STORAGE_KEY] || {};
    } else {
      const local = localStorage.getItem(STORAGE_KEY);
      saved = local ? JSON.parse(local) : {};
    }
    const defaultModel = getDefaultModelForProvider(saved.provider || DEFAULT_CONFIG.provider);
    const activeModel = (!saved.model || (saved.provider === 'openai' && saved.model === 'gpt-4o-mini'))
      ? defaultModel
      : saved.model;

    const defaultKey = (saved.provider === 'mistral') ? DEFAULT_MISTRAL_API_KEY : DEFAULT_CONFIG.apiKey;
    const activeApiKey = saved.apiKey && saved.apiKey.trim() !== '' ? saved.apiKey : defaultKey;

    return {
      provider: saved.provider || DEFAULT_CONFIG.provider,
      apiKey: activeApiKey,
      openaiBaseUrl: saved.openaiBaseUrl && saved.openaiBaseUrl.trim() !== '' ? saved.openaiBaseUrl : DEFAULT_CONFIG.openaiBaseUrl,
      model: activeModel,
      customEndpoint: saved.customEndpoint || DEFAULT_CONFIG.customEndpoint,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [STORAGE_KEY]: config });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  } catch (err) {
    console.error('Failed to save AI config:', err);
  }
}

/**
 * Fetches available models from the provider's /models endpoint
 */
export async function fetchAvailableModels(config?: Partial<AiConfig>): Promise<ModelOption[]> {
  const activeConfig: AiConfig = {
    ...(await getAiConfig()),
    ...config,
  };

  const provider = activeConfig.provider;
  const apiKey = activeConfig.apiKey;

  if (provider === 'built-in') {
    return DEFAULT_FALLBACK_MODELS['built-in'];
  }

  try {
    // 1. OpenAI: GET ${baseUrl}/models
    if (provider === 'openai') {
      if (!apiKey) return DEFAULT_FALLBACK_MODELS.openai;

      const baseUrl = getOpenAiBaseUrl(activeConfig);
      const res = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!res.ok) {
        throw new Error(`OpenAI models HTTP ${res.status}`);
      }

      const json = await res.json();
      const rawList: Array<{ id: string }> = json.data || json.models || [];

      // Prioritize chat / popular models, with gpt-5.6-sol at the very top
      const chatPrefixes = ['gpt-5', 'gpt-4', 'gpt-3.5', 'o1', 'o3', 'o4', 'chatgpt', 'claude', 'qwen', 'gemini'];
      const sorted = rawList.sort((a, b) => {
        if (a.id === 'gpt-5.6-sol') return -1;
        if (b.id === 'gpt-5.6-sol') return 1;
        const aChat = chatPrefixes.some(p => a.id.toLowerCase().startsWith(p));
        const bChat = chatPrefixes.some(p => b.id.toLowerCase().startsWith(p));
        if (aChat && !bChat) return -1;
        if (!aChat && bChat) return 1;
        return a.id.localeCompare(b.id);
      });

      const models: ModelOption[] = sorted.map(m => ({
        id: m.id,
        name: m.id,
      }));

      return models.length > 0 ? models : DEFAULT_FALLBACK_MODELS.openai;
    }

    // 2. Mistral AI: GET https://api.mistral.ai/v1/models
    if (provider === 'mistral') {
      const keyToUse = apiKey || DEFAULT_MISTRAL_API_KEY;
      const res = await fetch(`${DEFAULT_MISTRAL_BASE_URL}/models`, {
        headers: {
          Authorization: `Bearer ${keyToUse}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Mistral models HTTP ${res.status}`);
      }

      const json = await res.json();
      const rawList: Array<{
        id: string;
        name?: string;
        description?: string;
        capabilities?: { completion_chat?: boolean; vision?: boolean };
      }> = json.data || [];

      // Filter out non-chat models (e.g. OCR-only, audio/TTS-only, embeddings)
      const chatModels = rawList.filter(
        m => m.capabilities?.completion_chat !== false &&
             !m.id.includes('embed') &&
             !m.id.includes('ocr') &&
             !m.id.includes('tts') &&
             !m.id.includes('realtime')
      );

      // Prioritize popular chat & vision models
      const priorityPrefixes = ['ministral-8b', 'mistral-small', 'mistral-medium', 'codestral', 'ministral-3b', 'mistral-large'];
      const sorted = chatModels.sort((a, b) => {
        const aIndex = priorityPrefixes.findIndex(p => a.id.startsWith(p));
        const bIndex = priorityPrefixes.findIndex(p => b.id.startsWith(p));
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.id.localeCompare(b.id);
      });

      const models: ModelOption[] = sorted.map(m => ({
        id: m.id,
        name: m.capabilities?.vision ? `${m.id} (Vision & Chat)` : m.id,
        description: m.description,
      }));

      return models.length > 0 ? models : DEFAULT_FALLBACK_MODELS.mistral;
    }

    // 3. Google Gemini: GET https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}
    if (provider === 'gemini') {
      if (!apiKey) return DEFAULT_FALLBACK_MODELS.gemini;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );

      if (!res.ok) {
        throw new Error(`Gemini models HTTP ${res.status}`);
      }

      const json = await res.json();
      const rawList: Array<{
        name: string;
        displayName?: string;
        description?: string;
        supportedGenerationMethods?: string[];
      }> = json.models || [];

      // Filter to models supporting content generation
      const filtered = rawList.filter(
        m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')
      );

      const models: ModelOption[] = filtered.map(m => {
        const cleanId = m.name.replace(/^models\//, '');
        return {
          id: cleanId,
          name: m.displayName ? `${m.displayName} (${cleanId})` : cleanId,
          description: m.description,
        };
      });

      return models.length > 0 ? models : DEFAULT_FALLBACK_MODELS.gemini;
    }

    // 3. OpenRouter: GET https://openrouter.ai/api/v1/models
    if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });

      if (!res.ok) {
        throw new Error(`OpenRouter models HTTP ${res.status}`);
      }

      const json = await res.json();
      const rawList: Array<{
        id: string;
        name?: string;
        description?: string;
        context_length?: number;
      }> = json.data || [];

      const models: ModelOption[] = rawList.map(m => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description,
        contextLength: m.context_length,
      }));

      return models.length > 0 ? models : DEFAULT_FALLBACK_MODELS.openrouter;
    }

    // 4. Custom / Local OpenAI-compatible endpoint
    if (provider === 'custom') {
      const base = (activeConfig.customEndpoint || 'http://localhost:11434/v1').replace(/\/$/, '');
      const url = base.endsWith('/models') ? base : `${base}/models`;

      const res = await fetch(url, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Custom models HTTP ${res.status}`);
      }

      const json = await res.json();
      const rawList: any[] = json.data || json.models || [];

      const models: ModelOption[] = rawList.map((m: any) => {
        const id = m.id || m.name || String(m);
        return {
          id,
          name: m.name || id,
          description: m.description,
        };
      });

      return models.length > 0 ? models : DEFAULT_FALLBACK_MODELS.custom;
    }
  } catch (err) {
    console.warn(`Failed to fetch models from ${provider} /models endpoint:`, err);
  }

  // Fallback to defaults if remote request fails or is offline
  return DEFAULT_FALLBACK_MODELS[provider] || DEFAULT_FALLBACK_MODELS.openai;
}

function parseApiError(errText: string, status: number, providerName: string): string {
  try {
    const json = JSON.parse(errText);
    const msg = json.error?.message || json.message || json.error;
    if (typeof msg === 'string' && msg.trim()) {
      return `${providerName} error (${status}): ${msg.trim()}`;
    }
  } catch {}
  return `${providerName} error (${status}): ${errText.slice(0, 300)}`;
}

/**
 * Calls selected LLM provider with prompt and system instructions
 */
export async function queryLlm(
  prompt: string,
  systemInstruction?: string,
  config?: Partial<AiConfig>
): Promise<string> {
  const baseConfig = await getAiConfig();
  const currentConfig: AiConfig = {
    ...baseConfig,
    ...config,
  };

  if (currentConfig.provider === 'openai' && currentConfig.apiKey) {
    const baseUrl = getOpenAiBaseUrl(currentConfig);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: currentConfig.model || 'gpt-5.6-sol',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(parseApiError(err, res.status, 'OpenAI'));
    }

    const json = await res.json();
    return json.choices[0]?.message?.content || '';
  }

  if (currentConfig.provider === 'mistral') {
    const keyToUse = currentConfig.apiKey || DEFAULT_MISTRAL_API_KEY;
    const res = await fetch(`${DEFAULT_MISTRAL_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keyToUse}`,
      },
      body: JSON.stringify({
        model: currentConfig.model || 'mistral-large-latest',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(parseApiError(err, res.status, 'Mistral'));
    }

    const json = await res.json();
    return json.choices[0]?.message?.content || '';
  }

  if (currentConfig.provider === 'gemini' && currentConfig.apiKey) {
    const model = currentConfig.model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentConfig.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              ...(systemInstruction ? [{ text: systemInstruction }] : []),
              { text: prompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error: ${err}`);
    }

    const json = await res.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (currentConfig.provider === 'openrouter' && currentConfig.apiKey) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: currentConfig.model || 'openai/gpt-4o-mini',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter API error: ${err}`);
    }

    const json = await res.json();
    return json.choices[0]?.message?.content || '';
  }

  if (currentConfig.provider === 'custom') {
    const endpoint = (currentConfig.customEndpoint || 'http://localhost:11434/v1').replace(/\/$/, '');
    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentConfig.apiKey ? { Authorization: `Bearer ${currentConfig.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: currentConfig.model || 'default',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Custom API error: ${err}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  // Fallback for built-in or offline: returns simulated or rule-based response
  return `Simulated analysis for: ${prompt}`;
}

/**
 * Calls selected LLM provider with multimodal image (screenshot) and prompt
 */
export async function queryVisionLlm(params: VisionLlmParams): Promise<string> {
  const { prompt, systemInstruction, imageBase64, config, temperature = 0.2 } = params;
  const baseConfig = await getAiConfig();
  const currentConfig: AiConfig = {
    ...baseConfig,
    ...config,
  };

  // 1. OpenAI / OpenAI Compatible Gateway (including ExperientialLabs)
  if (currentConfig.provider === 'openai' && currentConfig.apiKey) {
    const baseUrl = getOpenAiBaseUrl(currentConfig);
    const userContent: any[] = [{ type: 'text', text: prompt }];

    if (imageBase64) {
      const formattedUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;
      userContent.push({
        type: 'image_url',
        image_url: {
          url: formattedUrl,
          detail: 'high',
        },
      });
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: currentConfig.model || 'gpt-5.6-sol',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: userContent },
        ],
        temperature,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(parseApiError(err, res.status, 'OpenAI Vision'));
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  // 2. Mistral AI Multimodal / Vision
  if (currentConfig.provider === 'mistral') {
    const keyToUse = currentConfig.apiKey || DEFAULT_MISTRAL_API_KEY;
    // Always strictly respect the user's chosen model
    const model = currentConfig.model || 'ministral-8b-latest';

    const userContent: any[] = [{ type: 'text', text: prompt }];
    if (imageBase64) {
      const formattedUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;
      userContent.push({
        type: 'image_url',
        image_url: { url: formattedUrl },
      });
    }

    const res = await fetch(`${DEFAULT_MISTRAL_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keyToUse}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: userContent },
        ],
        temperature,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(parseApiError(err, res.status, 'Mistral Vision'));
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  // 3. Google Gemini Vision
  if (currentConfig.provider === 'gemini' && currentConfig.apiKey) {
    const model = currentConfig.model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentConfig.apiKey}`;
    const parts: any[] = [];
    if (systemInstruction) parts.push({ text: systemInstruction });
    parts.push({ text: prompt });

    if (imageBase64) {
      const rawBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: rawBase64,
        },
      });
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini Vision API error: ${err}`);
    }

    const json = await res.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // 3. OpenRouter Multimodal
  if (currentConfig.provider === 'openrouter' && currentConfig.apiKey) {
    const userContent: any[] = [{ type: 'text', text: prompt }];
    if (imageBase64) {
      const formattedUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;
      userContent.push({
        type: 'image_url',
        image_url: { url: formattedUrl },
      });
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: currentConfig.model || 'openai/gpt-4o-mini',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: userContent },
        ],
        temperature,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter Vision API error: ${err}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  // 4. Custom Endpoint Multimodal
  if (currentConfig.provider === 'custom') {
    const endpoint = (currentConfig.customEndpoint || 'http://localhost:11434/v1').replace(/\/$/, '');
    const userContent: any[] = [{ type: 'text', text: prompt }];
    if (imageBase64) {
      const formattedUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;
      userContent.push({
        type: 'image_url',
        image_url: { url: formattedUrl },
      });
    }

    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentConfig.apiKey ? { Authorization: `Bearer ${currentConfig.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: currentConfig.model || 'default',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: userContent },
        ],
        temperature,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Custom Vision API error: ${err}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  // Fallback for built-in or mock mode: return an offline simulated agent decision
  return JSON.stringify({
    thought: "Analyzing screenshot in offline fallback mode. Ready to proceed with next step.",
    action: "done",
    answer: "Completed offline vision task.",
    isComplete: true
  });
}

