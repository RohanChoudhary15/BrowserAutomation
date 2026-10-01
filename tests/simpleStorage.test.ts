import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeStorageAction,
  syncStorageToVariables,
  globalWorkflowStore,
} from '../src/utils/simpleStorage';
import { executeSimpleStorage } from '../src/runtime/executors';
import { WorkflowNode } from '../src/types/workflow';
import { ExecutionContext } from '../src/types/execution';

describe('Simple Storage Utility & Executor', () => {
  beforeEach(() => {
    globalWorkflowStore.clear();
  });

  it('stores and retrieves an array entry', async () => {
    const setRes = await executeStorageAction({
      action: 'set',
      key: 'products',
      type: 'array',
      value: [{ id: 1, name: 'Item A' }],
      scope: 'workflow',
    });

    expect(setRes.success).toBe(true);
    expect(setRes.value).toEqual([{ id: 1, name: 'Item A' }]);

    const getRes = await executeStorageAction({
      action: 'get',
      key: 'products',
      scope: 'workflow',
    });

    expect(getRes.success).toBe(true);
    expect(getRes.value).toEqual([{ id: 1, name: 'Item A' }]);
  });

  it('appends items to an existing array entry', async () => {
    await executeStorageAction({
      action: 'set',
      key: 'items',
      type: 'array',
      value: ['first'],
      scope: 'workflow',
    });

    const appendRes = await executeStorageAction({
      action: 'append',
      key: 'items',
      type: 'array',
      value: ['second', 'third'],
      scope: 'workflow',
    });

    expect(appendRes.value).toEqual(['first', 'second', 'third']);
  });

  it('merges dictionaries with deep merge support', async () => {
    await executeStorageAction({
      action: 'set',
      key: 'userProfile',
      type: 'dictionary',
      value: { name: 'Alice', settings: { theme: 'dark', notifications: true } },
      scope: 'workflow',
    });

    const mergeRes = await executeStorageAction({
      action: 'merge',
      key: 'userProfile',
      type: 'dictionary',
      value: { role: 'Admin', settings: { notifications: false, sound: true } },
      deepMerge: true,
      scope: 'workflow',
    });

    expect(mergeRes.value).toEqual({
      name: 'Alice',
      role: 'Admin',
      settings: {
        theme: 'dark',
        notifications: false,
        sound: true,
      },
    });
  });

  it('stores documents and images', async () => {
    const docRes = await executeStorageAction({
      action: 'set',
      key: 'memo',
      type: 'document',
      value: { content: '# Executive Memo', format: 'markdown', title: 'Q3 Plan' },
      scope: 'workflow',
    });

    expect(docRes.success).toBe(true);
    expect(docRes.value.content).toBe('# Executive Memo');

    const imgRes = await executeStorageAction({
      action: 'set',
      key: 'screenshot',
      type: 'image',
      value: { url: 'https://example.com/shot.png', caption: 'Home Page' },
      scope: 'workflow',
    });

    expect(imgRes.success).toBe(true);
    expect(imgRes.value.url).toBe('https://example.com/shot.png');
  });

  it('deletes and clears entries', async () => {
    await executeStorageAction({ action: 'set', key: 'k1', value: 'val1', scope: 'workflow' });
    await executeStorageAction({ action: 'set', key: 'k2', value: 'val2', scope: 'workflow' });

    const delRes = await executeStorageAction({ action: 'delete', key: 'k1', scope: 'workflow' });
    expect(delRes.success).toBe(true);

    const listRes = await executeStorageAction({ action: 'list', scope: 'workflow' });
    expect(listRes.keys).toEqual(['k2']);

    await executeStorageAction({ action: 'clear', scope: 'workflow' });
    const emptyList = await executeStorageAction({ action: 'list', scope: 'workflow' });
    expect(emptyList.keys).toEqual([]);
  });

  it('synchronizes storage entries to execution context variables for cross-node access', () => {
    globalWorkflowStore.set('sharedData', {
      key: 'sharedData',
      type: 'array',
      value: [1, 2, 3],
      timestamp: Date.now(),
    });

    const vars: Record<string, any> = {};
    syncStorageToVariables(vars);

    // Direct access
    expect(vars.sharedData).toEqual([1, 2, 3]);
    // Prefixed access
    expect(vars['storage.sharedData']).toEqual([1, 2, 3]);
    expect(vars.storage.sharedData).toEqual([1, 2, 3]);
  });

  it('executes simple_storage node via executeSimpleStorage executor', async () => {
    const node: WorkflowNode = {
      id: 'storage_node_1',
      type: 'simple_storage',
      position: { x: 0, y: 0 },
      data: {
        label: 'Save Cart Items',
        type: 'simple_storage',
        properties: {
          action: 'set',
          key: 'cartItems',
          entryType: 'array',
          value: '{{currentItems}}',
          scope: 'workflow',
          outputVariable: 'storageOut',
        },
      },
    };

    const ctx: ExecutionContext = {
      workflowId: 'test_wf',
      executionId: 'exec_test',
      variables: { currentItems: ['Keyboard', 'Mouse'] },
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const res = await executeSimpleStorage(node, ctx);

    expect(res.success).toBe(true);
    expect(ctx.variables.storageOut).toEqual(['Keyboard', 'Mouse']);
    expect(ctx.variables.cartItems).toEqual(['Keyboard', 'Mouse']);
    expect(ctx.variables['storage.cartItems']).toEqual(['Keyboard', 'Mouse']);
  });

  it('correctly parses single-quoted array literal string like [\'a\',\'b\',\'c\']', async () => {
    const node: WorkflowNode = {
      id: 'storage_node_single_quotes',
      type: 'simple_storage',
      position: { x: 0, y: 0 },
      data: {
        label: 'Save Letters',
        type: 'simple_storage',
        properties: {
          action: 'set',
          key: 'letters',
          entryType: 'array',
          value: "['a','b','c']",
          outputVariable: 'lettersResult',
        },
      },
    };

    const ctx: ExecutionContext = {
      workflowId: 'test_wf',
      executionId: 'exec_test',
      variables: {},
      log: vi.fn(),
      updateNodeState: vi.fn(),
    };

    const res = await executeSimpleStorage(node, ctx);

    expect(res.success).toBe(true);
    expect(ctx.variables.letters).toEqual(['a', 'b', 'c']);
    expect(ctx.variables.lettersResult).toEqual(['a', 'b', 'c']);
  });
});
