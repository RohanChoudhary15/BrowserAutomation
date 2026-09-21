import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { executeCondition } from '../src/runtime/executors';
import { formatRuleDescription, ConditionRule } from '../src/runtime/evaluator';
import { WorkflowEngine } from '../src/runtime/engine';
import { ExecutionContext } from '../src/types/execution';
import { Workflow } from '../src/types/workflow';

function makeCtx(variables: Record<string, any> = {}): ExecutionContext {
  return {
    workflowId: 'wf_condition',
    executionId: 'exec_condition',
    variables,
    signal: new AbortController().signal,
    log: vi.fn(),
    updateNodeState: vi.fn(),
  };
}

describe('Extended Condition Engine (Heterogeneous rules, Logic Gates & Short-Circuiting)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as any).chrome;
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  describe('formatRuleDescription', () => {
    it('formats variable rules correctly', () => {
      expect(formatRuleDescription({
        type: 'variable',
        leftValue: '{{count}}',
        operator: 'greater_than',
        rightValue: '10',
      })).toBe('{{count}} greater_than 10');

      expect(formatRuleDescription({
        type: 'variable',
        leftValue: '{{items}}',
        operator: 'is_not_empty',
      })).toBe('{{items}} is_not_empty');
    });

    it('formats element presence rules correctly', () => {
      expect(formatRuleDescription({
        type: 'element_presence',
        selector: '.toast-success',
        presenceMode: 'visible',
      })).toBe('Element ".toast-success" is visible');

      expect(formatRuleDescription({
        type: 'element_presence',
        selector: '#loading-spinner',
        presenceMode: 'not_present',
      })).toBe('Element "#loading-spinner" is not present');
    });

    it('formats page text rules correctly', () => {
      expect(formatRuleDescription({
        type: 'page_text',
        text: 'Order Confirmed',
        textMode: 'contains',
      })).toBe('Webpage contains "Order Confirmed"');

      expect(formatRuleDescription({
        type: 'page_text',
        text: 'Out of stock',
        textMode: 'does_not_contain',
      })).toBe('Webpage does not contain "Out of stock"');
    });

    it('formats wait complete rules correctly', () => {
      expect(formatRuleDescription({
        type: 'wait_complete',
        waitDurationMs: 3000,
      })).toBe('Wait 3s complete');
    });

    it('formats javascript expression rules correctly', () => {
      expect(formatRuleDescription({
        type: 'javascript',
        expression: '{{items.length}} > 0',
      })).toBe('JS: {{items.length}} > 0');
    });
  });

  describe('executeCondition multi-rule evaluation', () => {
    it('evaluates variable comparison rule with AND gate', async () => {
      const ctx = makeCtx({ score: 85, status: 'passed' });
      const node = {
        id: 'cond_1',
        data: {
          properties: {
            logicalGate: 'AND',
            conditions: [
              { type: 'variable', leftValue: '{{score}}', operator: 'greater_than', rightValue: 80 },
              { type: 'variable', leftValue: '{{status}}', operator: 'equals', rightValue: 'passed' },
            ],
          },
        },
      } as any;

      const result = await executeCondition(node, ctx);
      expect(result.success).toBe(true);
      expect(result.output.result).toBe(true);
      expect(result.output.branch).toBe('true');
      expect(ctx.variables.conditionResult).toBe(true);
    });

    it('fails AND gate when one condition fails', async () => {
      const ctx = makeCtx({ score: 50, status: 'passed' });
      const node = {
        id: 'cond_1',
        data: {
          properties: {
            logicalGate: 'AND',
            conditions: [
              { type: 'variable', leftValue: '{{score}}', operator: 'greater_than', rightValue: 80 },
              { type: 'variable', leftValue: '{{status}}', operator: 'equals', rightValue: 'passed' },
            ],
          },
        },
      } as any;

      const result = await executeCondition(node, ctx);
      expect(result.success).toBe(true);
      expect(result.output.result).toBe(false);
      expect(result.output.branch).toBe('false');
      expect(ctx.variables.conditionResult).toBe(false);
    });

    it('evaluates OR gate where one condition is true', async () => {
      const ctx = makeCtx({ score: 50, status: 'admin' });
      const node = {
        id: 'cond_1',
        data: {
          properties: {
            logicalGate: 'OR',
            conditions: [
              { type: 'variable', leftValue: '{{score}}', operator: 'greater_than', rightValue: 80 },
              { type: 'variable', leftValue: '{{status}}', operator: 'equals', rightValue: 'admin' },
            ],
          },
        },
      } as any;

      const result = await executeCondition(node, ctx);
      expect(result.success).toBe(true);
      expect(result.output.result).toBe(true);
      expect(result.output.branch).toBe('true');
    });

    it('evaluates NAND gate correctly', async () => {
      const ctx = makeCtx({ a: 10, b: 20 });
      // Both true -> NAND returns false
      const node1 = {
        id: 'cond_nand_1',
        data: {
          properties: {
            logicalGate: 'NAND',
            conditions: [
              { type: 'variable', leftValue: '{{a}}', operator: 'equals', rightValue: 10 },
              { type: 'variable', leftValue: '{{b}}', operator: 'equals', rightValue: 20 },
            ],
          },
        },
      } as any;
      const res1 = await executeCondition(node1, ctx);
      expect(res1.output.result).toBe(false);

      // One false -> NAND returns true
      const node2 = {
        id: 'cond_nand_2',
        data: {
          properties: {
            logicalGate: 'NAND',
            conditions: [
              { type: 'variable', leftValue: '{{a}}', operator: 'equals', rightValue: 999 },
              { type: 'variable', leftValue: '{{b}}', operator: 'equals', rightValue: 20 },
            ],
          },
        },
      } as any;
      const res2 = await executeCondition(node2, ctx);
      expect(res2.output.result).toBe(true);
    });

    it('evaluates NOR gate correctly', async () => {
      const ctx = makeCtx({ a: 10, b: 20 });
      // One true -> NOR returns false
      const node1 = {
        id: 'cond_nor_1',
        data: {
          properties: {
            logicalGate: 'NOR',
            conditions: [
              { type: 'variable', leftValue: '{{a}}', operator: 'equals', rightValue: 10 },
              { type: 'variable', leftValue: '{{b}}', operator: 'equals', rightValue: 999 },
            ],
          },
        },
      } as any;
      const res1 = await executeCondition(node1, ctx);
      expect(res1.output.result).toBe(false);

      // Both false -> NOR returns true
      const node2 = {
        id: 'cond_nor_2',
        data: {
          properties: {
            logicalGate: 'NOR',
            conditions: [
              { type: 'variable', leftValue: '{{a}}', operator: 'equals', rightValue: 999 },
              { type: 'variable', leftValue: '{{b}}', operator: 'equals', rightValue: 999 },
            ],
          },
        },
      } as any;
      const res2 = await executeCondition(node2, ctx);
      expect(res2.output.result).toBe(true);
    });
  });

  describe('Race Condition: "Wait complete OR this text is found"', () => {
    it('short-circuits to true immediately when text is found before wait duration elapses', async () => {
      // Mock chrome runtime sendMessage
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg: any) => {
            if (msg.type === 'EXECUTE_DOM_ACTION' && msg.payload.action === 'check_element_presence') {
              return Promise.resolve({ present: true, visible: true });
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const ctx = makeCtx();
      const node = {
        id: 'cond_race_1',
        data: {
          properties: {
            logicalGate: 'OR',
            conditions: [
              { type: 'wait_complete', waitDurationMs: 2000 },
              { type: 'page_text', text: 'Payment Complete', textMode: 'contains', timeout: 500 },
            ],
          },
        },
      } as any;

      const startTime = Date.now();
      const result = await executeCondition(node, ctx);
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.output.result).toBe(true);
      expect(result.output.branch).toBe('true');
      // Text was found immediately, so it must NOT wait for the 2000ms wait timer
      expect(elapsed).toBeLessThan(1200);
    });

    it('evaluates to true after wait expires when text is not found', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg: any) => {
            if (msg.type === 'EXECUTE_DOM_ACTION' && msg.payload.action === 'check_element_presence') {
              return Promise.resolve({ present: false, visible: false });
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const ctx = makeCtx();
      const node = {
        id: 'cond_race_2',
        data: {
          properties: {
            logicalGate: 'OR',
            conditions: [
              { type: 'wait_complete', waitDurationMs: 200 },
              { type: 'page_text', text: 'Non-existent text', textMode: 'contains', timeout: 100 },
            ],
          },
        },
      } as any;

      const result = await executeCondition(node, ctx);
      expect(result.success).toBe(true);
      expect(result.output.result).toBe(true);
    });

    it('evaluates element presence with variable comparison in an AND condition', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg: any) => {
            if (msg.type === 'EXECUTE_DOM_ACTION' && msg.payload.action === 'check_element_presence') {
              return Promise.resolve({ present: true, visible: true });
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const ctx = makeCtx({ userBalance: 500 });
      const node = {
        id: 'cond_mix_1',
        data: {
          properties: {
            logicalGate: 'AND',
            conditions: [
              { type: 'element_presence', selector: '#checkout-btn', presenceMode: 'visible', timeout: 200 },
              { type: 'variable', leftValue: '{{userBalance}}', operator: 'greater_equal', rightValue: 100 },
            ],
          },
        },
      } as any;

      const result = await executeCondition(node, ctx);
      expect(result.success).toBe(true);
      expect(result.output.result).toBe(true);
    });
  });

  describe('WorkflowEngine branching with extended Condition Node', () => {
    it('executes true branch when condition passes', async () => {
      const nodes = [
        {
          id: 'cond_node',
          type: 'conditionNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Check Condition',
            category: 'logic',
            type: 'condition',
            properties: {
              logicalGate: 'OR',
              conditions: [
                { type: 'variable', leftValue: '{{flag}}', operator: 'equals', rightValue: 'yes' },
              ],
            },
          },
        },
        {
          id: 'true_target',
          type: 'defaultNode',
          position: { x: 100, y: 0 },
          data: {
            label: 'True Branch Executed',
            category: 'data',
            type: 'set_variable',
            properties: { name: 'branchTaken', value: 'TRUE_BRANCH' },
          },
        },
        {
          id: 'false_target',
          type: 'defaultNode',
          position: { x: 100, y: 100 },
          data: {
            label: 'False Branch Executed',
            category: 'data',
            type: 'set_variable',
            properties: { name: 'branchTaken', value: 'FALSE_BRANCH' },
          },
        },
      ];

      const edges = [
        { id: 'e1', source: 'cond_node', sourceHandle: 'true', target: 'true_target' },
        { id: 'e2', source: 'cond_node', sourceHandle: 'false', target: 'false_target' },
      ];

      const workflow: Workflow = {
        id: 'wf_branch',
        name: 'Branch Workflow',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: { flag: 'yes' },
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: nodes as any,
        edges,
      };

      const engine = new WorkflowEngine(workflow);
      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      expect(engine.getVariables().branchTaken).toBe('TRUE_BRANCH');
    });

    it('executes false branch when condition fails', async () => {
      const nodes = [
        {
          id: 'cond_node',
          type: 'conditionNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Check Condition',
            category: 'logic',
            type: 'condition',
            properties: {
              logicalGate: 'AND',
              conditions: [
                { type: 'variable', leftValue: '{{flag}}', operator: 'equals', rightValue: 'yes' },
              ],
            },
          },
        },
        {
          id: 'true_target',
          type: 'defaultNode',
          position: { x: 100, y: 0 },
          data: {
            label: 'True Branch',
            category: 'data',
            type: 'set_variable',
            properties: { name: 'branchTaken', value: 'TRUE_BRANCH' },
          },
        },
        {
          id: 'false_target',
          type: 'defaultNode',
          position: { x: 100, y: 100 },
          data: {
            label: 'False Branch',
            category: 'data',
            type: 'set_variable',
            properties: { name: 'branchTaken', value: 'FALSE_BRANCH' },
          },
        },
      ];

      const edges = [
        { id: 'e1', source: 'cond_node', sourceHandle: 'true', target: 'true_target' },
        { id: 'e2', source: 'cond_node', sourceHandle: 'false', target: 'false_target' },
      ];

      const workflow: Workflow = {
        id: 'wf_branch_false',
        name: 'Branch Workflow False',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: { flag: 'no' },
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: nodes as any,
        edges,
      };

      const engine = new WorkflowEngine(workflow);
      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      expect(engine.getVariables().branchTaken).toBe('FALSE_BRANCH');
    });
  });
});
