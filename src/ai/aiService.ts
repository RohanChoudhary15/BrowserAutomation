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
  // If user has a genuine OpenAI key (sk-...) and hasn't set a custom base URL,
  // route directly to api.openai.com instead of the default ExperientialLabs gateway
  const hasCustomBaseUrl = config?.openaiBaseUrl && config.openaiBaseUrl.trim() !== '' && config.openaiBaseUrl.trim() !== DEFAULT_OPENAI_BASE_URL;
  const isGenuineOpenAiKey = config?.apiKey && config.apiKey.startsWith('sk-');
  
  let raw: string;
  if (isGenuineOpenAiKey && !hasCustomBaseUrl) {
    raw = 'https://api.openai.com';
  } else {
    raw = config?.openaiBaseUrl?.trim() || DEFAULT_OPENAI_BASE_URL;
  }
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

export function parseApiError(
  errOrText: any,
  statusOrProvider?: number | string,
  providerName?: string,
  modelName?: string
): string {
  let errText = '';
  let status = 0;
  let provider = 'AI';
  let model = modelName;

  if (typeof errOrText === 'string') {
    errText = errOrText;
  } else if (errOrText && typeof errOrText === 'object') {
    errText = errOrText.message || errOrText.error || String(errOrText);
  } else {
    errText = String(errOrText || '');
  }

  if (typeof statusOrProvider === 'number') {
    status = statusOrProvider;
    provider = providerName || 'AI';
  } else if (typeof statusOrProvider === 'string') {
    provider = statusOrProvider;
    model = providerName;
    const codeMatch = errText.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
    if (codeMatch) {
      status = parseInt(codeMatch[1], 10);
    }
  }

  let parsedMessage = '';
  try {
    const json = JSON.parse(errText);
    parsedMessage = json.error?.message || json.message || json.error || '';
  } catch {
    parsedMessage = typeof errText === 'string' ? errText.slice(0, 300) : String(errText);
  }

  const modelTag = model ? ` [Model: ${model}]` : '';
  const prefix = `[${provider}${modelTag}]`;

  // Specific check for missing API key
  if (/missing|no api key|api key.*missing|unconfigured/i.test(errText) && !/invalid/i.test(errText)) {
    return `${prefix} API Key is Missing: Please configure your ${provider} API key in AutoFlow AI Settings to use this model.`;
  }

  // Check HTTP status codes FIRST before generic network error regex,
  // so real upstream errors (401, 429, etc.) are never masked as "Failed to fetch"
  if (status === 401) {
    return `${prefix} Invalid API Key or Unauthorized (401): Authentication failed. Please verify your ${provider} API key in AutoFlow AI Settings. (Details: ${parsedMessage || 'Unauthorized'})`;
  }

  if (status === 404) {
    return `${prefix} Model Not Found (404): The requested model "${model || 'selected'}" does not exist or your API key lacks access. (Details: ${parsedMessage || errText})`;
  }

  if (status === 429) {
    return `${prefix} Rate Limit or Quota Exceeded (429): Too many requests or insufficient credit balance on ${provider}. Check your billing plan and account balance. (Details: ${parsedMessage || errText})`;
  }

  if (status === 400) {
    if (/context|token|length|maximum/i.test(parsedMessage || errText)) {
      return `${prefix} Context Window Exceeded (400): The prompt exceeds token limits. Please reduce the page content or prompt length. (Details: ${parsedMessage || errText})`;
    }
    return `${prefix} Bad Request (400): Invalid request parameters. (Details: ${parsedMessage || errText})`;
  }

  if (status >= 500) {
    return `${prefix} Service Outage / Server Error (${status}): ${provider} servers are temporarily unavailable or experiencing high load. (Details: ${parsedMessage || errText})`;
  }

  // Network or CORS error (checked AFTER status codes so real API errors are never masked)
  if (/failed to fetch|network error|cors|offline|connection refused/i.test(errText)) {
    return `${prefix} Network Connection / CORS Error: Failed to reach ${provider} endpoints. Check internet connection, proxy settings, or host permissions. (Details: ${parsedMessage || errText})`;
  }

  return `${prefix} Error (${status || 'general'}): ${parsedMessage || errText || 'Request failed'}`;
}

