import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchAvailableModels,
  getDefaultModelForProvider,
  DEFAULT_FALLBACK_MODELS,
  getOpenAiBaseUrl,
  queryLlm,
  queryVisionLlm,
  DEFAULT_MISTRAL_API_KEY,
  DEFAULT_MISTRAL_BASE_URL,
} from '../src/ai/aiService';

describe('AI Models & /models Endpoint', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default fallback models for built-in provider', async () => {
    const models = await fetchAvailableModels({ provider: 'built-in' });
    expect(models).toEqual(DEFAULT_FALLBACK_MODELS['built-in']);
    expect(models[0].id).toBe('semantic-parser-v1');
  });

  it('provides sensible default models for all providers', () => {
    expect(getDefaultModelForProvider('openai')).toBe('gpt-5.6-sol');
    expect(getDefaultModelForProvider('mistral')).toBe('ministral-8b-latest');
    expect(getDefaultModelForProvider('gemini')).toBe('gemini-1.5-flash');
    expect(getDefaultModelForProvider('openrouter')).toBe('openai/gpt-4o-mini');
    expect(getDefaultModelForProvider('custom')).toBe('default');
  });

  it('fetches and sorts OpenAI models from /v1/models', async () => {
    const mockOpenAiResponse = {
      object: 'list',
      data: [
        { id: 'davinci-002' },
        { id: 'gpt-4o-mini' },
        { id: 'babbage-002' },
        { id: 'gpt-4o' },
        { id: 'gpt-5.6-sol' },
        { id: 'o1-preview' },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockOpenAiResponse,
    } as Response);

    const models = await fetchAvailableModels({
      provider: 'openai',
      apiKey: 'test-key',
    });

    // gpt-5.6-sol should be at the very top, followed by other chat/reasoning models
    const ids = models.map(m => m.id);
    expect(ids[0]).toBe('gpt-5.6-sol');
    expect(ids.slice(1, 4)).toEqual(expect.arrayContaining(['gpt-4o', 'gpt-4o-mini', 'o1-preview']));
    expect(ids).toContain('davinci-002');
  });

  it('fetches and parses Google Gemini models from /v1beta/models', async () => {
    const mockGeminiResponse = {
      models: [
        {
          name: 'models/gemini-1.5-flash',
          displayName: 'Gemini 1.5 Flash',
          supportedGenerationMethods: ['generateContent', 'countTokens'],
        },
        {
          name: 'models/gemini-1.5-pro',
          displayName: 'Gemini 1.5 Pro',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/text-embedding-004',
          displayName: 'Text Embedding',
          supportedGenerationMethods: ['embedContent'],
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockGeminiResponse,
    } as Response);

    const models = await fetchAvailableModels({
      provider: 'gemini',
      apiKey: 'test-key',
    });

    // Should strip models/ prefix and filter out embedContent-only models
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('gemini-1.5-flash');
    expect(models[1].id).toBe('gemini-1.5-pro');
  });

  it('fetches OpenRouter models from /api/v1/models', async () => {
    const mockOpenRouterResponse = {
      data: [
        {
          id: 'anthropic/claude-3.5-sonnet',
          name: 'Anthropic: Claude 3.5 Sonnet',
          context_length: 200000,
        },
        {
          id: 'openai/gpt-4o',
          name: 'OpenAI: GPT-4o',
          context_length: 128000,
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockOpenRouterResponse,
    } as Response);

    const models = await fetchAvailableModels({
      provider: 'openrouter',
      apiKey: 'test-key',
    });

    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('anthropic/claude-3.5-sonnet');
    expect(models[0].contextLength).toBe(200000);
  });

  it('gracefully falls back to default models if fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const models = await fetchAvailableModels({
      provider: 'openai',
      apiKey: 'invalid-key',
    });

    expect(models).toEqual(DEFAULT_FALLBACK_MODELS.openai);
  });

  it('normalizes OpenAI custom base URLs correctly', () => {
    expect(getOpenAiBaseUrl({ openaiBaseUrl: 'https://api.experientiallabs.ai' })).toBe('https://api.experientiallabs.ai/v1');
    expect(getOpenAiBaseUrl({ openaiBaseUrl: 'https://api.experientiallabs.ai/' })).toBe('https://api.experientiallabs.ai/v1');
    expect(getOpenAiBaseUrl({ openaiBaseUrl: 'https://api.experientiallabs.ai/v1' })).toBe('https://api.experientiallabs.ai/v1');
    expect(getOpenAiBaseUrl({ openaiBaseUrl: 'https://api.openai.com/v1' })).toBe('https://api.openai.com/v1');
    expect(getOpenAiBaseUrl({})).toBe('https://api.experientiallabs.ai/v1');
  });

  it('queries custom OpenAI base URL for /models and chat completions', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'o3-mini' }, { id: 'gpt-4o' }],
      }),
    } as Response);

    const customBase = 'https://api.experientiallabs.ai';
    const models = await fetchAvailableModels({
      provider: 'openai',
      apiKey: 'xpl_b81a9b3b640cb97185a3f135ed97f8922ec849ee',
      openaiBaseUrl: customBase,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.experientiallabs.ai/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer xpl_b81a9b3b640cb97185a3f135ed97f8922ec849ee' },
      })
    );
    expect(models.map(m => m.id)).toEqual(['gpt-4o', 'o3-mini']);
  });

  it('fetches and sorts Mistral models from /v1/models with bearer authentication', async () => {
    const mockMistralResponse = {
      object: 'list',
      data: [
        { id: 'mistral-ocr-4-0', capabilities: { completion_chat: false, vision: true } },
        { id: 'codestral-latest', capabilities: { completion_chat: true, vision: false } },
        { id: 'mistral-large-latest', capabilities: { completion_chat: true, vision: false } },
        { id: 'ministral-8b-latest', capabilities: { completion_chat: true, vision: true } },
        { id: 'mistral-small-latest', capabilities: { completion_chat: true, vision: true } },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockMistralResponse,
    } as Response);

    const models = await fetchAvailableModels({
      provider: 'mistral',
      apiKey: 'xT6AO2YesBGeD3corU4a8ThNSKVHqBPf',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.mistral.ai/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer xT6AO2YesBGeD3corU4a8ThNSKVHqBPf' },
      })
    );

    const ids = models.map(m => m.id);
    // Should filter out mistral-ocr-4-0 (non-chat)
    expect(ids).not.toContain('mistral-ocr-4-0');
    // Prioritizes ministral-8b, mistral-small, codestral, etc.
    expect(ids[0]).toBe('ministral-8b-latest');
    expect(ids[1]).toBe('mistral-small-latest');
    expect(ids).toContain('codestral-latest');
  });

  it('executes Mistral chat completions via queryLlm', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Claude Monet is often regarded as one of the best French painters.',
            },
          },
        ],
      }),
    } as Response);

    const result = await queryLlm(
      'Who is the best French painter? Answer in one short sentence.',
      'You are a helpful art assistant.',
      {
        provider: 'mistral',
        apiKey: 'xT6AO2YesBGeD3corU4a8ThNSKVHqBPf',
        model: 'ministral-8b-latest',
      }
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.mistral.ai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer xT6AO2YesBGeD3corU4a8ThNSKVHqBPf',
          'Content-Type': 'application/json',
        }),
      })
    );

    const reqBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(reqBody.model).toBe('ministral-8b-latest');
    expect(reqBody.messages).toHaveLength(2);
    expect(reqBody.messages[0].role).toBe('system');
    expect(reqBody.messages[1].content).toBe('Who is the best French painter? Answer in one short sentence.');
    expect(result).toBe('Claude Monet is often regarded as one of the best French painters.');
  });

  it('executes Mistral multimodal vision via queryVisionLlm respecting chosen model', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"thought": "Saw button", "action": "click", "elementIndex": 1}',
            },
          },
        ],
      }),
    } as Response);

    const result = await queryVisionLlm({
      prompt: 'Click the submit button',
      imageBase64: 'base64imagedata',
      config: {
        provider: 'mistral',
        apiKey: 'xT6AO2YesBGeD3corU4a8ThNSKVHqBPf',
        model: 'ministral-8b-latest',
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.mistral.ai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer xT6AO2YesBGeD3corU4a8ThNSKVHqBPf',
        }),
      })
    );

    const reqBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    // Must respect user's configured model directly, never forcing pixtral
    expect(reqBody.model).toBe('ministral-8b-latest');
    expect(reqBody.messages[0].content[1].type).toBe('image_url');
    expect(reqBody.messages[0].content[1].image_url.url).toContain('base64imagedata');
    expect(result).toContain('"action": "click"');
  });

  it('safely handles polymorphic config object as second argument without serializing objects into system message', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Briefing report generated.' } }],
      }),
    } as Response);

    // Call queryLlm with { model, systemPrompt } as second argument (similar to WandB / Custom LLM usage)
    const result = await queryLlm('Analyze data', {
      model: 'deepseek-ai/DeepSeek-V4.1-Flash',
      systemPrompt: 'You are an elite data analyst.',
      provider: 'custom',
      customEndpoint: 'https://api.inference.wandb.ai/v1',
      apiKey: 'test-wandb-key',
    });

    expect(result).toBe('Briefing report generated.');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.inference.wandb.ai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      })
    );

    const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(callBody.model).toBe('deepseek-ai/DeepSeek-V4.1-Flash');
    // Content MUST be string, never object!
    expect(typeof callBody.messages[0].content).toBe('string');
    expect(callBody.messages[0].content).toBe('You are an elite data analyst.');
    expect(callBody.messages[1].role).toBe('user');
    expect(callBody.messages[1].content).toBe('Analyze data');
  });
});

