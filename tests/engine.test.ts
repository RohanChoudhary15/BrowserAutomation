import { describe, it, expect, vi } from 'vitest';
import { WorkflowEngine } from '../src/runtime/engine';
import { Workflow } from '../src/types/workflow';

describe('Workflow Engine', () => {
  it('executes linear sequence of nodes', async () => {
    const executed: string[] = [];

    const wf: Workflow = {
      id: 'test_wf_1',
      name: 'Test Workflow',
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      variables: {},
      settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
      nodes: [
        {
          id: 'node_1',
          type: 'customNode',
          position: { x: 0, y: 0 },
          data: { label: 'Set A', category: 'data', type: 'set_variable', properties: { name: 'varA', value: 'hello' } },
        },
        {
          id: 'node_2',
          type: 'customNode',
          position: { x: 0, y: 100 },
          data: { label: 'Transform A', category: 'data', type: 'transform', properties: { input: '{{varA}}', operation: 'uppercase', outputVariable: 'varAUpper' } },
        },
      ],
      edges: [
        { id: 'e1', source: 'node_1', target: 'node_2' },
      ],
    };

    const engine = new WorkflowEngine(wf, {
      onNodeStateChange: (id, state) => {
        if (state.status === 'success') executed.push(id);
      },
    });

    await engine.run();

    expect(executed).toEqual(['node_1', 'node_2']);
    expect(engine.getVariables().varA).toBe('hello');
    expect(engine.getVariables().varAUpper).toBe('HELLO');
    expect(engine.getStatus()).toBe('completed');
  });

  it('follows conditional branching', async () => {
    const executed: string[] = [];

    const wf: Workflow = {
      id: 'test_wf_cond',
      name: 'Conditional Workflow',
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      variables: { score: 95 },
      settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
      nodes: [
        {
          id: 'cond_node',
          type: 'conditionNode',
          position: { x: 0, y: 0 },
          data: { label: 'Check Score', category: 'logic', type: 'condition', properties: { leftValue: '{{score}}', operator: 'greater_than', rightValue: 80 } },
        },
        {
          id: 'true_branch',
          type: 'customNode',
          position: { x: -100, y: 100 },
          data: { label: 'Passed', category: 'data', type: 'set_variable', properties: { name: 'result', value: 'PASSED' } },
        },
        {
          id: 'false_branch',
          type: 'customNode',
          position: { x: 100, y: 100 },
          data: { label: 'Failed', category: 'data', type: 'set_variable', properties: { name: 'result', value: 'FAILED' } },
        },
      ],
      edges: [
        { id: 'e_true', source: 'cond_node', target: 'true_branch', sourceHandle: 'true' },
        { id: 'e_false', source: 'cond_node', target: 'false_branch', sourceHandle: 'false' },
      ],
    };

    const engine = new WorkflowEngine(wf, {
      onNodeStateChange: (id, state) => {
        if (state.status === 'success') executed.push(id);
      },
    });

    await engine.run();

    expect(executed).toContain('cond_node');
    expect(executed).toContain('true_branch');
    expect(executed).not.toContain('false_branch');
    expect(engine.getVariables().result).toBe('PASSED');
  });

  it('executes loop iterations', async () => {
    let loopCount = 0;

    const wf: Workflow = {
      id: 'test_wf_loop',
      name: 'Loop Workflow',
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      variables: {},
      settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
      nodes: [
        {
          id: 'loop_node',
          type: 'loopNode',
          position: { x: 0, y: 0 },
          data: { label: 'Repeat 3', category: 'logic', type: 'loop', properties: { count: 3 } },
        },
        {
          id: 'body_node',
          type: 'customNode',
          position: { x: 0, y: 100 },
          data: { label: 'Increment', category: 'data', type: 'set_variable', properties: { name: 'lastIndex', value: '{{index}}' } },
        },
      ],
      edges: [
        { id: 'e_body', source: 'loop_node', target: 'body_node', sourceHandle: 'loop_body' },
      ],
    };

    const engine = new WorkflowEngine(wf, {
      onNodeStateChange: (id, state) => {
        if (id === 'body_node' && state.status === 'success') {
          loopCount++;
        }
      },
    });

    await engine.run();

    expect(loopCount).toBe(3);
    expect(engine.getVariables().lastIndex).toBe(2);
  });

  it('stops cleanly on cancellation', async () => {
    const wf: Workflow = {
      id: 'test_abort',
      name: 'Abort Workflow',
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      variables: {},
      settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
      nodes: [
        {
          id: 'wait_node',
          type: 'customNode',
          position: { x: 0, y: 0 },
          data: { label: 'Long Wait', category: 'wait', type: 'wait', properties: { duration: 5000 } },
        },
      ],
      edges: [],
    };

    const engine = new WorkflowEngine(wf);
    const runPromise = engine.run();

    setTimeout(() => {
      engine.stop();
    }, 50);

    await runPromise;
    expect(engine.getStatus()).toBe('stopped');
  });

  it('generates random data into variables', async () => {
    const wf: Workflow = {
      id: 'test_gen_data',
      name: 'Generate Data Workflow',
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      variables: {},
      settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
      nodes: [
        {
          id: 'gen_email',
          type: 'customNode',
          position: { x: 0, y: 0 },
          data: { label: 'Gen Email', category: 'data', type: 'generate_data', properties: { dataType: 'email', outputVariable: 'testEmail' } },
        },
        {
          id: 'gen_uuid',
          type: 'customNode',
          position: { x: 0, y: 100 },
          data: { label: 'Gen UUID', category: 'data', type: 'generate_data', properties: { dataType: 'uuid', outputVariable: 'testUuid' } },
        },
      ],
      edges: [
        { id: 'e_gen', source: 'gen_email', target: 'gen_uuid' },
      ],
    };

    const engine = new WorkflowEngine(wf);
    await engine.run();

    const vars = engine.getVariables();
    expect(vars.testEmail).toMatch(/^test\.user_[a-z0-9]+@example\.com$/);
    expect(vars.testUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(engine.getStatus()).toBe('completed');
  });
});

