import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryVisionLlm } from '../src/ai/aiService';
import {
  parseAgentModelResponse,
  convertAgentStepsToWorkflow,
  runBrowserAgent,
  createInitialTaskPlan,
  AgentPauseController,
} from '../src/ai/browserAgent';
import { AgentStep, AgentTask } from '../src/ai/types';

describe('Autonomous AI Browser Agent & Vision', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('queryVisionLlm', () => {
    it('sends correct OpenAI vision payload with base64 image_url', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  thought: 'I see a search input. I should type into it.',
                  action: { type: 'type', selector: 'input[name="q"]', text: 'AutoFlow' },
                  isComplete: false,
                }),
              },
            },
          ],
        }),
      } as Response);

      const res = await queryVisionLlm({
        prompt: 'Search for AutoFlow',
        imageBase64: 'fakeBase64String',
        config: {
          provider: 'openai',
          apiKey: 'test-key',
          model: 'gpt-5.6-sol',
          openaiBaseUrl: 'https://api.experientiallabs.ai',
        },
      });

      expect(fetchSpy).toHaveBeenCalled();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.experientiallabs.ai/v1/chat/completions');

      const body = JSON.parse(options.body as string);
      expect(body.model).toBe('gpt-5.6-sol');
      expect(body.messages[0].content).toEqual([
        { type: 'text', text: 'Search for AutoFlow' },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/jpeg;base64,fakeBase64String',
            detail: 'high',
          },
        },
      ]);

      expect(res).toContain('AutoFlow');
    });

    it('sends correct Gemini multimodal payload with inline_data', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '{"thought":"Gemini vision saw the page","action":{"type":"done"},"isComplete":true}' }],
              },
            },
          ],
        }),
      } as Response);

      const res = await queryVisionLlm({
        prompt: 'Inspect this page',
        imageBase64: 'data:image/jpeg;base64,sampleBase64',
        config: {
          provider: 'gemini',
          apiKey: 'gemini-key',
          model: 'gemini-1.5-flash',
        },
      });

      expect(fetchSpy).toHaveBeenCalled();
      const [, options] = fetchSpy.mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.contents[0].parts[0]).toEqual({ text: 'Inspect this page' });
      expect(body.contents[0].parts[1]).toEqual({
        inline_data: {
          mime_type: 'image/jpeg',
          data: 'sampleBase64',
        },
      });
      expect(res).toContain('Gemini vision saw the page');
    });
  });

  describe('parseAgentModelResponse', () => {
    it('parses valid JSON response', () => {
      const raw = JSON.stringify({
        thought: 'I need to click the submit button.',
        action: {
          type: 'click',
          elementIndex: 2,
          selector: 'button.submit',
        },
        isComplete: false,
      });

      const parsed = parseAgentModelResponse(raw);
      expect(parsed.thought).toBe('I need to click the submit button.');
      expect(parsed.action.type).toBe('click');
      expect(parsed.action.elementIndex).toBe(2);
      expect(parsed.isComplete).toBe(false);
    });

    it('strips markdown code blocks gracefully', () => {
      const raw = `\`\`\`json
{
  "thought": "Typing username into input field.",
  "action": {
    "type": "type",
    "selector": "input#username",
    "text": "admin@example.com",
    "pressEnter": true
  },
  "isComplete": false
}
\`\`\``;

      const parsed = parseAgentModelResponse(raw);
      expect(parsed.action.type).toBe('type');
      expect(parsed.action.text).toBe('admin@example.com');
      expect(parsed.action.pressEnter).toBe(true);
    });

    it('falls back to semantic extraction if response is not strictly formatted', () => {
      const raw = 'I will click on the next button to continue.';
      const parsed = parseAgentModelResponse(raw);
      expect(parsed.action.type).toBe('click');
      expect(parsed.isComplete).toBe(false);
    });
    it('parses clipboard and shortcut action responses', () => {
      const shortcutRaw = JSON.stringify({
        thought: 'Pressing Ctrl+V to paste the copied content',
        action: {
          type: 'shortcut',
          shortcut: 'Ctrl+V',
          selector: 'textarea#editor',
        },
        isComplete: false,
      });
      const parsedShortcut = parseAgentModelResponse(shortcutRaw);
      expect(parsedShortcut.action.type).toBe('shortcut');
      expect(parsedShortcut.action.shortcut).toBe('Ctrl+V');
      expect(parsedShortcut.action.selector).toBe('textarea#editor');

      const copyRaw = JSON.stringify({
        thought: 'Copying generated token to clipboard',
        action: {
          type: 'copy_to_clipboard',
          clipboardText: 'auth_token_xyz_123',
        },
        isComplete: false,
      });
      const parsedCopy = parseAgentModelResponse(copyRaw);
      expect(parsedCopy.action.type).toBe('copy_to_clipboard');
      expect(parsedCopy.action.clipboardText).toBe('auth_token_xyz_123');

      const pasteRaw = JSON.stringify({
        thought: 'Pasting into the token field',
        action: {
          type: 'paste',
          selector: 'input#token-field',
        },
        isComplete: false,
      });
      const parsedPaste = parseAgentModelResponse(pasteRaw);
      expect(parsedPaste.action.type).toBe('paste');
      expect(parsedPaste.action.selector).toBe('input#token-field');
    });
  });

  describe('convertAgentStepsToWorkflow', () => {
    it('converts agent action sequence into linked canvas nodes', () => {
      const steps: AgentStep[] = [
        {
          stepNumber: 1,
          timestamp: Date.now(),
          thought: 'Navigating to page',
          action: { type: 'navigate', url: 'https://example.com' },
          success: true,
        },
        {
          stepNumber: 2,
          timestamp: Date.now() + 1000,
          thought: 'Typing search query',
          action: { type: 'type', selector: 'input.search', text: 'keyboards', pressEnter: true },
          success: true,
        },
        {
          stepNumber: 3,
          timestamp: Date.now() + 2000,
          thought: 'Clicking search button',
          action: { type: 'click', selector: 'button.btn' },
          success: true,
        },
        {
          stepNumber: 4,
          timestamp: Date.now() + 3000,
          thought: 'Task complete',
          action: { type: 'done', answer: 'Found 10 keyboards' },
          success: true,
          isComplete: true,
        },
      ];

      const { nodes, edges } = convertAgentStepsToWorkflow(steps, 'Search for keyboards');

      // 3 executable nodes: navigate, type_text, click
      expect(nodes.length).toBe(3);
      expect(nodes[0].data.type).toBe('navigate');
      expect(nodes[0].data.properties.url).toBe('https://example.com');

      expect(nodes[1].data.type).toBe('type_text');
      expect(nodes[1].data.properties.text).toBe('keyboards');

      expect(nodes[2].data.type).toBe('click');
      expect(nodes[2].data.properties.selector).toBe('button.btn');

      // 2 connecting edges linking node 0 -> node 1 -> node 2
      expect(edges.length).toBe(2);
      expect(edges[0].source).toBe(nodes[0].id);
      expect(edges[0].target).toBe(nodes[1].id);
      expect(edges[1].source).toBe(nodes[1].id);
      expect(edges[1].target).toBe(nodes[2].id);
    });

    it('converts copy_to_clipboard, paste, and shortcut actions into proper workflow nodes', () => {
      const steps: AgentStep[] = [
        {
          stepNumber: 1,
          timestamp: Date.now(),
          thought: 'Copying secret code',
          action: { type: 'copy_to_clipboard', clipboardText: 'SECRET_123' },
          success: true,
        },
        {
          stepNumber: 2,
          timestamp: Date.now() + 100,
          thought: 'Pasting into input',
          action: { type: 'paste', selector: 'input#token' },
          success: true,
        },
        {
          stepNumber: 3,
          timestamp: Date.now() + 200,
          thought: 'Pressing Ctrl+A shortcut',
          action: { type: 'shortcut', shortcut: 'Ctrl+A', selector: 'input#token' },
          success: true,
        },
      ];

      const { nodes, edges } = convertAgentStepsToWorkflow(steps, 'Clipboard & Shortcuts Workflow');

      expect(nodes.length).toBe(3);
      expect(nodes[0].data.type).toBe('clipboard');
      expect(nodes[0].data.properties.action).toBe('write');
      expect(nodes[0].data.properties.text).toBe('SECRET_123');

      expect(nodes[1].data.type).toBe('press_key');
      expect(nodes[1].data.properties.key).toBe('Ctrl+V');
      expect(nodes[1].data.properties.selector).toBe('input#token');

      expect(nodes[2].data.type).toBe('press_key');
      expect(nodes[2].data.properties.key).toBe('Ctrl+A');
      expect(nodes[2].data.properties.selector).toBe('input#token');

      expect(edges.length).toBe(2);
    });
  });

  describe('runBrowserAgent execution loop', () => {
    it('executes steps and triggers onStep callbacks with screenshots', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  thought: 'Page inspected, task accomplished.',
                  action: { type: 'done', answer: 'Mission complete!' },
                  isComplete: true,
                }),
              },
            },
          ],
        }),
      } as Response);

      const stepCallbacks: AgentStep[] = [];
      const screenshotCallbacks: string[] = [];

      const steps = await runBrowserAgent({
        goal: 'Test agent execution',
        maxSteps: 3,
        stepDelay: 10,
        onStep: (s) => stepCallbacks.push(s),
        onScreenshot: (shot) => screenshotCallbacks.push(shot),
      });

      expect(steps.length).toBe(1);
      expect(steps[0].action.type).toBe('done');
      expect(steps[0].isComplete).toBe(true);
      expect(stepCallbacks.length).toBe(1);
      expect(screenshotCallbacks.length).toBeGreaterThan(0);
    });

    it('creates and updates task statuses throughout agent execution', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  taskId: 'task_1',
                  thought: 'Navigating to website first.',
                  action: { type: 'navigate', url: 'https://example.com' },
                  isComplete: false,
                }),
              },
            },
          ],
        }),
      } as Response);

      let latestTasks: AgentTask[] = [];

      const steps = await runBrowserAgent({
        goal: 'Navigate to https://example.com and then search for mechanical keyboard',
        maxSteps: 1,
        stepDelay: 10,
        onTasksUpdate: (tasks) => {
          latestTasks = tasks;
        },
      });

      expect(latestTasks.length).toBeGreaterThan(0);
      expect(latestTasks[0].status).toBe('completed');
      expect(steps[0].taskId).toBeDefined();
    });
  });

  describe('createInitialTaskPlan', () => {
    it('breaks sequential goals into structured tasks', () => {
      const tasks = createInitialTaskPlan('Go to https://google.com, then search for "mechanical keyboard", and then extract the price');
      expect(tasks.length).toBeGreaterThanOrEqual(2);
      expect(tasks[0].title).toContain('Go to');
      expect(tasks[0].status).toBe('pending');
    });

    it('generates fallback tasks for simple goals', () => {
      const tasks = createInitialTaskPlan('Find the login button');
      expect(tasks.length).toBeGreaterThanOrEqual(2);
      expect(tasks.some(t => t.title.toLowerCase().includes('interact') || t.title.toLowerCase().includes('verify'))).toBe(true);
    });
  });

  describe('parseAgentModelResponse with taskId', () => {
    it('parses taskId from model response', () => {
      const json = JSON.stringify({
        taskId: 'task_2',
        thought: 'Typing into search input',
        action: { type: 'type', selector: 'input', text: 'hello' },
        isComplete: false,
      });
      const parsed = parseAgentModelResponse(json);
      expect(parsed.taskId).toBe('task_2');
      expect(parsed.action.type).toBe('type');
    });
  });

  describe('Human-in-the-Loop & AgentPauseController', () => {
    it('handles pause and resume with guidance correctly', async () => {
      const controller = new AgentPauseController();
      expect(controller.isPaused).toBe(false);

      // waitIfPaused resolves null immediately when not paused
      const resWhenNotPaused = await controller.waitIfPaused();
      expect(resWhenNotPaused).toBeNull();

      // Pause
      controller.pause();
      expect(controller.isPaused).toBe(true);

      // Async resume after 20ms
      setTimeout(() => {
        controller.resume('Click the blue button instead');
      }, 20);

      const guidance = await controller.waitIfPaused();
      expect(controller.isPaused).toBe(false);
      expect(guidance).toBe('Click the blue button instead');
    });

    it('handles abort signal while paused', async () => {
      const controller = new AgentPauseController();
      controller.pause();

      const abortCtrl = new AbortController();
      setTimeout(() => {
        abortCtrl.abort();
      }, 20);

      const result = await controller.waitIfPaused(abortCtrl.signal);
      expect(result).toBeNull();
    });

    it('parses ask_human action with question and options', () => {
      const json = JSON.stringify({
        thought: 'I encountered a CAPTCHA challenge that requires human verification.',
        action: {
          type: 'ask_human',
          question: 'Please solve the CAPTCHA puzzle on screen.',
          reason: 'CAPTCHA detected',
          suggestedOptions: ['I solved it, continue', 'Skip this task'],
        },
        isComplete: false,
      });

      const parsed = parseAgentModelResponse(json);
      expect(parsed.action.type).toBe('ask_human');
      expect(parsed.action.question).toBe('Please solve the CAPTCHA puzzle on screen.');
      expect(parsed.action.reason).toBe('CAPTCHA detected');
      expect(parsed.action.suggestedOptions).toEqual(['I solved it, continue', 'Skip this task']);
      expect(parsed.isComplete).toBe(false);
    });

    it('auto-converts CAPTCHA / 2FA thought into ask_human', () => {
      const json = JSON.stringify({
        thought: 'There is a Cloudflare CAPTCHA verification on screen preventing navigation.',
        action: {
          type: 'wait',
          durationMs: 3000,
        },
        isComplete: false,
      });

      const parsed = parseAgentModelResponse(json);
      expect(parsed.action.type).toBe('ask_human');
      expect(parsed.action.question).toContain('CAPTCHA');
    });

    it('runs browser agent with pauseController and human guidance request', async () => {
      const pauseController = new AgentPauseController();

      // First step: model asks human for assistance
      // Second step: model completes after receiving instruction
      let stepCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        stepCount++;
        if (stepCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      thought: 'I am not sure which product to click.',
                      action: {
                        type: 'ask_human',
                        question: 'Which product should I select?',
                        suggestedOptions: ['Pro Edition', 'Standard Edition'],
                      },
                      isComplete: false,
                    }),
                  },
                },
              ],
            }),
          } as Response;
        } else {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      thought: 'Following human instruction to pick Pro Edition.',
                      action: {
                        type: 'done',
                        answer: 'Selected Pro Edition successfully',
                      },
                      isComplete: true,
                    }),
                  },
                },
              ],
            }),
          } as Response;
        }
      });

      const guidanceSpy = vi.fn(async (req) => {
        expect(req.question).toBe('Which product should I select?');
        expect(req.suggestedOptions).toContain('Pro Edition');
        return 'Please choose Pro Edition';
      });

      const steps = await runBrowserAgent({
        goal: 'Select a product tier',
        maxSteps: 3,
        stepDelay: 10,
        pauseController,
        onRequestHumanGuidance: guidanceSpy,
      });

      expect(guidanceSpy).toHaveBeenCalledTimes(1);
      expect(steps.length).toBe(2);
      expect(steps[0].action.type).toBe('ask_human');
      expect(steps[0].humanGuidance).toBe('Please choose Pro Edition');
      expect(steps[1].action.type).toBe('done');
      expect(steps[1].isComplete).toBe(true);
    });
  });
});
