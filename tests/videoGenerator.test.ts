import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  downloadImageBytes,
  createUploadSlot,
  uploadImageBytes,
  getUploadedImageUrl,
  prepareFirstFrame,
  submitH3Job,
  pollQueueStatus,
  getVideoAsset,
  generateVideo,
  DEFAULT_AURAY_API_KEY,
} from '../src/ai/videoService';
import { executeGenerateVideo } from '../src/runtime/executors';
import { WorkflowNode } from '../src/types/workflow';
import { ExecutionContext } from '../src/types/execution';

describe('Video Generator Service (Auray AI / MiniMax H3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('downloadImageBytes', () => {
    it('decodes base64 data URI properly and extracts content type', async () => {
      // 1x1 transparent PNG data URI
      const base64Uri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      const result = await downloadImageBytes(base64Uri);
      expect(result.contentType).toBe('image/png');
      expect(result.bytes).toBeInstanceOf(Uint8Array);
      expect(result.bytes.length).toBeGreaterThan(0);
    });

    it('throws error for invalid data URI format', async () => {
      await expect(downloadImageBytes('data:image/png;notbase64,xyz')).rejects.toThrow(
        /Invalid base64 data URI/
      );
    });
  });

  describe('createUploadSlot', () => {
    it('calls /uploads with correct payload and headers', async () => {
      let interceptedUrl = '';
      let interceptedBody: any;
      let interceptedHeaders: any;

      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn(async (msg: any) => {
            if (msg.type === 'PROXY_FETCH') {
              interceptedUrl = msg.payload.url;
              interceptedBody = JSON.parse(msg.payload.options.body);
              interceptedHeaders = msg.payload.options.headers;
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    upload_url: 'https://storage.auray.ai/upload/slot-123',
                    read: 'https://api.auray.ai/v1/uploads/slot-123',
                  }),
                },
              };
            }
            return { success: true };
          }),
        },
      };

      const slot = await createUploadSlot(
        'auray_sk_test_key',
        'image/png',
        'auray-ai/minimax-h3/text-to-video',
        'https://api.auray.ai/v1'
      );

      expect(interceptedUrl).toBe('https://api.auray.ai/v1/uploads');
      expect(interceptedHeaders.Authorization).toBe('Bearer auray_sk_test_key');
      expect(interceptedBody.address).toBe('auray-ai/minimax-h3/text-to-video');
      expect(interceptedBody.content_type).toBe('image/png');
      expect(slot.upload_url).toBe('https://storage.auray.ai/upload/slot-123');
    });
  });

  describe('submitH3Job', () => {
    it('submits text-to-video payload correctly', async () => {
      let submittedPayload: any;

      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn(async (msg: any) => {
            if (msg.type === 'PROXY_FETCH') {
              submittedPayload = JSON.parse(msg.payload.options.body);
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    request_id: 'req_text_video_999',
                    status_url: 'https://queue.auray.run/status/req_text_video_999',
                    response_url: 'https://queue.auray.run/response/req_text_video_999',
                    status: 'IN_QUEUE',
                  }),
                },
              };
            }
            return { success: true };
          }),
        },
      };

      const job = await submitH3Job({
        prompt: 'Futuristic city in rain with neon lights',
        duration: 15,
        aspectRatio: '16:9',
        resolution: '768P',
        apiKey: 'auray_sk_test_key',
      });

      expect(job.request_id).toBe('req_text_video_999');
      expect(submittedPayload.model).toBe('MiniMax-H3');
      expect(submittedPayload['content[type=text].text']).toBe(
        'Futuristic city in rain with neon lights'
      );
      expect(submittedPayload.duration).toBe(15);
      expect(submittedPayload.ratio).toBe('16:9');
      expect(submittedPayload.resolution).toBe('768P');
    });

    it('submits image-to-video payload correctly when first frame is provided', async () => {
      let submittedPayload: any;

      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn(async (msg: any) => {
            if (msg.type === 'PROXY_FETCH') {
              submittedPayload = JSON.parse(msg.payload.options.body);
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    request_id: 'req_img_video_888',
                    status_url: 'https://queue.auray.run/status/req_img_video_888',
                    response_url: 'https://queue.auray.run/response/req_img_video_888',
                    status: 'IN_QUEUE',
                  }),
                },
              };
            }
            return { success: true };
          }),
        },
      };

      const job = await submitH3Job({
        prompt: 'Camera zooms smoothly into the glowing orb',
        duration: 10,
        aspectRatio: '9:16',
        sound: true,
        firstFramePath: 'uploads/2026/frame.png',
        firstFrameUrl: 'https://storage.auray.ai/signed/frame.png',
        apiKey: 'auray_sk_test_key',
      });

      expect(job.request_id).toBe('req_img_video_888');
      expect(submittedPayload.prompt).toContain('integrated_multimodal_description: [Shot 1]');
      expect(submittedPayload.first_frame_path).toBe('uploads/2026/frame.png');
      expect(submittedPayload.director.startFrame.ref).toBe(
        'https://storage.auray.ai/signed/frame.png'
      );
      expect(submittedPayload.director.sound).toBe(true);
      expect(submittedPayload.duration_seconds).toBe(10);
      expect(submittedPayload.aspect_ratio).toBe('9:16');
    });
  });

  describe('pollQueueStatus', () => {
    it('polls until COMPLETED status is received', async () => {
      let pollCount = 0;
      const progressUpdates: string[] = [];

      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn(async (msg: any) => {
            if (msg.type === 'PROXY_FETCH') {
              pollCount++;
              const status = pollCount >= 3 ? 'COMPLETED' : 'IN_PROGRESS';
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    status,
                    queue_position: pollCount === 1 ? 2 : 0,
                  }),
                },
              };
            }
            return { success: true };
          }),
        },
      };

      const finalStatus = await pollQueueStatus(
        'test_key',
        'https://queue.auray.run/status/123',
        10, // 10ms poll interval for test
        5000,
        (status) => progressUpdates.push(status)
      );

      expect(finalStatus.status).toBe('COMPLETED');
      expect(pollCount).toBe(3);
      expect(progressUpdates).toContain('COMPLETED');
    });
  });

  describe('getVideoAsset', () => {
    it('retrieves signed video asset from platform API', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn(async (msg: any) => {
            if (msg.type === 'PROXY_FETCH') {
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    assets: [
                      {
                        key: 'video-123.mp4',
                        kind: 'video',
                        width: 768,
                        height: 1344,
                        seconds: 15,
                        fps: 24,
                        has_audio: true,
                        url: 'https://storage.auray.ai/download/video-123.mp4?token=signed_token',
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

      const asset = await getVideoAsset('test_key', 'req_123', 'https://api.auray.ai/v1');
      expect(asset.kind).toBe('video');
      expect(asset.url).toBe(
        'https://storage.auray.ai/download/video-123.mp4?token=signed_token'
      );
      expect(asset.seconds).toBe(15);
      expect(asset.has_audio).toBe(true);
    });
  });

  describe('generateVideo end-to-end', () => {
    it('coordinates full text-to-video workflow', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn(async (msg: any) => {
            if (msg.type === 'PROXY_FETCH') {
              const url = msg.payload.url;
              if (url.includes('queue.auray.run/auray-ai/minimax-h3/text-to-video')) {
                return {
                  success: true,
                  response: {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'content-type': 'application/json' },
                    text: JSON.stringify({
                      request_id: 'req_full_1',
                      status_url: 'https://queue.auray.run/status/req_full_1',
                      response_url: 'https://queue.auray.run/resp/req_full_1',
                      status: 'IN_QUEUE',
                    }),
                  },
                };
              }
              if (url.includes('queue.auray.run/status/req_full_1')) {
                return {
                  success: true,
                  response: {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'content-type': 'application/json' },
                    text: JSON.stringify({ status: 'COMPLETED' }),
                  },
                };
              }
              if (url.includes('queue.auray.run/resp/req_full_1')) {
                return {
                  success: true,
                  response: {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'content-type': 'application/json' },
                    text: JSON.stringify({ ok: true }),
                  },
                };
              }
              if (url.includes('/jobs/req_full_1/assets')) {
                return {
                  success: true,
                  response: {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'content-type': 'application/json' },
                    text: JSON.stringify({
                      assets: [
                        {
                          kind: 'video',
                          url: 'https://storage.auray.ai/final/h3_video.mp4',
                          seconds: 15,
                        },
                      ],
                    }),
                  },
                };
              }
            }
            return { success: true };
          }),
        },
      };

      const result = await generateVideo({
        prompt: 'Volcanic island timelapse at dusk',
        duration: 15,
        aspectRatio: '9:16',
        pollIntervalMs: 10,
      });

      expect(result.videoUrl).toBe('https://storage.auray.ai/final/h3_video.mp4');
      expect(result.requestId).toBe('req_full_1');
      expect(result.duration).toBe(15);
      expect(result.aspectRatio).toBe('9:16');
    });
  });
});

