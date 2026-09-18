import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeTelegramMessage,
  executeDiscordMessage,
  executeSlackMessage,
  executeExtractImage,
} from '../src/runtime/executors';
import {
  saveCredential,
  getCredentialsByPlatform,
  getCredentialById,
  deleteCredential,
} from '../src/storage/credentialStore';
import { extractImageElement } from '../src/content/domActions';
import { ExecutionContext } from '../src/types/execution';
import { WorkflowNode, Workflow } from '../src/types/workflow';
import { WorkflowEngine } from '../src/runtime/engine';
import { NODE_REGISTRY, CATEGORIES } from '../src/nodes/registry';
import { synthesizeWithSemanticParser } from '../src/ai/workflowSynthesizer';

describe('Messaging Nodes (Telegram, Discord, Slack)', () => {
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
  });

  describe('Registry & Definitions', () => {
    it('has messaging category registered with correct color', () => {
      const messagingCategory = CATEGORIES.find((c) => c.id === 'messaging');
      expect(messagingCategory).toBeDefined();
      expect(messagingCategory?.label).toBe('Messaging');
      expect(messagingCategory?.color).toBeDefined();
    });

    it('has telegram_message, discord_message, slack_message, and extract_image in NODE_REGISTRY', () => {
      expect(NODE_REGISTRY.telegram_message).toBeDefined();
      expect(NODE_REGISTRY.telegram_message.category).toBe('messaging');
      expect(NODE_REGISTRY.telegram_message.icon).toBe('Send');

      expect(NODE_REGISTRY.discord_message).toBeDefined();
      expect(NODE_REGISTRY.discord_message.category).toBe('messaging');
      expect(NODE_REGISTRY.discord_message.icon).toBe('MessageSquare');

      expect(NODE_REGISTRY.slack_message).toBeDefined();
      expect(NODE_REGISTRY.slack_message.category).toBe('messaging');
      expect(NODE_REGISTRY.slack_message.icon).toBe('Hash');

      expect(NODE_REGISTRY.extract_image).toBeDefined();
      expect(NODE_REGISTRY.extract_image.category).toBe('extraction');
      expect(NODE_REGISTRY.extract_image.icon).toBe('Image');
    });
  });

  describe('Telegram Message Node', () => {
    it('sends message via Telegram Bot API successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          result: { message_id: 42, chat: { id: 123456789 }, text: 'Hello World!' },
        }),
      });

      const node: WorkflowNode = {
        id: 'tg_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Telegram Message',
          category: 'messaging',
          type: 'telegram_message',
          properties: {
            botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
            chatId: '123456789',
            message: 'Hello World!',
            parseMode: 'HTML',
            silent: true,
            outputVariable: 'tgResult',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeTelegramMessage(node, ctx);

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/sendMessage');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' });

      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe('123456789');
      expect(body.text).toBe('Hello World!');
      expect(body.parse_mode).toBe('HTML');
      expect(body.disable_notification).toBe(true);

      expect(res.variables?.tgResult.ok).toBe(true);
      expect(res.variables?.tgResult.result.message_id).toBe(42);
    });

    it('interpolates variables in botToken, chatId, and message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, result: { message_id: 100 } }),
      });

      const node: WorkflowNode = {
        id: 'tg_2',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Telegram Message',
          category: 'messaging',
          type: 'telegram_message',
          properties: {
            botToken: '{{myBotToken}}',
            chatId: '{{myChatId}}',
            message: 'Extracted price: {{price}} for {{product}}',
          },
        },
      };

      const ctx = createMockContext({
        myBotToken: 'token_xyz',
        myChatId: '@deals_channel',
        price: '$49.99',
        product: 'Wireless Headphones',
      });

      await executeTelegramMessage(node, ctx);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.telegram.org/bottoken_xyz/sendMessage');

      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe('@deals_channel');
      expect(body.text).toBe('Extracted price: $49.99 for Wireless Headphones');
    });

    it('validates required fields: botToken, chatId, message', async () => {
      const ctx = createMockContext();

      // Missing bot token
      const noTokenNode: WorkflowNode = {
        id: 'tg_err1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Telegram',
          category: 'messaging',
          type: 'telegram_message',
          properties: { botToken: '', chatId: '123', message: 'Hi' },
        },
      };
      await expect(executeTelegramMessage(noTokenNode, ctx)).rejects.toThrow(
        /Telegram Bot Token is required/i
      );

      // Missing chat id
      const noChatNode: WorkflowNode = {
        id: 'tg_err2',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Telegram',
          category: 'messaging',
          type: 'telegram_message',
          properties: { botToken: 'token123', chatId: '', message: 'Hi' },
        },
      };
      await expect(executeTelegramMessage(noChatNode, ctx)).rejects.toThrow(
        /Telegram Chat ID is required/i
      );

      // Missing message
      const noMsgNode: WorkflowNode = {
        id: 'tg_err3',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Telegram',
          category: 'messaging',
          type: 'telegram_message',
          properties: { botToken: 'token123', chatId: '123', message: '' },
        },
      };
      await expect(executeTelegramMessage(noMsgNode, ctx)).rejects.toThrow(
        /Telegram message text cannot be empty/i
      );
    });

    it('handles Telegram API error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found',
        }),
      });

      const node: WorkflowNode = {
        id: 'tg_err4',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Telegram',
          category: 'messaging',
          type: 'telegram_message',
          properties: { botToken: 'token123', chatId: 'invalid_chat', message: 'Hello' },
        },
      };

      const ctx = createMockContext();
      await expect(executeTelegramMessage(node, ctx)).rejects.toThrow(
        /Telegram error \(400\): Bad Request: chat not found/i
      );
    });
  });

  describe('Discord Message Node', () => {
    it('sends webhook notification with content and custom username', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      });

      const node: WorkflowNode = {
        id: 'dc_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Discord Message',
          category: 'messaging',
          type: 'discord_message',
          properties: {
            mode: 'webhook',
            webhookUrl: 'https://discord.com/api/webhooks/123456/tokenABC',
            content: 'Hello from Discord Webhook!',
            username: 'AutoFlow Bot',
            avatarUrl: 'https://example.com/avatar.png',
            outputVariable: 'dcOutput',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeDiscordMessage(node, ctx);

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://discord.com/api/webhooks/123456/tokenABC');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.content).toBe('Hello from Discord Webhook!');
      expect(body.username).toBe('AutoFlow Bot');
      expect(body.avatar_url).toBe('https://example.com/avatar.png');

      expect(res.variables?.dcOutput.status).toBe(204);
    });

    it('sends rich embed with custom color, title, and description', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      });

      const node: WorkflowNode = {
        id: 'dc_2',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Discord Message',
          category: 'messaging',
          type: 'discord_message',
          properties: {
            mode: 'webhook',
            webhookUrl: 'https://discord.com/api/webhooks/123456/tokenABC',
            content: 'Digest ready:',
            embedTitle: 'Scraped 50 Items',
            embedDescription: 'All articles scraped successfully.',
            embedColor: '#5865F2',
          },
        },
      };

      const ctx = createMockContext();
      await executeDiscordMessage(node, ctx);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.content).toBe('Digest ready:');
      expect(body.embeds).toBeDefined();
      expect(body.embeds[0].title).toBe('Scraped 50 Items');
      expect(body.embeds[0].description).toBe('All articles scraped successfully.');
      expect(body.embeds[0].color).toBe(0x5865f2);
      expect(body.embeds[0].timestamp).toBeDefined();
    });

    it('sends message via Bot API with Bot token and Channel ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 'msg_999', channel_id: 'chan_123', content: 'Bot message' }),
      });

      const node: WorkflowNode = {
        id: 'dc_bot',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Discord Bot',
          category: 'messaging',
          type: 'discord_message',
          properties: {
            mode: 'bot',
            botToken: 'MTAxMjM0NTY3ODkw.xyz.abc',
            channelId: 'chan_123',
            content: 'Bot message',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeDiscordMessage(node, ctx);

      expect(res.success).toBe(true);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://discord.com/api/v10/channels/chan_123/messages');
      expect(options.headers['Authorization']).toBe('Bot MTAxMjM0NTY3ODkw.xyz.abc');
      expect(res.variables?.discordResponse.id).toBe('msg_999');
    });

    it('validates Discord inputs in webhook and bot modes', async () => {
      const ctx = createMockContext();

      // Missing webhook url
      const noUrlNode: WorkflowNode = {
        id: 'dc_err1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Discord',
          category: 'messaging',
          type: 'discord_message',
          properties: { mode: 'webhook', webhookUrl: '', content: 'Hi' },
        },
      };
      await expect(executeDiscordMessage(noUrlNode, ctx)).rejects.toThrow(
        /Discord Webhook URL is required/i
      );

      // Missing content or embed
      const noContentNode: WorkflowNode = {
        id: 'dc_err2',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Discord',
          category: 'messaging',
          type: 'discord_message',
          properties: {
            mode: 'webhook',
            webhookUrl: 'https://discord.com/api/webhooks/test',
            content: '',
          },
        },
      };
      await expect(executeDiscordMessage(noContentNode, ctx)).rejects.toThrow(
        /must include at least message content/i
      );

      // Bot mode missing token
      const noBotTokenNode: WorkflowNode = {
        id: 'dc_err3',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Discord',
          category: 'messaging',
          type: 'discord_message',
          properties: { mode: 'bot', botToken: '', channelId: '123', content: 'Hi' },
        },
      };
      await expect(executeDiscordMessage(noBotTokenNode, ctx)).rejects.toThrow(
        /Discord Bot Token is required/i
      );
    });
  });

  describe('Slack Message Node', () => {
    it('sends message via Slack Incoming Webhook', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'ok',
      });

      const node: WorkflowNode = {
        id: 'slack_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Slack Message',
          category: 'messaging',
          type: 'slack_message',
          properties: {
            mode: 'webhook',
            webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXXX',
            text: 'Hello Slack Team! {{alert}}',
            username: 'AutoFlow Monitor',
            iconEmoji: ':satellite:',
            outputVariable: 'slackResult',
          },
        },
      };

      const ctx = createMockContext({ alert: 'Server is healthy' });
      const res = await executeSlackMessage(node, ctx);

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://hooks.slack.com/services/T00/B00/XXXX');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.text).toBe('Hello Slack Team! Server is healthy');
      expect(body.username).toBe('AutoFlow Monitor');
      expect(body.icon_emoji).toBe(':satellite:');

      expect(res.variables?.slackResult.ok).toBe(true);
    });

    it('sends message via Slack Web API (chat.postMessage) with Bot Token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          channel: 'C12345678',
          ts: '1700000000.000100',
          message: { text: 'Alert triggered' },
        }),
      });

      const node: WorkflowNode = {
        id: 'slack_bot',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Slack Message',
          category: 'messaging',
          type: 'slack_message',
          properties: {
            mode: 'bot',
            botToken: 'xoxb-12345-67890-abcdef',
            channel: '#alerts',
            text: 'Alert triggered',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeSlackMessage(node, ctx);

      expect(res.success).toBe(true);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://slack.com/api/chat.postMessage');
      expect(options.headers['Authorization']).toBe('Bearer xoxb-12345-67890-abcdef');

      const body = JSON.parse(options.body);
      expect(body.channel).toBe('#alerts');
      expect(body.text).toBe('Alert triggered');
      expect(res.variables?.slackResponse.ts).toBe('1700000000.000100');
    });

    it('handles Slack API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: false,
          error: 'channel_not_found',
        }),
      });

      const node: WorkflowNode = {
        id: 'slack_err',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Slack Message',
          category: 'messaging',
          type: 'slack_message',
          properties: {
            mode: 'bot',
            botToken: 'xoxb-test',
            channel: 'C999999',
            text: 'Test',
          },
        },
      };

      const ctx = createMockContext();
      await expect(executeSlackMessage(node, ctx)).rejects.toThrow(
        /Slack error \(200\): channel_not_found/i
      );
    });

    it('validates Slack missing required parameters', async () => {
      const ctx = createMockContext();

      // Missing text
      const noTextNode: WorkflowNode = {
        id: 'slack_v1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Slack',
          category: 'messaging',
          type: 'slack_message',
          properties: { mode: 'webhook', webhookUrl: 'https://hooks.slack.com/test', text: '' },
        },
      };
      await expect(executeSlackMessage(noTextNode, ctx)).rejects.toThrow(
        /Slack message text or image is required/i
      );

      // Webhook mode missing URL
      const noUrlNode: WorkflowNode = {
        id: 'slack_v2',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Slack',
          category: 'messaging',
          type: 'slack_message',
          properties: { mode: 'webhook', webhookUrl: '', text: 'Hello' },
        },
      };
      await expect(executeSlackMessage(noUrlNode, ctx)).rejects.toThrow(
        /Slack Webhook URL is required/i
      );

      // Bot mode missing token
      const noTokenNode: WorkflowNode = {
        id: 'slack_v3',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Slack',
          category: 'messaging',
          type: 'slack_message',
          properties: { mode: 'bot', botToken: '', channel: '#general', text: 'Hello' },
        },
      };
      await expect(executeSlackMessage(noTokenNode, ctx)).rejects.toThrow(
        /Slack Bot Token is required/i
      );
    });
  });

  describe('Workflow Engine Integration', () => {
    it('executes a workflow containing Telegram, Discord, and Slack nodes sequentially', async () => {
      mockFetch
        // 1. Telegram
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ok: true, result: { message_id: 1 } }),
        })
        // 2. Discord
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          headers: new Headers(),
        })
        // 3. Slack
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/plain' }),
          text: async () => 'ok',
        });

      const wf: Workflow = {
        id: 'wf_messaging_multi',
        name: 'Multi-Channel Alert Workflow',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: { alertMessage: 'Critical issue resolved' },
        settings: {
          timeout: 5000,
          retryCount: 0,
          retryDelay: 100,
          stopOnError: true,
          highlightElements: false,
        },
        nodes: [
          {
            id: 'n_set',
            type: 'customNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Set Variable',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'systemStatus', value: 'ONLINE' },
            },
          },
          {
            id: 'n_tg',
            type: 'customNode',
            position: { x: 0, y: 100 },
            data: {
              label: 'Telegram Alert',
              category: 'messaging',
              type: 'telegram_message',
              properties: {
                botToken: 'tg_tok',
                chatId: '12345',
                message: 'Status: {{systemStatus}} - {{alertMessage}}',
              },
            },
          },
          {
            id: 'n_dc',
            type: 'customNode',
            position: { x: 0, y: 200 },
            data: {
              label: 'Discord Alert',
              category: 'messaging',
              type: 'discord_message',
              properties: {
                webhookUrl: 'https://discord.com/api/webhooks/test',
                content: 'Status: {{systemStatus}}',
              },
            },
          },
          {
            id: 'n_slack',
            type: 'customNode',
            position: { x: 0, y: 300 },
            data: {
              label: 'Slack Alert',
              category: 'messaging',
              type: 'slack_message',
              properties: {
                webhookUrl: 'https://hooks.slack.com/services/test',
                text: 'Status: {{systemStatus}}',
              },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'n_set', target: 'n_tg' },
          { id: 'e2', source: 'n_tg', target: 'n_dc' },
          { id: 'e3', source: 'n_dc', target: 'n_slack' },
        ],
      };

      const executedNodes: string[] = [];
      const engine = new WorkflowEngine(wf, {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') executedNodes.push(id);
        },
      });

      await engine.run();

      expect(executedNodes).toEqual(['n_set', 'n_tg', 'n_dc', 'n_slack']);
      expect(engine.getStatus()).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('AI Synthesizer Messaging Detection', () => {
    it('synthesizes workflow with telegram message node when prompted', () => {
      const result = synthesizeWithSemanticParser({
        prompt: 'Go to https://news.ycombinator.com, extract top story, and send to telegram',
        mode: 'replace',
      });

      const tgNode = result.nodes.find((n) => n.data.type === 'telegram_message');
      expect(tgNode).toBeDefined();
      expect(tgNode?.data.category).toBe('messaging');
    });

    it('synthesizes workflow with discord message node when prompted', () => {
      const result = synthesizeWithSemanticParser({
        prompt: 'Extract price and alert discord',
        mode: 'replace',
      });

      const dcNode = result.nodes.find((n) => n.data.type === 'discord_message');
      expect(dcNode).toBeDefined();
      expect(dcNode?.data.category).toBe('messaging');
    });

    it('synthesizes workflow with slack message node when prompted', () => {
      const result = synthesizeWithSemanticParser({
        prompt: 'Scrape quotes and post to slack',
        mode: 'replace',
      });

      const slackNode = result.nodes.find((n) => n.data.type === 'slack_message');
      expect(slackNode).toBeDefined();
      expect(slackNode?.data.category).toBe('messaging');
    });
  });

  describe('Images & Screenshots Sending', () => {
    const SAMPLE_BASE64_PNG =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    it('Telegram: sends photo via URL as sendPhoto JSON payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, result: { message_id: 88 } }),
      });

      const node: WorkflowNode = {
        id: 'tg_photo_url',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Telegram Photo',
          category: 'messaging',
          type: 'telegram_message',
          properties: {
            botToken: 'bot_test_token',
            chatId: '12345678',
            messageType: 'photo',
            imageUrl: 'https://example.com/chart.png',
            message: 'Daily Report Chart',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeTelegramMessage(node, ctx);

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.telegram.org/botbot_test_token/sendPhoto');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' });

      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe('12345678');
      expect(body.photo).toBe('https://example.com/chart.png');
      expect(body.caption).toBe('Daily Report Chart');
    });

    it('Telegram: sends screenshot base64 data URL as multipart/form-data Blob', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, result: { message_id: 89 } }),
      });

      const node: WorkflowNode = {
        id: 'tg_photo_b64',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Telegram Screenshot',
          category: 'messaging',
          type: 'telegram_message',
          properties: {
            botToken: 'bot_test_token',
            chatId: '12345678',
            messageType: 'photo',
            imageUrl: SAMPLE_BASE64_PNG,
            caption: 'Captured Page Screenshot',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeTelegramMessage(node, ctx);

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.telegram.org/botbot_test_token/sendPhoto');
      expect(options.method).toBe('POST');
      // Multipart request sets FormData body
      expect(options.body).toBeInstanceOf(FormData);
    });

    it('Discord: uploads base64 screenshot as multipart attachment files[0]', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: '99999', content: 'Here is screenshot' }),
      });

      const node: WorkflowNode = {
        id: 'dc_photo_b64',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Discord Screenshot',
          category: 'messaging',
          type: 'discord_message',
          properties: {
            mode: 'webhook',
            webhookUrl: 'https://discord.com/api/webhooks/test/token',
            messageType: 'image',
            imageUrl: SAMPLE_BASE64_PNG,
            content: 'Check out this screenshot',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeDiscordMessage(node, ctx);

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://discord.com/api/webhooks/test/token');
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
    });

    it('Discord: sends rich embed with thumbnail and image URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      });

      const node: WorkflowNode = {
        id: 'dc_embed_full',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Discord Embed',
          category: 'messaging',
          type: 'discord_message',
          properties: {
            mode: 'webhook',
            webhookUrl: 'https://discord.com/api/webhooks/test/token',
            messageType: 'embed',
            embedTitle: 'Scrape Report',
            embedDescription: 'Extracted 42 products successfully',
            embedColor: '#00ff00',
            imageUrl: 'https://example.com/banner.png',
            thumbnailUrl: 'https://example.com/thumb.png',
            footerText: 'AutoFlow Automation',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeDiscordMessage(node, ctx);

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.embeds).toBeDefined();
      expect(body.embeds[0].title).toBe('Scrape Report');
      expect(body.embeds[0].image.url).toBe('https://example.com/banner.png');
      expect(body.embeds[0].thumbnail.url).toBe('https://example.com/thumb.png');
      expect(body.embeds[0].footer.text).toBe('AutoFlow Automation');
    });

    it('Slack: uploads base64 screenshot via files.upload API with Bot Token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, file: { id: 'F12345', name: 'screenshot.png' } }),
      });

      const node: WorkflowNode = {
        id: 'slack_photo_upload',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Slack File Upload',
          category: 'messaging',
          type: 'slack_message',
          properties: {
            mode: 'bot',
            botToken: 'xoxb-mock-bot-token',
            channel: 'C12345678',
            messageType: 'image',
            imageUrl: SAMPLE_BASE64_PNG,
            text: 'Screenshot from run',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeSlackMessage(node, ctx);

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://slack.com/api/files.upload');
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
    });

    it('Slack: sends Block Kit card with image block for web image URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, ts: '1700000001.000200' }),
      });

      const node: WorkflowNode = {
        id: 'slack_rich_card',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Slack Card',
          category: 'messaging',
          type: 'slack_message',
          properties: {
            mode: 'webhook',
            webhookUrl: 'https://hooks.slack.com/services/test/card',
            messageType: 'rich',
            headerText: 'Daily Metrics Summary',
            text: '*Total processed*: 1,250 items',
            imageUrl: 'https://example.com/metrics.png',
            imageAltText: 'Metrics Chart',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeSlackMessage(node, ctx);

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.blocks).toBeDefined();
      expect(body.blocks[0].type).toBe('header');
      expect(body.blocks[0].text.text).toBe('Daily Metrics Summary');
      expect(body.blocks[1].type).toBe('section');
      expect(body.blocks[2].type).toBe('image');
      expect(body.blocks[2].image_url).toBe('https://example.com/metrics.png');
      expect(body.blocks[2].alt_text).toBe('Metrics Chart');
    });
  });

  describe('Bot Credentials Persistence Store', () => {
    it('saves and retrieves multiple credentials across platforms', async () => {
      const tg1 = await saveCredential({
        platform: 'telegram',
        name: 'Alerts Bot',
        botToken: '111:AAABBB',
        defaultChatId: '-100999',
      });
      const tg2 = await saveCredential({
        platform: 'telegram',
        name: 'Personal Bot',
        botToken: '222:CCCDDD',
        defaultChatId: '888777',
      });

      const dc1 = await saveCredential({
        platform: 'discord',
        name: 'Dev Discord Webhook',
        mode: 'webhook',
        webhookUrl: 'https://discord.com/api/webhooks/dev/token',
      });

      const sl1 = await saveCredential({
        platform: 'slack',
        name: 'Ops Slack',
        mode: 'bot',
        botToken: 'xoxb-ops-token',
        channel: '#ops-alerts',
      });

      expect(tg1.id).toBeDefined();
      expect(tg2.id).toBeDefined();
      expect(dc1.id).toBeDefined();
      expect(sl1.id).toBeDefined();

      const tgCreds = await getCredentialsByPlatform('telegram');
      expect(tgCreds.length).toBeGreaterThanOrEqual(2);
      expect(tgCreds.some((c) => c.name === 'Alerts Bot')).toBe(true);
      expect(tgCreds.some((c) => c.name === 'Personal Bot')).toBe(true);

      const foundTg = await getCredentialById(tg1.id);
      expect(foundTg?.botToken).toBe('111:AAABBB');

      await deleteCredential(tg2.id);
      const updatedTg = await getCredentialsByPlatform('telegram');
      expect(updatedTg.some((c) => c.id === tg2.id)).toBe(false);
    });

    it('executors resolve credentials seamlessly using credentialId', async () => {
      const savedTg = await saveCredential({
        platform: 'telegram',
        name: 'Exec Test Bot',
        botToken: 'saved_tg_token_123',
        defaultChatId: 'saved_chat_456',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, result: { message_id: 11 } }),
      });

      // Node has NO botToken or chatId properties, only credentialId!
      const node: WorkflowNode = {
        id: 'tg_via_cred',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Telegram Credential',
          category: 'messaging',
          type: 'telegram_message',
          properties: {
            credentialId: savedTg.id,
            message: 'Hello via saved credential!',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeTelegramMessage(node, ctx);

      expect(res.success).toBe(true);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.telegram.org/botsaved_tg_token_123/sendMessage');
      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe('saved_chat_456');
    });
  });

  describe('Website Image Extraction (extract_image & extractImageElement)', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="wrapper">
          <img id="logo" src="https://example.com/logo.png" alt="Company Logo" title="Logo" width="200" height="50" />
          <img class="gallery-item" src="https://example.com/photo1.jpg" alt="Photo 1" />
          <img class="gallery-item" src="https://example.com/photo2.jpg" alt="Photo 2" />
          <div id="hero-banner" style="background-image: url('https://example.com/hero.jpg');">Banner Content</div>
        </div>
      `;
    });

    afterEach(() => {
      document.body.innerHTML = '';
      delete (globalThis as any).chrome;
    });

    it('extracts single image URL, alt, and title from img element', async () => {
      const res = await extractImageElement('#logo', { mode: 'single' });
      expect(res.success).toBe(true);
      expect(res.url).toBe('https://example.com/logo.png');
      expect(res.alt).toBe('Company Logo');
      expect(res.title).toBe('Logo');
    });

    it('extracts multiple images when mode is multiple', async () => {
      const res = await extractImageElement('.gallery-item', { mode: 'multiple' });
      expect(res.success).toBe(true);
      expect(res.items).toBeDefined();
      expect(res.items?.length).toBe(2);
      expect(res.items?.[0].url).toBe('https://example.com/photo1.jpg');
      expect(res.items?.[1].url).toBe('https://example.com/photo2.jpg');
    });

    it('detects CSS background-image when element has no img src', async () => {
      const res = await extractImageElement('#hero-banner', { includeBackground: true });
      expect(res.success).toBe(true);
      expect(res.url).toBe('https://example.com/hero.jpg');
    });

    it('executeExtractImage executes in runtime and stores in outputVariable', async () => {
      globalThis.chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValueOnce({
            success: true,
            url: 'https://example.com/extracted.png',
            dataUrl: 'https://example.com/extracted.png',
            alt: 'Hero',
          }),
        },
      } as any;

      const node: WorkflowNode = {
        id: 'node_extract_img',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Extract Hero Image',
          category: 'data',
          type: 'extract_image',
          properties: {
            selector: '#hero-banner',
            mode: 'single',
            outputVariable: 'heroImg',
          },
        },
      };

      const ctx = createMockContext();
      const result = await executeExtractImage(node, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toBe('https://example.com/extracted.png');
      expect(result.variables?.heroImg).toBe('https://example.com/extracted.png');
    });

    it('handles action name variations (extract image with space, kebab-case, camelCase)', async () => {
      // Direct extractImageElement DOM check
      const res1 = await extractImageElement('#logo', { mode: 'single' });
      expect(res1.success).toBe(true);
      expect(res1.url).toBe('https://example.com/logo.png');

      // sendDomAction with variations
      globalThis.chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation(async (msg) => {
            const action = msg.payload?.action?.toLowerCase().replace(/[\s\-]+/g, '_');
            if (action === 'extract_image') {
              return { success: true, url: 'https://example.com/logo.png' };
            }
            return { success: false, error: `Unsupported DOM action: ${msg.payload?.action}` };
          }),
        },
      } as any;

      const nodeWithSpace: WorkflowNode = {
        id: 'node_test_space',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Extract Image Space',
          category: 'data',
          type: 'extract_image',
          properties: {
            selector: '#logo',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeExtractImage(nodeWithSpace, ctx);
      expect(res.success).toBe(true);
      expect(res.output).toBe('https://example.com/logo.png');
    });
  });
});
