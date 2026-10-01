import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeDiscordWatch, executeSlackWatch, executeTelegramWatch } from '../src/runtime/executors';
import { NODE_REGISTRY } from '../src/nodes/registry';
import { ExecutionContext } from '../src/types/execution';
import { Workflow, WorkflowNode } from '../src/types/workflow';
import { WorkflowEngine } from '../src/runtime/engine';

describe('Messaging Watchers & Recurring Listeners (Telegram, Discord, Slack)', () => {
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

  describe('Node Registry Definitions', () => {
    it('registers discord_watch with full property defaults', () => {
      const reg = NODE_REGISTRY.discord_watch;
      expect(reg).toBeDefined();
      expect(reg.type).toBe('discord_watch');
      expect(reg.category).toBe('messaging');
      expect(reg.icon).toBe('Radio');
      expect(reg.defaultProperties.timeoutSeconds).toBe(60);
      expect(reg.defaultProperties.unlimitedTimeout).toBe(false);
      expect(reg.defaultProperties.recurring).toBe(false);
      expect(reg.defaultProperties.pollIntervalMs).toBe(2000);
      expect(reg.defaultProperties.ignoreBots).toBe(true);
      expect(reg.defaultProperties.textVariable).toBe('discordMessage');
      expect(reg.defaultProperties.channelIdVariable).toBe('discordChannelId');
      expect(reg.defaultProperties.authorVariable).toBe('discordUsername');
      expect(reg.defaultProperties.senderNameVariable).toBe('discordSenderName');
      expect(reg.defaultProperties.authorIdVariable).toBe('discordAuthorId');
      expect(reg.defaultProperties.attachmentUrlVariable).toBe('discordAttachmentUrl');
      expect(reg.defaultProperties.rawUpdateVariable).toBe('discordUpdate');
    });

    it('registers slack_watch with full property defaults', () => {
      const reg = NODE_REGISTRY.slack_watch;
      expect(reg).toBeDefined();
      expect(reg.type).toBe('slack_watch');
      expect(reg.category).toBe('messaging');
      expect(reg.icon).toBe('Radio');
      expect(reg.defaultProperties.timeoutSeconds).toBe(60);
      expect(reg.defaultProperties.unlimitedTimeout).toBe(false);
      expect(reg.defaultProperties.recurring).toBe(false);
      expect(reg.defaultProperties.pollIntervalMs).toBe(2000);
      expect(reg.defaultProperties.ignoreBots).toBe(true);
      expect(reg.defaultProperties.textVariable).toBe('slackMessage');
      expect(reg.defaultProperties.channelVariable).toBe('slackChannel');
      expect(reg.defaultProperties.userIdVariable).toBe('slackUserId');
      expect(reg.defaultProperties.timestampVariable).toBe('slackTimestamp');
      expect(reg.defaultProperties.rawUpdateVariable).toBe('slackUpdate');
    });

    it('verifies telegram_watch defaults include unlimitedTimeout and recurring options', () => {
      const reg = NODE_REGISTRY.telegram_watch;
      expect(reg).toBeDefined();
      expect(reg.defaultProperties.unlimitedTimeout).toBe(false);
      expect(reg.defaultProperties.recurring).toBe(false);
      expect(reg.defaultProperties.maxIterations).toBe(0);
      expect(reg.defaultProperties.delayBetweenMs).toBe(1000);
    });
  });

  describe('Discord Watch Executor (executeDiscordWatch)', () => {
    it('throws error when botToken is missing', async () => {
      const node: WorkflowNode = {
        id: 'discord_node_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Discord',
          category: 'messaging',
          type: 'discord_watch',
          properties: {
            botToken: '',
            channelId: '123456789',
          },
        },
      };

      const ctx = createMockContext();
      await expect(executeDiscordWatch(node, ctx)).rejects.toThrow(
        /Discord Bot Token is required/
      );
    });

    it('throws error when channelId is missing', async () => {
      const node: WorkflowNode = {
        id: 'discord_node_2',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Discord',
          category: 'messaging',
          type: 'discord_watch',
          properties: {
            botToken: 'DISCORD_TOKEN',
            channelId: '',
          },
        },
      };

      const ctx = createMockContext();
      await expect(executeDiscordWatch(node, ctx)).rejects.toThrow(
        /Discord Channel ID is required/
      );
    });

    it('successfully extracts message content, author, attachments, and sets variables', async () => {
      // 1. Initial baseline check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [{ id: '900' }],
      });

      // 2. Poll pollUrl
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [
          {
            id: '901',
            content: '!run deploy-prod',
            channel_id: '123456789',
            author: {
              id: 'user_42',
              username: 'alice',
              global_name: 'Alice W.',
              bot: false,
            },
            timestamp: '2026-10-01T12:00:00.000Z',
            attachments: [
              { url: 'https://cdn.discordapp.com/attachments/config.json' },
            ],
          },
        ],
      });

      const node: WorkflowNode = {
        id: 'discord_node_3',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Discord Messages',
          category: 'messaging',
          type: 'discord_watch',
          properties: {
            botToken: 'DISCORD_TOKEN',
            channelId: '123456789',
            timeoutSeconds: 10,
            pollIntervalMs: 50,
            textVariable: 'cmd',
            authorVariable: 'authorHandle',
            senderNameVariable: 'authorName',
            authorIdVariable: 'authorUid',
            channelIdVariable: 'chanId',
            attachmentUrlVariable: 'fileUrl',
            rawUpdateVariable: 'rawDiscord',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeDiscordWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('!run deploy-prod');
      expect(ctx.variables.cmd).toBe('!run deploy-prod');
      expect(ctx.variables.authorHandle).toBe('alice');
      expect(ctx.variables.authorName).toBe('Alice W.');
      expect(ctx.variables.authorUid).toBe('user_42');
      expect(ctx.variables.chanId).toBe('123456789');
      expect(ctx.variables.fileUrl).toBe('https://cdn.discordapp.com/attachments/config.json');
      expect(ctx.variables.cmd_id).toBe('901');
      expect(ctx.variables.rawDiscord.id).toBe('901');
    });

    it('filters out bot messages when ignoreBots is true', async () => {
      // 1. Initial baseline
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      });

      // 2. Poll: returns a bot message first, then a human user message
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [
          {
            id: '1002',
            content: 'Hello from real user',
            author: { id: 'usr_1', username: 'bob', bot: false },
          },
          {
            id: '1001',
            content: 'Bot notification',
            author: { id: 'bot_1', username: 'botty', bot: true },
          },
        ],
      });

      const node: WorkflowNode = {
        id: 'discord_bot_filter',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Filter Bots',
          category: 'messaging',
          type: 'discord_watch',
          properties: {
            botToken: 'DISCORD_TOKEN',
            channelId: '123456789',
            ignoreBots: true,
            timeoutSeconds: 5,
            pollIntervalMs: 50,
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeDiscordWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('Hello from real user');
      expect(ctx.variables.discordUsername).toBe('bob');
    });

    it('filters messages by allowedUserId', async () => {
      // 1. Baseline
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      });

      // 2. Poll: unauthorized user first, then authorized user
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [
          {
            id: '1004',
            content: 'Command from VIP',
            author: { id: 'vip_999', username: 'vip_user', bot: false },
          },
          {
            id: '1003',
            content: 'Random message',
            author: { id: 'random_1', username: 'someone', bot: false },
          },
        ],
      });

      const node: WorkflowNode = {
        id: 'discord_user_filter',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Filter User',
          category: 'messaging',
          type: 'discord_watch',
          properties: {
            botToken: 'DISCORD_TOKEN',
            channelId: '123456789',
            allowedUserId: 'vip_999',
            timeoutSeconds: 5,
            pollIntervalMs: 50,
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeDiscordWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('Command from VIP');
      expect(ctx.variables.discordAuthorId).toBe('vip_999');
    });

    it('supports unlimitedTimeout without timing out', async () => {
      // 1. Baseline
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      });

      // 2. First poll empty
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      });

      // 3. Second poll message arrives
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [
          {
            id: '2001',
            content: 'Event arrived after wait',
            author: { id: 'u1', username: 'charlie' },
          },
        ],
      });

      const node: WorkflowNode = {
        id: 'discord_unlimited',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Unlimited Wait',
          category: 'messaging',
          type: 'discord_watch',
          properties: {
            botToken: 'DISCORD_TOKEN',
            channelId: '123456789',
            unlimitedTimeout: true,
            pollIntervalMs: 20,
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeDiscordWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('Event arrived after wait');
    });

    it('cancels immediately when abort signal is triggered', async () => {
      const controller = new AbortController();
      controller.abort();

      const node: WorkflowNode = {
        id: 'discord_abort',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Abort',
          category: 'messaging',
          type: 'discord_watch',
          properties: {
            botToken: 'DISCORD_TOKEN',
            channelId: '123456789',
            timeoutSeconds: 30,
          },
        },
      };

      const ctx = createMockContext();
      ctx.signal = controller.signal;

      await expect(executeDiscordWatch(node, ctx)).rejects.toThrow(
        /Discord message watcher was cancelled/
      );
    });
  });

  describe('Slack Watch Executor (executeSlackWatch)', () => {
    it('throws error when botToken is missing', async () => {
      const node: WorkflowNode = {
        id: 'slack_node_1',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Slack',
          category: 'messaging',
          type: 'slack_watch',
          properties: {
            botToken: '',
            channel: 'C123456',
          },
        },
      };

      const ctx = createMockContext();
      await expect(executeSlackWatch(node, ctx)).rejects.toThrow(
        /Slack Bot Token/
      );
    });

    it('throws error when channel is missing', async () => {
      const node: WorkflowNode = {
        id: 'slack_node_2',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Slack',
          category: 'messaging',
          type: 'slack_watch',
          properties: {
            botToken: 'xoxb-test-token',
            channel: '',
          },
        },
      };

      const ctx = createMockContext();
      await expect(executeSlackWatch(node, ctx)).rejects.toThrow(
        /Slack Channel \(ID or name\) is required/
      );
    });

    it('successfully extracts message text, user, timestamp, and sets variables', async () => {
      // 1. Initial baseline check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          messages: [{ ts: '1710000000.000100' }],
        }),
      });

      // 2. Poll pollUrl
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          messages: [
            {
              ts: '1710000005.000200',
              text: 'Approve pull request #42',
              user: 'U12345678',
            },
          ],
        }),
      });

      const node: WorkflowNode = {
        id: 'slack_node_3',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Watch Slack Updates',
          category: 'messaging',
          type: 'slack_watch',
          properties: {
            botToken: 'xoxb-test-token',
            channel: 'C123456',
            timeoutSeconds: 10,
            pollIntervalMs: 50,
            textVariable: 'slackCmd',
            userIdVariable: 'slackSender',
            channelVariable: 'slackChan',
            timestampVariable: 'slackTs',
            rawUpdateVariable: 'slackRaw',
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeSlackWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('Approve pull request #42');
      expect(ctx.variables.slackCmd).toBe('Approve pull request #42');
      expect(ctx.variables.slackSender).toBe('U12345678');
      expect(ctx.variables.slackChan).toBe('C123456');
      expect(ctx.variables.slackTs).toBe('1710000005.000200');
      expect(ctx.variables.slackRaw).toBeDefined();
    });

    it('filters out bot messages when ignoreBots is true', async () => {
      // 1. Baseline
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, messages: [] }),
      });

      // 2. Poll: bot message with bot_id first, then user message
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          messages: [
            {
              ts: '1710000010.000200',
              text: 'Real employee message',
              user: 'U_HUMAN',
            },
            {
              ts: '1710000009.000100',
              text: 'Automated Bot Alert',
              bot_id: 'B_BOT_99',
            },
          ],
        }),
      });

      const node: WorkflowNode = {
        id: 'slack_bot_filter',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Filter Slack Bots',
          category: 'messaging',
          type: 'slack_watch',
          properties: {
            botToken: 'xoxb-test-token',
            channel: 'C123456',
            ignoreBots: true,
            onlyNewMessages: false,
            timeoutSeconds: 5,
            pollIntervalMs: 20,
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeSlackWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('Real employee message');
      expect(ctx.variables.slackUserId).toBe('U_HUMAN');
    });

    it('filters messages by allowedUserId', async () => {
      // 1. Poll: wrong user first, allowed user second
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          messages: [
            {
              ts: '1710000020.000200',
              text: 'Authorized Manager command',
              user: 'U_MANAGER',
            },
            {
              ts: '1710000019.000100',
              text: 'Random intern chatter',
              user: 'U_INTERN',
            },
          ],
        }),
      });

      const node: WorkflowNode = {
        id: 'slack_user_filter',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Filter Slack User',
          category: 'messaging',
          type: 'slack_watch',
          properties: {
            botToken: 'xoxb-test-token',
            channel: 'C123456',
            allowedUserId: 'U_MANAGER',
            onlyNewMessages: false,
            timeoutSeconds: 5,
            pollIntervalMs: 20,
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeSlackWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('Authorized Manager command');
      expect(ctx.variables.slackUserId).toBe('U_MANAGER');
    });

    it('supports unlimitedTimeout without timing out', async () => {
      // 1. First poll empty
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, messages: [] }),
      });

      // 2. Second poll receives message
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          messages: [
            {
              ts: '1710000030.000100',
              text: 'Arrived after unlimited wait',
              user: 'U_DEV',
            },
          ],
        }),
      });

      const node: WorkflowNode = {
        id: 'slack_unlimited',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Slack Unlimited',
          category: 'messaging',
          type: 'slack_watch',
          properties: {
            botToken: 'xoxb-test-token',
            channel: 'C123456',
            unlimitedTimeout: true,
            onlyNewMessages: false,
            pollIntervalMs: 20,
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeSlackWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('Arrived after unlimited wait');
    });

    it('cancels immediately when abort signal is triggered', async () => {
      const controller = new AbortController();
      controller.abort();

      const node: WorkflowNode = {
        id: 'slack_abort',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Slack Abort',
          category: 'messaging',
          type: 'slack_watch',
          properties: {
            botToken: 'xoxb-test-token',
            channel: 'C123456',
            timeoutSeconds: 30,
          },
        },
      };

      const ctx = createMockContext();
      ctx.signal = controller.signal;

      await expect(executeSlackWatch(node, ctx)).rejects.toThrow(
        /Slack message watcher was cancelled/
      );
    });
  });

  describe('Telegram Watch Executor Unlimited Timeout', () => {
    it('supports unlimitedTimeout in executeTelegramWatch', async () => {
      // 1. Initial offset check: returns update_id 50
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          result: [{ update_id: 50 }],
        }),
      });

      // 2. Poll: returns update_id 51
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 51,
              message: {
                message_id: 123,
                chat: { id: 777 },
                from: { username: 'tguser' },
                text: 'unlimited telegram msg',
              },
            },
          ],
        }),
      });

      // 3. Mark read offset
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, result: [] }),
      });

      const node: WorkflowNode = {
        id: 'tg_unlimited',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Telegram Unlimited',
          category: 'messaging',
          type: 'telegram_watch',
          properties: {
            botToken: '123:TOKEN',
            unlimitedTimeout: true,
            pollIntervalMs: 20,
            markAsRead: true,
          },
        },
      };

      const ctx = createMockContext();
      const res = await executeTelegramWatch(node, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toBe('unlimited telegram msg');
    });
  });

  describe('WorkflowEngine Recurring Watcher Integration', () => {
    it('executes recurring watch node and runs downstream branch on each update until maxIterations', async () => {
      let pollCallCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith('limit=1')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => [],
          };
        }
        pollCallCount++;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [
            {
              id: `msg_${pollCallCount}`,
              content: `Discord update #${pollCallCount}`,
              author: { id: 'u_tester', username: 'tester', bot: false },
            },
          ],
        };
      });

      const downstreamLogs: string[] = [];

      const workflow: Workflow = {
        id: 'wf_recurring_watch',
        name: 'Recurring Watch Test',
        nodes: [
          {
            id: 'watch_node',
            type: 'customNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Recurring Discord Watch',
              category: 'messaging',
              type: 'discord_watch',
              properties: {
                botToken: 'DISCORD_TOKEN',
                channelId: 'channel_101',
                recurring: true,
                maxIterations: 2, // stop after 2 iterations
                delayBetweenMs: 10,
                pollIntervalMs: 10,
                textVariable: 'lastMsg',
              },
            },
          },
          {
            id: 'logger_node',
            type: 'customNode',
            position: { x: 200, y: 0 },
            data: {
              label: 'Process Message',
              category: 'data',
              type: 'simple_storage',
              properties: {
                key: 'received',
                operation: 'set',
                value: '{{lastMsg}}',
              },
            },
          },
          {
            id: 'done_node',
            type: 'customNode',
            position: { x: 400, y: 0 },
            data: {
              label: 'Done Handler',
              category: 'data',
              type: 'simple_storage',
              properties: {
                key: 'completed',
                operation: 'set',
                value: 'all_done',
              },
            },
          },
        ],
        edges: [
          {
            id: 'e1',
            source: 'watch_node',
            target: 'logger_node',
            sourceHandle: 'loop_body',
          },
          {
            id: 'e2',
            source: 'watch_node',
            target: 'done_node',
            sourceHandle: 'loop_done',
          },
        ],
        settings: {
          timeout: 10000,
          retryCount: 0,
          retryDelay: 0,
          stopOnError: true,
          highlightElements: false,
        },
      };

      const engine = new WorkflowEngine(workflow);
      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      expect(engine.getVariables().lastMsg).toBe('Discord update #2');
      expect(engine.getVariables().completed).toBe('all_done');
    });
  });
});
