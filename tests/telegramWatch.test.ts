import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeTelegramWatch } from '../src/runtime/executors';
import { NODE_REGISTRY } from '../src/nodes/registry';
import { ExecutionContext } from '../src/types/execution';
import { WorkflowNode } from '../src/types/workflow';

describe('Watch Telegram Updates Node (telegram_watch)', () => {
  let mockFetch: any;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const createMockContext = (variables: Record<string, any> = {}): ExecutionContext => ({
    variables: { ...variables },
    workflowSettings: {
      timeout: 10000,
      retryCount: 0,
      retryDelay: 0,
      stopOnError: true,
      highlightElements: false,
    },
    log: vi.fn(),
    updateNodeState: vi.fn(),
  });

  describe('Registry & Node Definition', () => {
    it('is properly registered in NODE_REGISTRY', () => {
      const reg = NODE_REGISTRY.telegram_watch;
      expect(reg).toBeDefined();
      expect(reg.type).toBe('telegram_watch');
      expect(reg.category).toBe('messaging');
      expect(reg.icon).toBe('Radio');
      expect(reg.defaultProperties.timeoutSeconds).toBe(60);
      expect(reg.defaultProperties.textVariable).toBe('telegramMessage');
      expect(reg.defaultProperties.chatIdVariable).toBe('telegramChatId');
      expect(reg.defaultProperties.senderUsernameVariable).toBe('telegramUsername');
      expect(reg.defaultProperties.senderNameVariable).toBe('telegramSenderName');
      expect(reg.defaultProperties.rawUpdateVariable).toBe('telegramUpdate');
      expect(reg.defaultProperties.markAsRead).toBe(true);
      expect(reg.defaultProperties.onlyNewMessages).toBe(true);
    });
  });

  describe('Execution & Variable Extraction', () => {
    it('throws error when bot token is missing', async () => {
      const node: WorkflowNode = {
        id: 'watch_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Telegram',
          category: 'messaging',
          type: 'telegram_watch',
          properties: {
            botToken: '',
          },
        },
      };

      const ctx = createMockContext();
      await expect(executeTelegramWatch(node, ctx)).rejects.toThrow(
        /Telegram Bot Token is required to watch for updates/
      );
    });

    it('successfully extracts text, chat ID, username, and name from incoming message', async () => {
      // 1. Initial offset check: returns update_id 100
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 100,
              message: { message_id: 10, text: 'old message', chat: { id: 9999 } },
            },
          ],
        }),
      });

      // 2. Main poll: returns new update_id 101
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 101,
              message: {
                message_id: 555,
                date: 1710000000,
                chat: { id: 12345678 },
                from: {
                  id: 12345678,
                  is_bot: false,
                  first_name: 'John',
                  last_name: 'Doe',
                  username: 'johndoe',
                },
                text: '/start automate_now',
              },
            },
          ],
        }),
      });

      // 3. Mark as read offset advance
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, result: [] }),
      });

      const node: WorkflowNode = {
        id: 'watch_2',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Telegram Updates',
          category: 'messaging',
          type: 'telegram_watch',
          properties: {
            botToken: '123456:FAKE_TOKEN',
            timeoutSeconds: 10,
            pollIntervalMs: 50,
            onlyNewMessages: true,
            markAsRead: true,
            textVariable: 'cmdText',
            chatIdVariable: 'userChatId',
            senderUsernameVariable: 'userHandle',
            senderNameVariable: 'fullName',
            rawUpdateVariable: 'rawTgPayload',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeTelegramWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('/start automate_now');
      expect(ctx.variables.cmdText).toBe('/start automate_now');
      expect(ctx.variables.userChatId).toBe('12345678');
      expect(ctx.variables.userHandle).toBe('johndoe');
      expect(ctx.variables.fullName).toBe('John Doe');
      expect(ctx.variables.cmdText_id).toBe(555);
      expect(ctx.variables.rawTgPayload).toBeDefined();
      expect(ctx.variables.rawTgPayload.update_id).toBe(101);
    });

    it('filters messages by allowedChatId', async () => {
      // Main poll returns update from chat 999999 (ignored), then update from 888888 (accepted)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 201,
              message: {
                message_id: 1,
                chat: { id: 999999 },
                text: 'Spam from unknown',
                from: { username: 'spammer' },
              },
            },
            {
              update_id: 202,
              message: {
                message_id: 2,
                chat: { id: 888888 },
                text: 'Verified admin command',
                from: { first_name: 'AdminUser' },
              },
            },
          ],
        }),
      });

      const node: WorkflowNode = {
        id: 'watch_filter',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Admin Chat',
          category: 'messaging',
          type: 'telegram_watch',
          properties: {
            botToken: '123456:FAKE_TOKEN',
            allowedChatId: '888888',
            timeoutSeconds: 5,
            pollIntervalMs: 50,
            onlyNewMessages: false,
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeTelegramWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('Verified admin command');
      expect(ctx.variables.telegramMessage).toBe('Verified admin command');
      expect(ctx.variables.telegramChatId).toBe('888888');
    });

    it('handles channel_post and caption when regular message text is not present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 301,
              channel_post: {
                message_id: 77,
                chat: { id: -1001234567 },
                caption: 'Channel broadcast caption',
              },
            },
          ],
        }),
      });

      const node: WorkflowNode = {
        id: 'watch_channel',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Channel',
          category: 'messaging',
          type: 'telegram_watch',
          properties: {
            botToken: '123456:FAKE_TOKEN',
            timeoutSeconds: 5,
            onlyNewMessages: false,
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeTelegramWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('Channel broadcast caption');
      expect(ctx.variables.telegramChatId).toBe('-1001234567');
    });

    it('extracts and resolves direct image URL when incoming message contains a photo', async () => {
      // 1. Initial offset check: returns empty
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, result: [] }),
      });

      // 2. Poll update containing photo with multiple sizes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 501,
              message: {
                message_id: 888,
                chat: { id: 777777 },
                from: { first_name: 'Alice', username: 'alice_w' },
                caption: 'Check out this photo for video generation!',
                photo: [
                  { file_id: 'thumb_small_id', width: 100, height: 100 },
                  { file_id: 'photo_high_res_id', width: 1024, height: 1024 },
                ],
              },
            },
          ],
        }),
      });

      // 3. getFile call for photo_high_res_id
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          result: {
            file_id: 'photo_high_res_id',
            file_path: 'photos/file_888.jpg',
          },
        }),
      });

      // 4. Mark as read call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, result: [] }),
      });

      const node: WorkflowNode = {
        id: 'watch_photo_node',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Photo',
          category: 'messaging',
          type: 'telegram_watch',
          properties: {
            botToken: '123456:FAKE_TOKEN',
            timeoutSeconds: 5,
            onlyNewMessages: true,
            imageUrlVariable: 'myExtractedPhoto',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeTelegramWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('Check out this photo for video generation!');
      expect(ctx.variables.myExtractedPhoto).toBe('https://api.telegram.org/file/bot123456:FAKE_TOKEN/photos/file_888.jpg');
      expect(ctx.variables.telegramImageUrl).toBe('https://api.telegram.org/file/bot123456:FAKE_TOKEN/photos/file_888.jpg');
      expect(ctx.variables.telegramImage).toBe('https://api.telegram.org/file/bot123456:FAKE_TOKEN/photos/file_888.jpg');
      expect(ctx.variables.telegramChatId).toBe('777777');
    });

    it('extracts and resolves direct video URL when incoming message contains a video', async () => {
      // 1. Initial offset check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, result: [] }),
      });

      // 2. Poll update containing video
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 502,
              message: {
                message_id: 889,
                chat: { id: 777777 },
                from: { first_name: 'Bob', username: 'bob_v' },
                caption: 'Here is a video message',
                video: {
                  file_id: 'video_file_999_id',
                  duration: 15,
                  mime_type: 'video/mp4',
                },
              },
            },
          ],
        }),
      });

      // 3. getFile call for video_file_999_id
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          result: {
            file_id: 'video_file_999_id',
            file_path: 'videos/clip_889.mp4',
          },
        }),
      });

      // 4. Mark as read
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, result: [] }),
      });

      const node: WorkflowNode = {
        id: 'watch_video_node',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Video',
          category: 'messaging',
          type: 'telegram_watch',
          properties: {
            botToken: '123456:FAKE_TOKEN',
            timeoutSeconds: 5,
            onlyNewMessages: true,
            videoUrlVariable: 'myExtractedVideo',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeTelegramWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(ctx.variables.myExtractedVideo).toBe('https://api.telegram.org/file/bot123456:FAKE_TOKEN/videos/clip_889.mp4');
      expect(ctx.variables.telegramVideoUrl).toBe('https://api.telegram.org/file/bot123456:FAKE_TOKEN/videos/clip_889.mp4');
      expect(ctx.variables.telegramVideo).toBe('https://api.telegram.org/file/bot123456:FAKE_TOKEN/videos/clip_889.mp4');
    });

    it('aborts cleanly when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const node: WorkflowNode = {
        id: 'watch_abort',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Abort',
          category: 'messaging',
          type: 'telegram_watch',
          properties: {
            botToken: '123456:FAKE_TOKEN',
            timeoutSeconds: 10,
          },
        },
      };

      const ctx = createMockContext();
      ctx.signal = controller.signal;

      await expect(executeTelegramWatch(node, ctx)).rejects.toThrow(
        /Telegram message watcher was cancelled/
      );
    });
  });
});
