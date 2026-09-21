import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeLogicGate, executeCondition } from '../src/runtime/executors';
import { WorkflowEngine } from '../src/runtime/engine';
import { ExecutionContext } from '../src/types/execution';
import { Workflow } from '../src/types/workflow';

function makeCtx(variables: Record<string, any> = {}, gateInputs?: Record<string, any[]>): ExecutionContext {
  return {
    workflowId: 'wf_logic_gate',
    executionId: 'exec_logic_gate',
    variables,
    signal: new AbortController().signal,
    log: vi.fn(),
    updateNodeState: vi.fn(),
    _gateInputs: gateInputs,
  };
}

describe('Logic Gate Nodes (AND, OR, NAND, NOR) & Branch Combining', () => {
  beforeEach(() => {
    delete (globalThis as any).chrome;
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  describe('Clean Condition Node Executor (executeCondition)', () => {
    it('evaluates single condition correctly and returns true branch', async () => {
      const ctx = makeCtx({ status: 'completed' });
      const node = {
        id: 'cond_1',
        data: {
          label: 'Check Status',
          category: 'logic',
          type: 'condition',
          properties: {
            leftValue: '{{status}}',
            operator: 'equals',
            rightValue: 'completed',
            outputVariable: 'isComplete',
          },
        },
      } as any;

      const result = await executeCondition(node, ctx);
      expect(result.success).toBe(true);
      expect(result.output.result).toBe(true);
      expect(result.nextBranch).toBe('true');
      expect(ctx.variables.isComplete).toBe(true);
    });

    it('evaluates false condition and returns false branch', async () => {
      const ctx = makeCtx({ count: 5 });
      const node = {
        id: 'cond_2',
        data: {
          label: 'Check Count',
          category: 'logic',
          type: 'condition',
          properties: {
            leftValue: '{{count}}',
            operator: 'greater_than',
            rightValue: 10,
          },
        },
      } as any;

      const result = await executeCondition(node, ctx);
      expect(result.success).toBe(true);
      expect(result.output.result).toBe(false);
      expect(result.nextBranch).toBe('false');
      expect(ctx.variables.conditionResult).toBe(false);
    });
  });

  describe('executeLogicGate Unit Tests', () => {
    it('AND Gate: evaluates true only when all incoming branches are true', async () => {
      const node = {
        id: 'gate_and',
        data: {
          label: 'AND Merge',
          category: 'logic',
          type: 'and',
          properties: { gate: 'AND', outputVariable: 'andOut' },
        },
      } as any;

      // Case 1: Both true
      const ctxAllTrue = makeCtx({}, {
        gate_and: [
          { id: 'branch_1', result: true },
          { id: 'branch_2', result: true },
        ],
      });
      const res1 = await executeLogicGate(node, ctxAllTrue);
      expect(res1.output.result).toBe(true);
      expect(ctxAllTrue.variables.andOut).toBe(true);
      expect(res1.nextBranch).toBe('output');

      // Case 2: One true, one false
      const ctxOneFalse = makeCtx({}, {
        gate_and: [
          { id: 'branch_1', result: true },
          { id: 'branch_2', result: false },
        ],
      });
      const res2 = await executeLogicGate(node, ctxOneFalse);
      expect(res2.output.result).toBe(false);
      expect(ctxOneFalse.variables.andOut).toBe(false);
    });

    it('OR Gate: evaluates true if at least one branch is true', async () => {
      const node = {
        id: 'gate_or',
        data: {
          label: 'OR Merge',
          category: 'logic',
          type: 'or',
          properties: { gate: 'OR', outputVariable: 'orOut' },
        },
      } as any;

      // Case 1: One true
      const ctxOneTrue = makeCtx({}, {
        gate_or: [
          { id: 'branch_1', result: false },
          { id: 'branch_2', result: true },
        ],
      });
      const res1 = await executeLogicGate(node, ctxOneTrue);
      expect(res1.output.result).toBe(true);
      expect(ctxOneTrue.variables.orOut).toBe(true);

      // Case 2: Both false
      const ctxAllFalse = makeCtx({}, {
        gate_or: [
          { id: 'branch_1', result: false },
          { id: 'branch_2', result: false },
        ],
      });
      const res2 = await executeLogicGate(node, ctxAllFalse);
      expect(res2.output.result).toBe(false);
      expect(ctxAllFalse.variables.orOut).toBe(false);
    });

    it('NAND Gate: evaluates true unless all incoming branches are true', async () => {
      const node = {
        id: 'gate_nand',
        data: {
          label: 'NAND Merge',
          category: 'logic',
          type: 'nand',
          properties: { gate: 'NAND', outputVariable: 'nandOut' },
        },
      } as any;

      // Case 1: Both true -> NAND returns false
      const ctxAllTrue = makeCtx({}, {
        gate_nand: [
          { id: 'b1', result: true },
          { id: 'b2', result: true },
        ],
      });
      const res1 = await executeLogicGate(node, ctxAllTrue);
      expect(res1.output.result).toBe(false);

      // Case 2: One false -> NAND returns true
      const ctxOneFalse = makeCtx({}, {
        gate_nand: [
          { id: 'b1', result: true },
          { id: 'b2', result: false },
        ],
      });
      const res2 = await executeLogicGate(node, ctxOneFalse);
      expect(res2.output.result).toBe(true);
    });

    it('NOR Gate: evaluates true only if all incoming branches are false', async () => {
      const node = {
        id: 'gate_nor',
        data: {
          label: 'NOR Merge',
          category: 'logic',
          type: 'nor',
          properties: { gate: 'NOR', outputVariable: 'norOut' },
        },
      } as any;

      // Case 1: All false -> NOR returns true
      const ctxAllFalse = makeCtx({}, {
        gate_nor: [
          { id: 'b1', result: false },
          { id: 'b2', result: false },
        ],
      });
      const res1 = await executeLogicGate(node, ctxAllFalse);
      expect(res1.output.result).toBe(true);

      // Case 2: One true -> NOR returns false
      const ctxOneTrue = makeCtx({}, {
        gate_nor: [
          { id: 'b1', result: true },
          { id: 'b2', result: false },
        ],
      });
      const res2 = await executeLogicGate(node, ctxOneTrue);
      expect(res2.output.result).toBe(false);
    });
  });

  describe('WorkflowEngine: Combining Multiple Branches into One Output', () => {
    it('Combines 2 parallel branches with an AND gate into 1 output branch', async () => {
      const executionOrder: string[] = [];

      const wf: Workflow = {
        id: 'wf_merge_and',
        name: 'Merge 2 Branches with AND',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'node_branch_1',
            type: 'defaultNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Step 1 (Branch A)',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'varA', value: 10 },
            },
          },
          {
            id: 'node_branch_2',
            type: 'defaultNode',
            position: { x: 200, y: 0 },
            data: {
              label: 'Step 2 (Branch B)',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'varB', value: 20 },
            },
          },
          {
            id: 'gate_and_node',
            type: 'logicGateNode',
            position: { x: 100, y: 150 },
            data: {
              label: 'AND Gate',
              category: 'logic',
              type: 'and',
              properties: { gate: 'AND', outputVariable: 'andResult' },
            },
          },
          {
            id: 'combined_target_node',
            type: 'defaultNode',
            position: { x: 100, y: 300 },
            data: {
              label: 'Combined Continuation',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'combinedExecuted', value: true },
            },
          },
        ],
        edges: [
          // Branch 1 and Branch 2 both connect to the AND gate input
          { id: 'e1', source: 'node_branch_1', target: 'gate_and_node' },
          { id: 'e2', source: 'node_branch_2', target: 'gate_and_node' },
          // The AND gate emits 1 combined output branch to downstream
          { id: 'e3', source: 'gate_and_node', sourceHandle: 'output', target: 'combined_target_node' },
        ],
      };

      const engine = new WorkflowEngine(wf, {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') {
            executionOrder.push(id);
          }
        },
      });

      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      expect(engine.getVariables().varA).toBe(10);
      expect(engine.getVariables().varB).toBe(20);
      expect(engine.getVariables().andResult).toBe(true);
      expect(engine.getVariables().combinedExecuted).toBe(true);

      // Verify that combined_target_node only executed ONCE
      const targetExecCount = executionOrder.filter((id) => id === 'combined_target_node').length;
      expect(targetExecCount).toBe(1);

      // Verify execution reached gate after branches
      expect(executionOrder).toContain('node_branch_1');
      expect(executionOrder).toContain('node_branch_2');
      expect(executionOrder).toContain('gate_and_node');
      expect(executionOrder).toContain('combined_target_node');
    });

    it('Short-circuits with an OR gate when one branch succeeds before a slower branch', async () => {
      const executed: string[] = [];

      const wf: Workflow = {
        id: 'wf_merge_or',
        name: 'Merge 2 Branches with OR',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'fast_branch',
            type: 'defaultNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Fast Condition (immediate)',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'fastFinished', value: true },
            },
          },
          {
            id: 'slow_branch',
            type: 'defaultNode',
            position: { x: 200, y: 0 },
            data: {
              label: 'Slow Delay Branch',
              category: 'logic',
              type: 'wait',
              properties: { duration: 800 },
            },
          },
          {
            id: 'gate_or_node',
            type: 'logicGateNode',
            position: { x: 100, y: 150 },
            data: {
              label: 'OR Gate',
              category: 'logic',
              type: 'or',
              properties: { gate: 'OR', outputVariable: 'orResult' },
            },
          },
          {
            id: 'target_after_or',
            type: 'defaultNode',
            position: { x: 100, y: 300 },
            data: {
              label: 'Post-OR Action',
              category: 'data',
              type: 'set_variable',
              properties: { name: 'postOrReached', value: true },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'fast_branch', target: 'gate_or_node' },
          { id: 'e2', source: 'slow_branch', target: 'gate_or_node' },
          { id: 'e3', source: 'gate_or_node', sourceHandle: 'output', target: 'target_after_or' },
        ],
      };

      const startTime = Date.now();
      const engine = new WorkflowEngine(wf, {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') {
            executed.push(id);
          }
        },
      });

      await engine.run();
      const elapsed = Date.now() - startTime;

      expect(engine.getVariables().fastFinished).toBe(true);
      expect(engine.getVariables().orResult).toBe(true);
      expect(engine.getVariables().postOrReached).toBe(true);

      // Downstream target was reached and executed exactly once
      const targetCount = executed.filter((id) => id === 'target_after_or').length;
      expect(targetCount).toBe(1);
    });

    it('Chains multiple logic gates: (Branch 1 + Branch 2 -> AND) + Branch 3 -> OR -> 1 Combined Output', async () => {
      const executed: string[] = [];

      const wf: Workflow = {
        id: 'wf_chain_gates',
        name: 'Chained Gates Workflow',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: [
          // Inputs to AND Gate
          {
            id: 'n1',
            type: 'defaultNode',
            position: { x: 0, y: 0 },
            data: { label: 'Node 1', category: 'data', type: 'set_variable', properties: { name: 'n1Done', value: true } },
          },
          {
            id: 'n2',
            type: 'defaultNode',
            position: { x: 100, y: 0 },
            data: { label: 'Node 2', category: 'data', type: 'set_variable', properties: { name: 'n2Done', value: true } },
          },
          {
            id: 'gate_and',
            type: 'logicGateNode',
            position: { x: 50, y: 100 },
            data: { label: 'AND Gate 1', category: 'logic', type: 'and', properties: { gate: 'AND', outputVariable: 'and1' } },
          },
          // Third parallel branch
          {
            id: 'n3',
            type: 'defaultNode',
            position: { x: 250, y: 50 },
            data: { label: 'Node 3', category: 'data', type: 'set_variable', properties: { name: 'n3Done', value: true } },
          },
          // OR gate combining AND Gate 1 output + Node 3
          {
            id: 'gate_or',
            type: 'logicGateNode',
            position: { x: 150, y: 220 },
            data: { label: 'OR Gate 2', category: 'logic', type: 'or', properties: { gate: 'OR', outputVariable: 'or2' } },
          },
          // Final node receiving the single output of OR Gate 2
          {
            id: 'final_node',
            type: 'defaultNode',
            position: { x: 150, y: 340 },
            data: { label: 'Final Action', category: 'data', type: 'set_variable', properties: { name: 'allChainsComplete', value: true } },
          },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'gate_and' },
          { id: 'e2', source: 'n2', target: 'gate_and' },
          { id: 'e3', source: 'gate_and', sourceHandle: 'output', target: 'gate_or' },
          { id: 'e4', source: 'n3', target: 'gate_or' },
          { id: 'e5', source: 'gate_or', sourceHandle: 'output', target: 'final_node' },
        ],
      };

      const engine = new WorkflowEngine(wf, {
        onNodeStateChange: (id, state) => {
          if (state.status === 'success') {
            executed.push(id);
          }
        },
      });

      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      expect(engine.getVariables().n1Done).toBe(true);
      expect(engine.getVariables().n2Done).toBe(true);
      expect(engine.getVariables().and1).toBe(true);
      expect(engine.getVariables().or2).toBe(true);
      expect(engine.getVariables().allChainsComplete).toBe(true);

      const finalCount = executed.filter((id) => id === 'final_node').length;
      expect(finalCount).toBe(1);
    });

    it('Combines branches with NAND gate (inverting AND result)', async () => {
      const wf: Workflow = {
        id: 'wf_nand_test',
        name: 'NAND Workflow',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'nand_in_1',
            type: 'defaultNode',
            position: { x: 0, y: 0 },
            data: { label: 'Input 1', category: 'data', type: 'set_variable', properties: { name: 'var1', value: 'yes' } },
          },
          {
            id: 'nand_in_2',
            type: 'defaultNode',
            position: { x: 100, y: 0 },
            data: { label: 'Input 2', category: 'data', type: 'set_variable', properties: { name: 'var2', value: 'yes' } },
          },
          {
            id: 'gate_nand',
            type: 'logicGateNode',
            position: { x: 50, y: 100 },
            data: { label: 'NAND Gate', category: 'logic', type: 'nand', properties: { gate: 'NAND', outputVariable: 'nandOut' } },
          },
          {
            id: 'nand_target',
            type: 'defaultNode',
            position: { x: 50, y: 200 },
            data: { label: 'Target', category: 'data', type: 'set_variable', properties: { name: 'targetReached', value: true } },
          },
        ],
        edges: [
          { id: 'e1', source: 'nand_in_1', target: 'gate_nand' },
          { id: 'e2', source: 'nand_in_2', target: 'gate_nand' },
          { id: 'e3', source: 'gate_nand', sourceHandle: 'output', target: 'nand_target' },
        ],
      };

      const engine = new WorkflowEngine(wf);
      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      // Both inputs were true, so NAND outputs false
      expect(engine.getVariables().nandOut).toBe(false);
      expect(engine.getVariables().targetReached).toBe(true);
    });

    it('Combines branches with NOR gate (inverting OR result)', async () => {
      const wf: Workflow = {
        id: 'wf_nor_test',
        name: 'NOR Workflow',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: [
          {
            id: 'nor_in_1',
            type: 'defaultNode',
            position: { x: 0, y: 0 },
            data: { label: 'Input 1', category: 'data', type: 'set_variable', properties: { name: 'var1', value: 'no' } },
          },
          {
            id: 'nor_in_2',
            type: 'defaultNode',
            position: { x: 100, y: 0 },
            data: { label: 'Input 2', category: 'data', type: 'set_variable', properties: { name: 'var2', value: 'no' } },
          },
          {
            id: 'gate_nor',
            type: 'logicGateNode',
            position: { x: 50, y: 100 },
            data: { label: 'NOR Gate', category: 'logic', type: 'nor', properties: { gate: 'NOR', outputVariable: 'norOut' } },
          },
          {
            id: 'nor_target',
            type: 'defaultNode',
            position: { x: 50, y: 200 },
            data: { label: 'Target', category: 'data', type: 'set_variable', properties: { name: 'targetReached', value: true } },
          },
        ],
        edges: [
          { id: 'e1', source: 'nor_in_1', target: 'gate_nor' },
          { id: 'e2', source: 'nor_in_2', target: 'gate_nor' },
          { id: 'e3', source: 'gate_nor', sourceHandle: 'output', target: 'nor_target' },
        ],
      };

      const engine = new WorkflowEngine(wf);
      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      // Both inputs set_variable succeed (truthy), so NOR outputs false
      expect(engine.getVariables().norOut).toBe(false);
      expect(engine.getVariables().targetReached).toBe(true);
    });
  });
});