/**
 * Resilient fetch wrapper that tries direct fetch first, and if blocked by CORS or network,
 * delegates to the background service worker (which has host_permissions for <all_urls> and zero CORS restrictions).
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  // In Chrome extension context, prefer background proxy to avoid CORS issues entirely
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const bgRes = await chrome.runtime.sendMessage({
        type: 'PROXY_FETCH',
        payload: {
          url,
          options: {
            method: init?.method || 'GET',
            headers: init?.headers as any,
            body: init?.body as any,
          },
        },
      });
      if (bgRes && bgRes.success && bgRes.response) {
        return new Response(bgRes.response.text, {
          status: bgRes.response.status,
          statusText: bgRes.response.statusText,
          headers: bgRes.response.headers,
        });
      }
      // Background proxy returned failure - propagate the actual error, not a generic "Failed to fetch"
      if (bgRes && !bgRes.success && bgRes.error) {
        throw new Error(bgRes.error);
      }
    } catch (bgErr: any) {
      // If bgErr is our own rethrow from above, propagate it
      if (bgErr.message && !bgErr.message.includes('Could not establish connection')) {
        throw bgErr;
      }
      console.warn('[AutoFlow] Background proxy unavailable, falling back to direct fetch:', bgErr.message);
    }
  }

  // Direct fetch fallback (non-extension context, or background proxy unavailable)
  return await fetch(url, init);
}

/**
 * Ensures the requested model is compatible with the target provider,
 * falling back to the provider's default model if incompatible.
 */
export function resolveCompatibleModel(provider: AiProvider, requestedModel?: string, config?: Partial<AiConfig>): string {
  if (!requestedModel || requestedModel.trim() === '') {
    return getDefaultModelForProvider(provider);
  }
  const clean = requestedModel.trim().toLowerCase();
  if (provider === 'mistral') {
    if (!clean.includes('mistral') && !clean.includes('codestral')) {
      return 'ministral-8b-latest';
    }
  } else if (provider === 'gemini') {
    if (!clean.includes('gemini')) {
      return 'gemini-1.5-flash';
    }
  } else if (provider === 'openai') {
    if (clean.includes('mistral') || clean.includes('gemini') || clean.includes('claude')) {
      return 'gpt-4o-mini';
    }
    // Map ExperientialLabs-specific virtual models (gpt-5.6-sol, gpt-5.6-luna) to valid
    // OpenAI models ONLY when routing to api.openai.com (user has genuine sk-... key)
    // When routing to ExperientialLabs, keep virtual models since they're supported there
    if (clean === 'gpt-5.6-sol' || clean === 'gpt-5.6-luna') {
      const resolvedBase = getOpenAiBaseUrl(config);
      if (resolvedBase.includes('api.openai.com')) {
        return 'gpt-4o-mini';
      }
    }
  }
  return requestedModel.trim();
}

/**
 * Mistral AI fallback execution
 */
