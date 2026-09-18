import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkflowEngine } from '../src/runtime/engine';
import { Workflow, WorkflowSettings } from '../src/types/workflow';
import { clickElement, scrollPage, typeText } from '../src/content/domActions';
import { moveCursorTo, teardownHumanCursor } from '../src/content/humanizer';
import { resolveHumanConfig } from '../src/utils/human';

function makeSettings(overrides: Partial<WorkflowSettings> = {}): WorkflowSettings {
  return {
    timeout: 5000,
    retryCount: 0,
    retryDelay: 10,
    stopOnError: true,
    highlightElements: false,
    ...overrides,
  };
}

function makeClickWorkflow(settings: Partial<WorkflowSettings>): Workflow {
  return {
    id: 'wf_human',
    name: 'Human Mode Workflow',
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    variables: {},
    settings: makeSettings(settings),
    nodes: [
      {
        id: 'click_node',
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Click Button',
          category: 'interaction',
          type: 'click',
          properties: { selector: '#btn', clickType: 'left', timeout: 200 },
        },
      },
    ],
    edges: [],
  };
}

function lastDomActionPayload() {
  const calls = (globalThis as any).chrome.runtime.sendMessage.mock.calls;
  const call = calls.find((c: any[]) => c[0]?.type === 'EXECUTE_DOM_ACTION');
  return call?.[0]?.payload;
}

const fastHuman = () => ({
  ...resolveHumanConfig({ humanMode: true })!,
  minDelay: 1,
  maxDelay: 2,
});

describe('Human Mode execution', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as any).chrome;
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
    teardownHumanCursor();
    vi.restoreAllMocks();
  });

  it('forwards the resolved human config to DOM actions when enabled', async () => {
    (globalThis as any).chrome = {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true }) },
    };

    const logs: string[] = [];
    const engine = new WorkflowEngine(makeClickWorkflow({ humanMode: true, humanIntensity: 'slow' }), {
      onLog: (l) => logs.push(l.message),
    });

    await engine.run();

    const payload = lastDomActionPayload();
    expect(payload.action).toBe('click');
    expect(payload.human).toBeDefined();
    expect(payload.human.intensity).toBe('slow');
    expect(payload.human.cursor).toBe(true);
    expect(logs.some(m => m.includes('Human mode enabled'))).toBe(true);
    expect(engine.getStatus()).toBe('completed');
  });

  it('omits the human config entirely when the toggle is off', async () => {
    (globalThis as any).chrome = {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true }) },
    };

    const logs: string[] = [];
    const engine = new WorkflowEngine(makeClickWorkflow({ humanMode: false }), {
      onLog: (l) => logs.push(l.message),
    });

    await engine.run();

    const payload = lastDomActionPayload();
    expect(payload.action).toBe('click');
    expect('human' in payload).toBe(false);
    expect(logs.some(m => m.includes('Human mode enabled'))).toBe(false);
  });

  it('keeps think-time abort-aware so Stop returns promptly', async () => {
    (globalThis as any).chrome = {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true }) },
    };

    // Long pause: without abort handling this run would hang for ~5s.
    const engine = new WorkflowEngine(
      makeClickWorkflow({ humanMode: true, humanMinDelay: 5000, humanMaxDelay: 5000 })
    );

    const started = Date.now();
    const runPromise = engine.run();
    setTimeout(() => engine.stop(), 40);
    await runPromise;

    expect(Date.now() - started).toBeLessThan(2000);
    expect(engine.getStatus()).toBe('stopped');
  });

  it('clickElement still clicks the real element in human mode', async () => {
    const btn = document.createElement('button');
    btn.id = 'human-btn';
    document.body.appendChild(btn);

    let clicked = 0;
    btn.addEventListener('click', () => clicked++);

    const res = await clickElement('#human-btn', { timeout: 500, human: fastHuman() });

    expect(res.success).toBe(true);
    expect(clicked).toBe(1);
  });

  it('typeText types the full value with human pacing', async () => {
    const input = document.createElement('input');
    input.id = 'human-input';
    document.body.appendChild(input);

    const res = await typeText('#human-input', {
      text: 'hello world',
      clearExisting: true,
      timeout: 500,
      human: { ...fastHuman(), typingMin: 1, typingMax: 2, actionPauseMin: 1, actionPauseMax: 2 },
    });

    expect(res.success).toBe(true);
    expect(input.value).toBe('hello world');
  });

  it('scrollPage nudges in several wheel-sized steps in human mode', async () => {
    const scrollBy = vi.fn();
    (window as any).scrollBy = scrollBy;

    const human = { ...fastHuman(), actionPauseMin: 1, actionPauseMax: 2 };
    await scrollPage({ direction: 'down', amount: 800, smooth: false, human });

    expect(scrollBy.mock.calls.length).toBeGreaterThan(1);
    const totalY = scrollBy.mock.calls.reduce((sum, call) => sum + (call[0]?.top || 0), 0);
    expect(Math.round(totalY)).toBe(800);
  });

  it('moveCursorTo no-ops gracefully without a cursor config', async () => {
    await moveCursorTo({ x: 5, y: 5 }, { ...fastHuman(), cursor: false });
    expect(document.getElementById('autoflow-human-cursor')).toBeNull();
  });
});
