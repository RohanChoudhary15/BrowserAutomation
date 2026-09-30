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

  describe('GMI Cloud (hy-image-v3.5-preview) Integration', () => {
    it('generates an image using GMI Cloud hy-image-v3.5-preview requestqueue API', async () => {
      (globalThis as any).chrome.runtime.sendMessage = vi.fn(async (msg: any) => {
        if (msg.type === 'PROXY_FETCH') {
          interceptedFetchCalls.push({ url: msg.payload.url, init: msg.payload.options });
          return {
            success: true,
            response: {
              status: 200,
              statusText: 'OK',
              headers: { 'content-type': 'application/json' },
              text: JSON.stringify({
                request_id: '9c3f6b21-4d8a-4e2f-a1c9-7b3d5e2f8a41',
                model: 'hy-image-v3.5-preview',
                status: 'success',
                created_at: 1772184500,
                updated_at: 1772184531,
                outcome: {
                  request_id: '78f7e44c-3410-4da6-830e-9573ac4b3f51',
                  media_urls: [
                    {
                      id: '0',
                      url: 'https://storage.googleapis.com/test-bucket/hy_image_output_0.png',
                      type: 'image',
                      width: 1920,
                      height: 1080,
                    },
                  ],
                  thumbnail_image_url: 'https://storage.googleapis.com/test-bucket/hy_image_output_0.png',
                },
              }),
            },
          };
        }
        return { success: true };
      });

      const node: WorkflowNode = {
        id: 'node_gmi_img',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'generate_image',
          label: 'AI Image Generator',
          properties: {
            prompt: 'A misty mountain village at sunrise, traditional architecture, soft golden light.',
            model: 'hy-image-v3.5-preview',
            size: '1920x1080',
            apiKey: 'gmi-secret-token-xyz',
            outputVariable: 'mountainImage',
          },
        },
      };

      const result = await executeGenerateImage(node, mockContext);
      expect(result.success).toBe(true);
      expect(result.output).toBe('https://storage.googleapis.com/test-bucket/hy_image_output_0.png');
      expect(result.variables?.mountainImage).toBe('https://storage.googleapis.com/test-bucket/hy_image_output_0.png');
      expect(result.variables?.mountainImage_thumbnail).toBe('https://storage.googleapis.com/test-bucket/hy_image_output_0.png');
      expect(result.variables?.mountainImage_request_id).toBe('9c3f6b21-4d8a-4e2f-a1c9-7b3d5e2f8a41');
      expect(result.variables?.mountainImage_media_urls?.length).toBe(1);

      // Verify request payload matches GMI Cloud specification
      expect(interceptedFetchCalls.length).toBe(1);
      const call = interceptedFetchCalls[0];
      expect(call.url).toBe('https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests');
      expect((call.init?.headers as any).Authorization).toBe('Bearer gmi-secret-token-xyz');
      const body = JSON.parse(call.init?.body as string);
      expect(body.model).toBe('hy-image-v3.5-preview');
      expect(body.payload.prompt).toBe('A misty mountain village at sunrise, traditional architecture, soft golden light.');
      expect(body.payload.size).toBe('1920x1080');
    });

    it('polls GMI Cloud request queue if job is initially queued or processing', async () => {
      let callCount = 0;
      (globalThis as any).chrome.runtime.sendMessage = vi.fn(async (msg: any) => {
        if (msg.type === 'PROXY_FETCH') {
          interceptedFetchCalls.push({ url: msg.payload.url, init: msg.payload.options });
          callCount++;
          if (callCount === 1) {
            // First call: initial POST returning queued status
            return {
              success: true,
              response: {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                text: JSON.stringify({
                  request_id: 'async-job-888',
                  model: 'hy-image-v3.5-preview',
                  status: 'processing',
                }),
              },
            };
          } else {
            // Second call: GET polling returning success
            return {
              success: true,
              response: {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                text: JSON.stringify({
                  request_id: 'async-job-888',
                  status: 'success',
                  outcome: {
                    media_urls: [
                      {
                        url: 'https://storage.googleapis.com/test-bucket/final_async_output.png',
                        type: 'image',
                        width: 1920,
                        height: 1080,
                      },
                    ],
                  },
                }),
              },
            };
          }
        }
        return { success: true };
      });

      const node: WorkflowNode = {
        id: 'node_gmi_async',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'generate_image',
          label: 'AI Image Generator',
          properties: {
            prompt: 'Futuristic city street at night',
            model: 'hy-image-v3.5-preview',
            size: '1920x1080',
            apiKey: 'gmi-key-async',
            outputVariable: 'cityImg',
          },
        },
      };

      const result = await executeGenerateImage(node, mockContext);
      expect(result.success).toBe(true);
      expect(result.output).toBe('https://storage.googleapis.com/test-bucket/final_async_output.png');
      expect(interceptedFetchCalls.length).toBe(2);
      expect(interceptedFetchCalls[0].url).toBe('https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests');
      expect(interceptedFetchCalls[1].url).toBe('https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests/async-job-888');
    });

    it('throws error when GMI Cloud request fails', async () => {
      (globalThis as any).chrome.runtime.sendMessage = vi.fn(async () => ({
        success: true,
        response: {
          status: 402,
          statusText: 'Payment Required',
          headers: {},
          text: JSON.stringify({
            message: 'Insufficient balance on GMI Cloud account',
          }),
        },
      }));

      const node: WorkflowNode = {
        id: 'node_gmi_err',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'generate_image',
          label: 'AI Image Generator',
          properties: {
            prompt: 'Test prompt',
            model: 'hy-image-v3.5-preview',
            apiKey: 'gmi-key',
          },
        },
      };

      await expect(executeGenerateImage(node, mockContext)).rejects.toThrow(
        /GMI Cloud Image Generation error \(402\): Insufficient balance/
      );
    });

    it('supports image input option for GMI Cloud (img2img / reference)', async () => {
      (globalThis as any).chrome.runtime.sendMessage = vi.fn(async (msg: any) => {
        if (msg.type === 'PROXY_FETCH') {
          interceptedFetchCalls.push({ url: msg.payload.url, init: msg.payload.options });
          return {
            success: true,
            response: {
              status: 200,
              statusText: 'OK',
              headers: { 'content-type': 'application/json' },
              text: JSON.stringify({
                request_id: 'img2img-job-123',
                status: 'success',
                outcome: {
                  media_urls: [{ url: 'https://storage.googleapis.com/test-bucket/img2img_out.png', type: 'image' }],
                },
              }),
            },
          };
        }
        return { success: true };
      });

      const node: WorkflowNode = {
        id: 'node_gmi_img2img',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'generate_image',
          label: 'AI Image Generator',
          properties: {
            prompt: 'Transform into watercolor oil painting',
            inputImage: 'https://example.com/source_photo.jpg',
            model: 'hy-image-v3.5-preview',
            apiKey: 'gmi-key',
            outputVariable: 'paintedImage',
          },
        },
      };

      const result = await executeGenerateImage(node, mockContext);
      expect(result.success).toBe(true);
      expect(result.output).toBe('https://storage.googleapis.com/test-bucket/img2img_out.png');

      expect(interceptedFetchCalls.length).toBe(1);
      const payload = JSON.parse(interceptedFetchCalls[0].init?.body as string).payload;
      expect(payload.image).toBe('https://example.com/source_photo.jpg');
      expect(payload.image_url).toBe('https://example.com/source_photo.jpg');
      expect(payload.messages[0].content[1].image_url.url).toBe('https://example.com/source_photo.jpg');
    });

    it('supports asynchronous image generation (4 images) with GMI Cloud', async () => {
      let reqCount = 0;
      (globalThis as any).chrome.runtime.sendMessage = vi.fn(async (msg: any) => {
        if (msg.type === 'PROXY_FETCH') {
          interceptedFetchCalls.push({ url: msg.payload.url, init: msg.payload.options });
          reqCount++;
          return {
            success: true,
            response: {
              status: 200,
              statusText: 'OK',
              headers: { 'content-type': 'application/json' },
              text: JSON.stringify({
                request_id: `async-job-${reqCount}`,
                status: 'success',
                outcome: {
                  media_urls: [
                    {
                      url: `https://storage.googleapis.com/test-bucket/async_variation_${reqCount}.png`,
                      type: 'image',
                    },
                  ],
                },
              }),
            },
          };
        }
        return { success: true };
      });

      const node: WorkflowNode = {
        id: 'node_gmi_async_4',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'generate_image',
          label: 'AI Image Generator',
          properties: {
            prompt: 'Futuristic sci-fi vehicle concept art',
            model: 'hy-image-v3.5-preview',
            asyncCount: 4,
            apiKey: 'gmi-key-async-batch',
            outputVariable: 'vehicleVariations',
          },
        },
      };

      const result = await executeGenerateImage(node, mockContext);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.output)).toBe(true);
      expect((result.output as string[]).length).toBe(4);
      expect(result.variables?.vehicleVariations_count).toBe(4);
      expect(result.variables?.vehicleVariations_images?.length).toBe(4);
      expect(interceptedFetchCalls.length).toBe(4);
    });
  });

  describe('Asynchronous Generation & Image Input for OpenAI / Custom models', () => {
    it('supports image input (img2img) with variable interpolation', async () => {
      mockContext.variables['refLogo'] = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      (globalThis as any).chrome.runtime.sendMessage = vi.fn(async (msg: any) => {
        if (msg.type === 'PROXY_FETCH') {
          interceptedFetchCalls.push({ url: msg.payload.url, init: msg.payload.options });
          return {
            success: true,
            response: {
              status: 200,
              statusText: 'OK',
              headers: { 'content-type': 'application/json' },
              text: JSON.stringify({
                data: [{ url: 'https://images.openai.com/generated/img2img_result.png' }],
              }),
            },
          };
        }
        return { success: true };
      });

      const node: WorkflowNode = {
        id: 'node_openai_img2img',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'generate_image',
          label: 'AI Image Generator',
          properties: {
            prompt: 'Embossed chrome 3D version of {{brand}} logo',
            inputImage: '{{refLogo}}',
            model: 'dall-e-2',
            outputVariable: 'embossedLogo',
          },
        },
      };

      const result = await executeGenerateImage(node, mockContext);
      expect(result.success).toBe(true);
      expect(result.output).toBe('https://images.openai.com/generated/img2img_result.png');

      const body = JSON.parse(interceptedFetchCalls[0].init?.body as string);
      expect(body.image).toContain('data:image/png;base64,');
      expect(body.image_url).toContain('data:image/png;base64,');
      expect(body.prompt).toContain('AeroTech');
    });

    it('generates 8 images asynchronously in parallel', async () => {
      let callIndex = 0;
      (globalThis as any).chrome.runtime.sendMessage = vi.fn(async (msg: any) => {
        if (msg.type === 'PROXY_FETCH') {
          interceptedFetchCalls.push({ url: msg.payload.url, init: msg.payload.options });
          callIndex++;
          return {
            success: true,
            response: {
              status: 200,
              statusText: 'OK',
              headers: { 'content-type': 'application/json' },
              text: JSON.stringify({
                data: [{ url: `https://images.openai.com/generated/batch_art_${callIndex}.png` }],
              }),
            },
          };
        }
        return { success: true };
      });

      const node: WorkflowNode = {
        id: 'node_async_8',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'generate_image',
          label: 'AI Image Generator',
          properties: {
            prompt: 'Neon cyberpunk portrait collection',
            model: 'dall-e-3',
            asyncCount: 8,
            outputVariable: 'cyberPortraits',
          },
        },
      };

      const result = await executeGenerateImage(node, mockContext);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.output)).toBe(true);
      expect((result.output as string[]).length).toBe(8);
      expect(result.variables?.cyberPortraits_images?.length).toBe(8);
      expect(result.variables?.cyberPortraits_count).toBe(8);
      expect(interceptedFetchCalls.length).toBe(8);
    });

    it('auto-downloads all generated variations with numbered filenames', async () => {
      const downloadedFiles: string[] = [];
      (globalThis as any).chrome.downloads = {
        download: vi.fn(({ filename }: any, cb: any) => {
          downloadedFiles.push(filename);
          cb(123);
        }),
      };

      let callIndex = 0;
      (globalThis as any).chrome.runtime.sendMessage = vi.fn(async (msg: any) => {
        if (msg.type === 'PROXY_FETCH') {
          interceptedFetchCalls.push({ url: msg.payload.url, init: msg.payload.options });
          callIndex++;
          return {
            success: true,
            response: {
              status: 200,
              statusText: 'OK',
              headers: { 'content-type': 'application/json' },
              text: JSON.stringify({
                data: [{ url: `https://images.openai.com/generated/download_test_${callIndex}.png` }],
              }),
            },
          };
        }
        return { success: true };
      });

      const node: WorkflowNode = {
        id: 'node_async_dl',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'generate_image',
          label: 'AI Image Generator',
          properties: {
            prompt: 'Landscape wallpapers',
            asyncCount: 2,
            autoDownload: true,
            downloadFilename: 'wallpaper',
            outputVariable: 'wallpapers',
          },
        },
      };

      const result = await executeGenerateImage(node, mockContext);
      expect(result.success).toBe(true);
      expect(downloadedFiles).toEqual(['wallpaper_1.png', 'wallpaper_2.png']);
    });
  });
});

