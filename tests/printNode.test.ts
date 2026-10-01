import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePrint, executeArrayOperation, executeSimpleStorage } from '../src/runtime/executors';
import { WorkflowNode } from '../src/types/workflow';
import { ExecutionContext } from '../src/types/execution';
import { globalWorkflowStore } from '../src/utils/simpleStorage';

describe('Print Node & Console Logging for Data Operations', () => {
  beforeEach(() => {
    globalWorkflowStore.clear();
    vi.restoreAllMocks();
  });

  it('prints array variables and formats them properly', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const node: WorkflowNode = {
      id: 'print_node_1',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Print Items',
        type: 'print',
        properties: {
          message: '{{items}}',
          format: 'auto',
          level: 'log',
          toConsole: true,
          outputVariable: 'printedOut',
        },
      },
    };

    const items = ['apple', 'banana', 'cherry'];
    const ctx: ExecutionContext = {
      workflowId: 'test_wf',
      executionId: 'exec_test',
      variables: { items },
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const res = await executePrint(node, ctx);

    expect(res.success).toBe(true);
    expect(ctx.variables.printedOut).toEqual(items);
    expect(ctx.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('[Print]'),
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AutoFlow Print]'),
      expect.any(String),
      items
    );
  });

  it('prints objects with console.table when table format is requested', async () => {
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
    const node: WorkflowNode = {
      id: 'print_table_node',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Print Users Table',
        type: 'print',
        properties: {
          message: '{{users}}',
          format: 'table',
          toConsole: true,
        },
      },
    };

    const users = [
      { id: 1, name: 'Alice', role: 'admin' },
      { id: 2, name: 'Bob', role: 'user' },
    ];
    const ctx: ExecutionContext = {
      workflowId: 'test_wf',
      executionId: 'exec_test',
      variables: { users },
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const res = await executePrint(node, ctx);

    expect(res.success).toBe(true);
    expect(tableSpy).toHaveBeenCalledWith(users);
  });

  it('prints string interpolation message', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const node: WorkflowNode = {
      id: 'print_msg_node',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Print Status',
        type: 'print',
        properties: {
          message: 'Found {{count}} records in total',
          format: 'text',
          level: 'warn',
          toConsole: true,
        },
      },
    };

    const ctx: ExecutionContext = {
      workflowId: 'test_wf',
      executionId: 'exec_test',
      variables: { count: 42 },
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const res = await executePrint(node, ctx);

    expect(res.success).toBe(true);
    expect(ctx.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Found 42 records in total'),
        level: 'warn',
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AutoFlow Print]'),
      expect.any(String),
      'Found 42 records in total'
    );
  });

  it('prints resultant array to console during array_operation', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const node: WorkflowNode = {
      id: 'arr_op_node',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Slice Items',
        type: 'array_operation',
        properties: {
          operation: 'slice',
          array: '{{items}}',
          sliceStart: 0,
          sliceEnd: 2,
          outputVariable: 'slicedItems',
        },
      },
    };

    const items = ['a', 'b', 'c', 'd'];
    const ctx: ExecutionContext = {
      workflowId: 'test_wf',
      executionId: 'exec_test',
      variables: { items },
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const res = await executeArrayOperation(node, ctx);

    expect(res.success).toBe(true);
    expect(ctx.variables.slicedItems).toEqual(['a', 'b']);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AutoFlow Array Operation]'),
      expect.any(String),
      ['a', 'b']
    );
  });

  it('prints stored value to console during simple_storage execution', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const node: WorkflowNode = {
      id: 'storage_print_node',
      type: 'simple_storage',
      position: { x: 0, y: 0 },
      data: {
        label: 'Store Results',
        type: 'simple_storage',
        properties: {
          action: 'set',
          key: 'results',
          entryType: 'array',
          value: '{{data}}',
          outputVariable: 'out',
        },
      },
    };

    const ctx: ExecutionContext = {
      workflowId: 'test_wf',
      executionId: 'exec_test',
      variables: { data: [100, 200, 300] },
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const res = await executeSimpleStorage(node, ctx);

    expect(res.success).toBe(true);
    expect(ctx.variables.results).toEqual([100, 200, 300]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AutoFlow Simple Storage]'),
      expect.any(String),
      [100, 200, 300]
    );
  });
});
