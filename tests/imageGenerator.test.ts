import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGenerateImage } from '../src/runtime/executors';
import { WorkflowNode } from '../src/types/workflow';
import { ExecutionContext } from '../src/types/execution';

describe('AI Image Generator Node', () => {
  let mockContext: ExecutionContext;
  let interceptedFetchCalls: Array<{ url: string; init?: RequestInit }> = [];

  beforeEach(() => {
    interceptedFetchCalls = [];
    mockContext = {
      workflowId: 'test-wf',
      currentTabId: 101,
      currentUrl: 'https://example.com',
      variables: {
        productTitle: 'Cybernetic Mechanical Watch',
        brand: 'AeroTech',
      },
      signal: new AbortController().signal,
      log: vi.fn(),
      updateNodeState: vi.fn(),
      getVariable: (name: string) => mockContext.variables[name],
      setVariable: (name: string, val: any) => {
        mockContext.variables[name] = val;
      },
    };

    // Mock chrome.runtime.sendMessage for safeFetch PROXY_FETCH
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn(async (msg: any) => {
          if (msg.type === 'PROXY_FETCH') {
            interceptedFetchCalls.push({ url: msg.payload.url, init: msg.payload.options });

            // Return mock OpenAI Image generation response
            return {
              success: true,
              response: {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                text: JSON.stringify({
                  created: 1711234567,
                  data: [
                    {
                      url: 'https://images.openai.com/generated/test_image_123.png',
                      b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                      revised_prompt: 'A futuristic cybernetic mechanical watch on a reflective pedestal',
                    },
                  ],
                }),
              },
            };
          }
          return { success: true };
        }),
      },
    };
  });

  it('generates an image using DALL-E 3 with variable interpolation', async () => {
    const node: WorkflowNode = {
      id: 'node_img_1',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'generate_image',
        label: 'AI Image Generator',
        properties: {
          prompt: 'Studio product shot of {{productTitle}} by {{brand}}',
          model: 'dall-e-3',
          size: '1024x1024',
          quality: 'hd',
          style: 'vivid',
          responseFormat: 'url',
          outputVariable: 'heroImage',
        },
      },
    };

    const result = await executeGenerateImage(node, mockContext);
    expect(result.success).toBe(true);
    expect(result.output).toBe('https://images.openai.com/generated/test_image_123.png');
    expect(result.variables?.heroImage).toBe('https://images.openai.com/generated/test_image_123.png');
    expect(result.variables?.heroImage_revised_prompt).toContain('futuristic cybernetic');

    // Verify outbound request details
    expect(interceptedFetchCalls.length).toBe(1);
    const call = interceptedFetchCalls[0];
    expect(call.url).toContain('/images/generations');
    const parsedBody = JSON.parse(call.init?.body as string);
    expect(parsedBody.prompt).toBe('Studio product shot of Cybernetic Mechanical Watch by AeroTech');
    expect(parsedBody.model).toBe('dall-e-3');
    expect(parsedBody.quality).toBe('hd');
    expect(parsedBody.style).toBe('vivid');
    expect(parsedBody.size).toBe('1024x1024');
  });

  it('supports separate API key and custom base URL overrides', async () => {
    const node: WorkflowNode = {
      id: 'node_img_custom',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'generate_image',
        label: 'AI Image Generator',
        properties: {
          prompt: 'Abstract geometric art',
          model: 'flux-1.1-pro',
          size: '1024x1792',
          apiKey: 'sk-custom-secret-key-12345',
          baseUrl: 'https://custom-gateway.ai/v1',
          outputVariable: 'artUrl',
        },
      },
    };

    const result = await executeGenerateImage(node, mockContext);
    expect(result.success).toBe(true);

    expect(interceptedFetchCalls.length).toBe(1);
    const call = interceptedFetchCalls[0];
    expect(call.url).toBe('https://custom-gateway.ai/v1/images/generations');
    expect((call.init?.headers as any).Authorization).toBe('Bearer sk-custom-secret-key-12345');
    const parsedBody = JSON.parse(call.init?.body as string);
    expect(parsedBody.model).toBe('flux-1.1-pro');
  });

  it('handles base64 response_format format correctly', async () => {
    const node: WorkflowNode = {
      id: 'node_img_b64',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'generate_image',
        label: 'AI Image Generator',
        properties: {
          prompt: 'Minimalist logo',
          model: 'dall-e-2',
          size: '512x512',
          responseFormat: 'b64_json',
          outputVariable: 'b64Image',
        },
      },
    };

    const result = await executeGenerateImage(node, mockContext);
    expect(result.success).toBe(true);
    expect(result.output).toMatch(/^data:image\/png;base64,/);
    expect(result.variables?.b64Image).toMatch(/^data:image\/png;base64,/);
  });

  it('throws a descriptive error when API returns non-200 status', async () => {
    (globalThis as any).chrome.runtime.sendMessage = vi.fn(async () => ({
      success: true,
      response: {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        text: JSON.stringify({
          error: {
            message: 'Your request was rejected as a result of our safety system.',
          },
        }),
      },
    }));

    const node: WorkflowNode = {
      id: 'node_img_err',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'generate_image',
        label: 'AI Image Generator',
        properties: {
          prompt: 'Dangerous unsafe content',
        },
      },
    };

    await expect(executeGenerateImage(node, mockContext)).rejects.toThrow(
      /safety system/
    );
  });

  it('throws when prompt is empty', async () => {
    const node: WorkflowNode = {
      id: 'node_img_empty',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'generate_image',
        label: 'AI Image Generator',
        properties: {
          prompt: '',
        },
      },
    };

    await expect(executeGenerateImage(node, mockContext)).rejects.toThrow(
      'Image Generator requires a prompt.'
    );
  });
});