describe('AI Video Generator Node Executor (executeGenerateVideo)', () => {
  let mockContext: ExecutionContext;

  beforeEach(() => {
    mockContext = {
      workflowId: 'test-video-wf',
      currentTabId: 202,
      currentUrl: 'https://example.com/scene',
      variables: {
        sceneName: 'Cyberpunk Alley',
        themeWeather: 'heavy rain and neon reflections',
        startImageUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      },
      signal: new AbortController().signal,
      log: vi.fn(),
      updateNodeState: vi.fn(),
      getVariable: (name: string) => mockContext.variables[name],
      setVariable: (name: string, val: any) => {
        mockContext.variables[name] = val;
      },
    };

    // Mock chrome API for fetch proxy
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn(async (msg: any) => {
          if (msg.type === 'PROXY_FETCH') {
            const url = msg.payload.url;
            // Upload slot
            if (url.endsWith('/uploads')) {
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    upload_url: 'https://storage.auray.ai/upload/mock-slot',
                    read: 'https://api.auray.ai/v1/uploads/mock-slot',
                  }),
                },
              };
            }
            // Upload read
            if (url.includes('/uploads/mock-slot')) {
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    url: 'https://storage.auray.ai/signed/first-frame.png',
                    path: 'uploads/mock-slot/first-frame.png',
                  }),
                },
              };
            }
            // PUT upload bytes
            if (url.includes('/upload/mock-slot')) {
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: {},
                  text: '',
                },
              };
            }
            // Queue submit
            if (url.includes('queue.auray.run/auray-ai/minimax-h3/text-to-video')) {
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    request_id: 'h3_job_12345',
                    status_url: 'https://queue.auray.run/status/h3_job_12345',
                    response_url: 'https://queue.auray.run/resp/h3_job_12345',
                    status: 'IN_QUEUE',
                  }),
                },
              };
            }
            // Queue status
            if (url.includes('queue.auray.run/status/h3_job_12345')) {
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({ status: 'COMPLETED' }),
                },
              };
            }
            // Queue response
            if (url.includes('queue.auray.run/resp/h3_job_12345')) {
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({ ok: true }),
                },
              };
            }
            // Assets
            if (url.includes('/jobs/h3_job_12345/assets')) {
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    assets: [
                      {
                        key: 'h3_rendered.mp4',
                        kind: 'video',
                        width: 768,
                        height: 1344,
                        seconds: 15,
                        fps: 24,
                        has_audio: true,
                        url: 'https://storage.auray.ai/renders/h3_rendered.mp4',
                      },
                    ],
                  }),
                },
              };
            }
          }
          return { success: true };
        }),
      },
    };
  });

  it('executes pure text-to-video with variable interpolation', async () => {
    const node: WorkflowNode = {
      id: 'node_vid_1',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'generate_video',
        label: 'Video Generator',
        properties: {
          prompt: 'A cinematic drone shot through {{sceneName}} with {{themeWeather}}',
          duration: 15,
          aspectRatio: '9:16',
          resolution: '768P',
          sound: true,
          outputVariable: 'promoVideo',
        },
      },
    };

    const result = await executeGenerateVideo(node, mockContext);

    expect(result.success).toBe(true);
    expect(result.output).toBe('https://storage.auray.ai/renders/h3_rendered.mp4');
    expect(result.variables?.promoVideo).toBe('https://storage.auray.ai/renders/h3_rendered.mp4');
    expect(result.variables?.promoVideo_id).toBe('h3_job_12345');
    expect(result.variables?.promoVideo_duration).toBe(15);
    expect(result.variables?.promoVideo_aspectRatio).toBe('9:16');
    expect(result.variables?.lastGeneratedVideo).toBe(
      'https://storage.auray.ai/renders/h3_rendered.mp4'
    );
    expect(result.variables?.videoUrl).toBe('https://storage.auray.ai/renders/h3_rendered.mp4');

    expect(mockContext.updateNodeState).toHaveBeenCalledWith(
      'node_vid_1',
      expect.objectContaining({
        status: 'success',
        output: 'https://storage.auray.ai/renders/h3_rendered.mp4',
        dynamicState: expect.objectContaining({
          previewVideoUrl: 'https://storage.auray.ai/renders/h3_rendered.mp4',
          requestId: 'h3_job_12345',
        }),
      })
    );
  });

  it('executes image-to-video animating source frame variable', async () => {
    const node: WorkflowNode = {
      id: 'node_vid_2',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'generate_video',
        label: 'Video Generator Img2Vid',
        properties: {
          prompt: 'Animate this image with sweeping camera pan and dynamic lighting',
          inputImage: '{{startImageUrl}}',
          duration: 10,
          aspectRatio: '16:9',
          outputVariable: 'animatedVideo',
        },
      },
    };

    const result = await executeGenerateVideo(node, mockContext);

    expect(result.success).toBe(true);
    expect(result.output).toBe('https://storage.auray.ai/renders/h3_rendered.mp4');
    expect(result.variables?.animatedVideo).toBe(
      'https://storage.auray.ai/renders/h3_rendered.mp4'
    );
    expect(result.variables?.animatedVideo_first_frame).toBe(
      'https://storage.auray.ai/signed/first-frame.png'
    );
  });

  it('throws error when prompt is empty', async () => {
    const node: WorkflowNode = {
      id: 'node_vid_err',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'generate_video',
        label: 'Video Generator Error',
        properties: {
          prompt: '   ',
        },
      },
    };

    await expect(executeGenerateVideo(node, mockContext)).rejects.toThrow(
      'Video prompt cannot be empty.'
    );
  });
});