async function executeMistralFallback(prompt: string, systemInstruction?: string): Promise<string> {
  const cleanSys = systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()
    ? systemInstruction.trim()
    : undefined;
  const res = await safeFetch(`${DEFAULT_MISTRAL_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEFAULT_MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'ministral-8b-latest',
      messages: [
        ...(cleanSys ? [{ role: 'system', content: cleanSys }] : []),
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(parseApiError(err, res.status, 'Mistral Fallback', 'ministral-8b-latest'));
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

/**
 * Calls selected LLM provider with prompt and system instructions.
 * Accepts polymorphic arguments:
 *   queryLlm(prompt, systemInstruction, config)
 *   queryLlm(prompt, { model, systemPrompt, ... })
 */
export async function queryLlm(
  prompt: string,
  systemInstructionOrConfig?: string | (Partial<AiConfig> & { systemPrompt?: string; systemInstruction?: string }),
  configOverride?: Partial<AiConfig>
): Promise<string> {
  let resolvedSystemInstruction: string | undefined;
  let resolvedConfig: Partial<AiConfig> | undefined = configOverride;

  if (typeof systemInstructionOrConfig === 'object' && systemInstructionOrConfig !== null) {
    const { systemPrompt, systemInstruction, ...restConfig } = systemInstructionOrConfig;
    const sys = systemPrompt || systemInstruction;
    if (sys !== undefined && sys !== null) {
      resolvedSystemInstruction = typeof sys === 'string' ? sys : String(sys);
    }
    resolvedConfig = {
      ...restConfig,
      ...configOverride,
    };
  } else if (typeof systemInstructionOrConfig === 'string') {
    resolvedSystemInstruction = systemInstructionOrConfig;
  } else if (systemInstructionOrConfig !== undefined && systemInstructionOrConfig !== null) {
    resolvedSystemInstruction = String(systemInstructionOrConfig);
  }

  const baseConfig = await getAiConfig();
  const currentConfig: AiConfig = {
    ...baseConfig,
    ...resolvedConfig,
  };

  const provider = currentConfig.provider || 'openai';
  const model = resolveCompatibleModel(provider, currentConfig.model, currentConfig);
  const cleanSystem = resolvedSystemInstruction && resolvedSystemInstruction.trim() ? resolvedSystemInstruction.trim() : undefined;
  const cleanPrompt = typeof prompt === 'string' ? prompt : String(prompt ?? '');

  // 1. OpenAI / OpenAI Compatible
  if (provider === 'openai') {
    if (!currentConfig.apiKey) {
      throw new Error(`[OpenAI] API Key missing. Please open AutoFlow Settings / AI Copilot and enter your OpenAI API key.`);
    }

    const baseUrl = getOpenAiBaseUrl(currentConfig);
    try {
      const res = await safeFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentConfig.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(cleanSystem ? [{ role: 'system', content: cleanSystem }] : []),
            { role: 'user', content: cleanPrompt },
          ],
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        const isDefaultKey = !currentConfig.apiKey || currentConfig.apiKey === DEFAULT_OPENAI_API_KEY;
        // If default gateway returns model locked, purchase required, card required, or quota exceeded, fall back to Mistral
        if (isDefaultKey && (res.status === 429 || /purchase|locked|credit|card_required|insufficient_quota/i.test(err))) {
          console.warn('[AutoFlow AI] Primary gateway blocked (status ' + res.status + '). Falling back to Mistral AI.');
          return await executeMistralFallback(cleanPrompt, cleanSystem);
        }
        throw new Error(parseApiError(err, res.status, 'OpenAI', model));
      }

      const json = await res.json();
      return json.choices?.[0]?.message?.content || '';
    } catch (openAiErr: any) {
      // If default gateway failed with network/CORS or fetch failure, automatically fallback to Mistral
      const isDefaultGateway = !currentConfig.openaiBaseUrl || currentConfig.openaiBaseUrl === DEFAULT_OPENAI_BASE_URL || currentConfig.apiKey === DEFAULT_OPENAI_API_KEY;
      if (isDefaultGateway && /fetch|network|cors|offline|locked|purchase/i.test(openAiErr.message)) {
        console.warn('[AutoFlow AI] Primary gateway fetch failed, auto-falling back to Mistral AI:', openAiErr.message);
        try {
          return await executeMistralFallback(cleanPrompt, cleanSystem);
        } catch (fallbackErr) {
          console.warn('Mistral fallback failed:', fallbackErr);
        }
      }
      throw openAiErr;
    }
  }

  // 2. Mistral AI
  if (provider === 'mistral') {
    const keyToUse = currentConfig.apiKey || DEFAULT_MISTRAL_API_KEY;
    const res = await safeFetch(`${DEFAULT_MISTRAL_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keyToUse}`,
      },
      body: JSON.stringify({
        model: model || 'ministral-8b-latest',
        messages: [
          ...(cleanSystem ? [{ role: 'system', content: cleanSystem }] : []),
          { role: 'user', content: cleanPrompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(parseApiError(err, res.status, 'Mistral', model || 'ministral-8b-latest'));
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  // 3. Google Gemini
  if (provider === 'gemini') {
    if (!currentConfig.apiKey) {
      throw new Error(`[Gemini] API Key missing. Please open AutoFlow Settings and enter your Google Gemini API key.`);
    }

    const geminiModel = model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${currentConfig.apiKey}`;
    const res = await safeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              ...(cleanSystem ? [{ text: cleanSystem }] : []),
              { text: cleanPrompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(parseApiError(err, res.status, 'Gemini', geminiModel));
    }

    const json = await res.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // 4. OpenRouter
  if (provider === 'openrouter') {
    if (!currentConfig.apiKey) {
      throw new Error(`[OpenRouter] API Key missing. Please open AutoFlow Settings and enter your OpenRouter API key.`);
    }

    const routerModel = model || 'openai/gpt-4o-mini';
    const res = await safeFetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: routerModel,
        messages: [
          ...(cleanSystem ? [{ role: 'system', content: cleanSystem }] : []),
          { role: 'user', content: cleanPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(parseApiError(err, res.status, 'OpenRouter', routerModel));
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  // 5. Custom / Local LLM
  if (provider === 'custom') {
    const endpoint = (currentConfig.customEndpoint || 'http://localhost:11434/v1').replace(/\/$/, '');
    const customModel = model || 'default';
    const res = await safeFetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentConfig.apiKey ? { Authorization: `Bearer ${currentConfig.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: customModel,
        messages: [
          ...(cleanSystem ? [{ role: 'system', content: cleanSystem }] : []),
          { role: 'user', content: cleanPrompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(parseApiError(err, res.status, `Custom LLM (${endpoint})`, customModel));
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  // Fallback for built-in or offline: returns simulated or rule-based response
  return `Simulated analysis for: ${cleanPrompt}`;
}

/**
 * Calls selected LLM provider with multimodal image (screenshot) and prompt
 */
/**
 * Valid 100x100 PNG image data URI used when viewport screenshots fail or are empty.
 * Guarantees compliance with OpenAI's minimum image dimension requirement (>= 10x10px).
 */
export const VALID_FALLBACK_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAtklEQVR4nO3QQQkAIADAQBv4tIP9A1rBjwzhYAHGjbm2Lhv5wUfBggUrDxYsWHmwYMHKgwULVh4sWLDyYMGClQcLFqw8WLBg5cGCBSsPFixYebBgwcqDBQtWHixYsPJgwYKVBwsWrDxYsGDlwYIFKw8WLFh5sGDByoMFC1YeLFiw8mDBgpUHCxasPFiwYOXBggUrDxYsWHmwYMHKgwULVh4sWLDyYMGClQcLFqw8WLBg5cGC9aYDN7o1tSd902oAAAAASUVORK5CYII=';

/**
 * Decodes base64 string to Uint8Array safely across Node.js and Browser environments.
 */
function decodeBase64ToBytes(base64: string): Uint8Array | null {
  try {
    const raw = base64.replace(/^data:image\/[a-z]+;base64,/, '').trim();
    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(raw, 'base64'));
    } else if (typeof atob !== 'undefined') {
      const binary = atob(raw);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extracts width and height from PNG, GIF, or JPEG image headers.
 */
export function getImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!bytes || bytes.length < 24) return null;

  // 1. PNG check
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }

  // 2. GIF check
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    return { width, height };
  }

  // 3. JPEG check
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length - 8) {
      if (bytes[offset] === 0xff) {
        const marker = bytes[offset + 1];
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
          const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
          return { width, height };
        }
        offset += 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3]);
      } else {
        offset++;
      }
    }
  }

  return null;
}

/**
 * Validates and sanitizes base64 images before sending to multimodal Vision LLMs.
 * Replaces corrupted, 1x1, or <10x10 images with a compliant 100x100 image to prevent
 * OpenAI API 400 errors ("image should be at least 10px got 1 by 1 px").
 */
export function sanitizeVisionImage(imageBase64?: string): string | undefined {
  if (!imageBase64 || typeof imageBase64 !== 'string') return undefined;

  const trimmed = imageBase64.trim();
  if (trimmed === '') return undefined;

  // Known 1x1 pixel signatures
  if (
    trimmed.includes('wgALCAABAAEBAREA') || // 1x1 JPEG placeholder from browserAgent
    trimmed.includes('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7') || // 1x1 GIF
    trimmed.includes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA') // 1x1 PNG
  ) {
    return VALID_FALLBACK_IMAGE;
  }

  // Check actual image dimensions if header can be parsed
  const bytes = decodeBase64ToBytes(trimmed);
  if (bytes) {
    const dims = getImageDimensions(bytes);
    if (dims && (dims.width < 10 || dims.height < 10)) {
      return VALID_FALLBACK_IMAGE;
    }
  }

  return trimmed.startsWith('data:') ? trimmed : `data:image/jpeg;base64,${trimmed}`;
}

/**
 * Mistral AI Vision fallback execution
 */
async function executeMistralVisionFallback(
  prompt: string,
  systemInstruction?: string,
  sanitizedImage?: string,
  temperature = 0.2
): Promise<string> {
  const userContent: any[] = [{ type: 'text', text: prompt }];
  if (sanitizedImage) {
    userContent.push({
      type: 'image_url',
      image_url: { url: sanitizedImage },
    });
  }

  const res = await safeFetch(`${DEFAULT_MISTRAL_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEFAULT_MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'ministral-8b-latest',
      messages: [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: userContent },
      ],
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(parseApiError(err, res.status, 'Mistral Vision Fallback', 'ministral-8b-latest'));
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

export async function queryVisionLlm(params: VisionLlmParams): Promise<string> {
  const { prompt, systemInstruction, imageBase64, config, temperature = 0.2 } = params;
  const baseConfig = await getAiConfig();
  const currentConfig: AiConfig = {
    ...baseConfig,
    ...config,
  };

  const provider = currentConfig.provider || 'openai';
  const model = resolveCompatibleModel(provider, currentConfig.model, currentConfig);
  const sanitizedImage = sanitizeVisionImage(imageBase64);

  // 1. OpenAI / OpenAI Compatible Gateway (including ExperientialLabs)
  if (provider === 'openai' && currentConfig.apiKey) {
    const baseUrl = getOpenAiBaseUrl(currentConfig);
    const userContent: any[] = [{ type: 'text', text: prompt }];

    if (sanitizedImage) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: sanitizedImage,
          detail: 'high',
        },
      });
    }

    try {
      const res = await safeFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentConfig.apiKey}`,
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
        if (/purchase|locked|credit/i.test(err) && currentConfig.apiKey === DEFAULT_OPENAI_API_KEY) {
          console.warn('[AutoFlow AI] Primary vision gateway model locked. Falling back to Mistral Vision.');
          return await executeMistralVisionFallback(prompt, systemInstruction, sanitizedImage, temperature);
        }
        throw new Error(parseApiError(err, res.status, 'OpenAI Vision'));
      }

      const json = await res.json();
      return json.choices?.[0]?.message?.content || '';
    } catch (openAiErr: any) {
      const isDefaultGateway = !currentConfig.openaiBaseUrl || currentConfig.openaiBaseUrl === DEFAULT_OPENAI_BASE_URL || currentConfig.apiKey === DEFAULT_OPENAI_API_KEY;
      if (isDefaultGateway && /fetch|network|cors|offline|locked|purchase/i.test(openAiErr.message)) {
        console.warn('[AutoFlow AI] Primary vision gateway fetch failed, auto-falling back to Mistral Vision:', openAiErr.message);
        try {
          return await executeMistralVisionFallback(prompt, systemInstruction, sanitizedImage, temperature);
        } catch (fallbackErr) {
          console.warn('Mistral vision fallback failed:', fallbackErr);
        }
      }
      throw openAiErr;
    }
  }

  // 2. Mistral AI Multimodal / Vision
  if (provider === 'mistral') {
    const keyToUse = currentConfig.apiKey || DEFAULT_MISTRAL_API_KEY;
    const mistralModel = model || 'ministral-8b-latest';

    const userContent: any[] = [{ type: 'text', text: prompt }];
    if (sanitizedImage) {
      userContent.push({
        type: 'image_url',
        image_url: { url: sanitizedImage },
      });
    }

    const res = await safeFetch(`${DEFAULT_MISTRAL_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keyToUse}`,
      },
      body: JSON.stringify({
        model: mistralModel,
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
  if (provider === 'gemini' && currentConfig.apiKey) {
    const geminiModel = model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${currentConfig.apiKey}`;
    const parts: any[] = [];
    if (systemInstruction) parts.push({ text: systemInstruction });
    parts.push({ text: prompt });

    if (sanitizedImage) {
      const rawBase64 = sanitizedImage.replace(/^data:image\/[a-z]+;base64,/, '');
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: rawBase64,
        },
      });
    }

    const res = await safeFetch(url, {
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

  // 4. OpenRouter Multimodal
  if (provider === 'openrouter' && currentConfig.apiKey) {
    const userContent: any[] = [{ type: 'text', text: prompt }];
    if (sanitizedImage) {
      userContent.push({
        type: 'image_url',
        image_url: { url: sanitizedImage },
      });
    }

    const routerModel = model || 'openai/gpt-4o-mini';
    const res = await safeFetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: routerModel,
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

  // 5. Custom Endpoint Multimodal
  if (provider === 'custom') {
    const endpoint = (currentConfig.customEndpoint || 'http://localhost:11434/v1').replace(/\/$/, '');
    const customModel = model || 'default';
    const userContent: any[] = [{ type: 'text', text: prompt }];
    if (sanitizedImage) {
      userContent.push({
        type: 'image_url',
        image_url: { url: sanitizedImage },
      });
    }

    const res = await safeFetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentConfig.apiKey ? { Authorization: `Bearer ${currentConfig.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: customModel,
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

