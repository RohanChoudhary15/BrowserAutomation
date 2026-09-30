import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine } from '../src/runtime/engine';
import {
  executeGetPageInfo,
  executeGetUrlDetails,
  executeDateTime,
  executeCookieManager,
  executeArrayOperation,
  executeStringTemplate,
  executeJsonQuery,
  executeSwitchCase,
  executeWhileLoop,
  executeRetryBlock,
  executeRateLimiter,
  executeManualApproval,
} from '../src/runtime/executors';
import { ExecutionContext } from '../src/types/execution';
import { Workflow, WorkflowNode } from '../src/types/workflow';

function createMockContext(initialVars: Record<string, any> = {}): ExecutionContext {
  const controller = new AbortController();
  return {
    workflowId: 'test_wf',
    executionId: 'exec_test',
    currentUrl: 'https://example.com/products/item-123?page=2&sort=desc#specifications',
    variables: { ...initialVars },
    signal: controller.signal,
    log: vi.fn(),
    updateNodeState: vi.fn(),
    _pauseTrigger: vi.fn(),
  };
}

describe('Context & System Data Nodes', () => {
  it('executeGetPageInfo: captures page info and auto-unpacks variables', async () => {
    const ctx = createMockContext();
    const node: WorkflowNode = {
      id: 'node_page_info',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Get Page Info',
        type: 'get_page_info',
        category: 'data',
        properties: {
          outputVariable: 'myPage',
          unpackVariables: true,
        },
      },
    };

    const result = await executeGetPageInfo(node, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output.url).toBe('https://example.com/products/item-123?page=2&sort=desc#specifications');
    expect(result.output.domain).toBe('example.com');
    expect(ctx.variables.myPage).toBeDefined();
    expect(ctx.variables.currentUrl).toBe(result.output.url);
    expect(ctx.variables.currentDomain).toBe('example.com');
  });

  it('executeGetUrlDetails: parses complex URL components and query parameters', async () => {
    const ctx = createMockContext();
    const node: WorkflowNode = {
      id: 'node_url_details',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'URL Details',
        type: 'get_url_details',
        category: 'data',
        properties: {
          sourceUrl: 'https://shop.store.org:8080/catalog/electronics?category=laptops&inStock=true&brand=acme#reviews',
          targetParam: 'category',
          outputVariable: 'urlInfo',
        },
      },
    };

    const result = await executeGetUrlDetails(node, ctx);
    expect(result.success).toBe(true);
    expect(result.output.hostname).toBe('shop.store.org');
    expect(result.output.port).toBe('8080');
    expect(result.output.pathname).toBe('/catalog/electronics');
    expect(result.output.hash).toBe('#reviews');
    expect(result.output.searchParams.category).toBe('laptops');
    expect(result.output.searchParams.inStock).toBe('true');
    expect(result.output.category).toBe('laptops');
    expect(ctx.variables.urlInfo_category).toBe('laptops');
    expect(ctx.variables.category).toBe('laptops');
  });

  it('executeDateTime: supports current time, formatting, offsets, and diffs', async () => {
    const ctx = createMockContext();

    // 1. Current Time (ISO)
    const nowNode: WorkflowNode = {
      id: 'n1',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Date Time',
        type: 'date_time',
        category: 'data',
        properties: {
          mode: 'current_time',
          format: 'iso',
          outputVariable: 'isoNow',
        },
      },
    };
    const nowRes = await executeDateTime(nowNode, ctx);
    expect(nowRes.success).toBe(true);
    expect(typeof nowRes.output).toBe('string');
    expect(nowRes.output).toContain('T');

    // 2. Custom Format
    const customNode: WorkflowNode = {
      id: 'n2',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Date Time',
        type: 'date_time',
        category: 'data',
        properties: {
          mode: 'format_date',
          inputDate: '2026-09-25T15:30:45Z',
          format: 'custom',
          customFormat: 'YYYY/MM/DD',
          timeZone: 'UTC',
          outputVariable: 'customDate',
        },
      },
    };
    const customRes = await executeDateTime(customNode, ctx);
    expect(customRes.output).toBe('2026/09/25');

    // 3. Add / Subtract
    const offsetNode: WorkflowNode = {
      id: 'n3',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Date Time',
        type: 'date_time',
        category: 'data',
        properties: {
          mode: 'add_subtract',
          inputDate: '2026-09-25T00:00:00Z',
          amount: 5,
          unit: 'days',
          format: 'date_only',
          timeZone: 'UTC',
          outputVariable: 'futureDate',
        },
      },
    };
    const offsetRes = await executeDateTime(offsetNode, ctx);
    expect(offsetRes.output).toBe('2026-09-30');

    // 4. Date Diff
    const diffNode: WorkflowNode = {
      id: 'n4',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Date Time',
        type: 'date_time',
        category: 'data',
        properties: {
          mode: 'date_diff',
          inputDate: '2026-09-30T00:00:00Z',
          compareDate: '2026-09-25T00:00:00Z',
          outputVariable: 'diffResult',
        },
      },
    };
    const diffRes = await executeDateTime(diffNode, ctx);
    expect(diffRes.output.diffDays).toBe(5);
    expect(diffRes.output.diffHours).toBe(120);
  });

  it('executeCookieManager: handles get, getAll, set, and delete operations', async () => {
    const ctx = createMockContext();
    const node: WorkflowNode = {
      id: 'cookie_node',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Cookie Manager',
        type: 'cookie_manager',
        category: 'data',
        properties: {
          action: 'set',
          name: 'auth_token',
          value: 'xyz_12345',
          outputVariable: 'setResult',
        },
      },
    };

    const setRes = await executeCookieManager(node, ctx);
    expect(setRes.success).toBe(true);
    expect(ctx.variables.setResult).toBeDefined();

    // Get
    node.data.properties.action = 'get';
    node.data.properties.outputVariable = 'tokenVal';
    const getRes = await executeCookieManager(node, ctx);
    expect(getRes.success).toBe(true);
  });
});

describe('Array & String Nodes', () => {
  it('executeArrayOperation: supports deduplicate, filter, slice, sort, and join', async () => {
    const ctx = createMockContext({
      numbers: [4, 2, 8, 2, 4, 10, 1],
      products: [
        { id: 1, title: 'Laptop', price: 999 },
        { id: 2, title: '', price: null },
        { id: 3, title: 'Phone', price: 699 },
        { id: 1, title: 'Laptop Duplicate', price: 999 },
      ],
    });

    // Deduplicate
    const dedupNode: WorkflowNode = {
      id: 'n_dedup',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Array Op',
        type: 'array_operation',
        category: 'data',
        properties: {
          array: '{{numbers}}',
          operation: 'deduplicate',
          outputVariable: 'deduped',
        },
      },
    };
    await executeArrayOperation(dedupNode, ctx);
    expect(ctx.variables.deduped).toEqual([4, 2, 8, 10, 1]);

    // Sort ascending
    const sortNode: WorkflowNode = {
      id: 'n_sort',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Array Op',
        type: 'array_operation',
        category: 'data',
        properties: {
          array: '{{deduped}}',
          operation: 'sort',
          sortOrder: 'asc',
          outputVariable: 'sorted',
        },
      },
    };
    await executeArrayOperation(sortNode, ctx);
    expect(ctx.variables.sorted).toEqual([1, 2, 4, 8, 10]);

    // Filter by field
    const filterNode: WorkflowNode = {
      id: 'n_filter',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Array Op',
        type: 'array_operation',
        category: 'data',
        properties: {
          array: '{{products}}',
          operation: 'filter_by_field',
          field: 'title',
          filterOperator: 'not_empty',
          outputVariable: 'validProducts',
        },
      },
    };
    await executeArrayOperation(filterNode, ctx);
    expect(ctx.variables.validProducts.length).toBe(3);

    // Deduplicate objects by field
    const dedupObjNode: WorkflowNode = {
      id: 'n_dedup_obj',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Array Op',
        type: 'array_operation',
        category: 'data',
        properties: {
          array: '{{validProducts}}',
          operation: 'deduplicate',
          field: 'id',
          outputVariable: 'uniqueProducts',
        },
      },
    };
    await executeArrayOperation(dedupObjNode, ctx);
    expect(ctx.variables.uniqueProducts.length).toBe(2);

    // Join
    const joinNode: WorkflowNode = {
      id: 'n_join',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Array Op',
        type: 'array_operation',
        category: 'data',
        properties: {
          array: '{{sorted}}',
          operation: 'join',
          delimiter: ' -> ',
          outputVariable: 'joinedStr',
        },
      },
    };
    await executeArrayOperation(joinNode, ctx);
    expect(ctx.variables.joinedStr).toBe('1 -> 2 -> 4 -> 8 -> 10');
  });

  it('executeStringTemplate: interpolates variables with casing and HTML escaping', async () => {
    const ctx = createMockContext({
      user: { name: 'alice smith', role: 'admin & moderator' },
      itemsCount: 15,
    });

    const node: WorkflowNode = {
      id: 'n_tpl',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'String Template',
        type: 'string_template',
        category: 'data',
        properties: {
          template: 'Hello {{user.name}}, you have {{itemsCount}} items! Role: {{user.role}}',
          casing: 'none',
          escapeHtml: true,
          outputVariable: 'resultTpl',
        },
      },
    };

    const res = await executeStringTemplate(node, ctx);
    expect(res.success).toBe(true);
    expect(ctx.variables.resultTpl).toContain('admin &amp; moderator');
    expect(ctx.variables.resultTpl).toContain('alice smith');

    // Title case test
    node.data.properties.casing = 'title_case';
    node.data.properties.escapeHtml = false;
    node.data.properties.template = 'welcome to autoflow automation';
    await executeStringTemplate(node, ctx);
    expect(ctx.variables.resultTpl).toBe('Welcome To Autoflow Automation');
  });

  it('executeJsonQuery: extracts nested paths, array elements, and wildcards', async () => {
    const ctx = createMockContext({
      apiPayload: {
        status: 200,
        data: {
          organization: { name: 'Acme Corp' },
          users: [
            { id: 101, name: 'Alice', active: true },
            { id: 102, name: 'Bob', active: false },
            { id: 103, name: 'Charlie', active: true },
          ],
        },
      },
    });

    // 1. Nested object property
    const node1: WorkflowNode = {
      id: 'q1',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'JSON Query',
        type: 'json_query',
        category: 'data',
        properties: {
          jsonInput: '{{apiPayload}}',
          queryPath: 'data.organization.name',
          outputVariable: 'orgName',
        },
      },
    };
    await executeJsonQuery(node1, ctx);
    expect(ctx.variables.orgName).toBe('Acme Corp');

    // 2. Specific array index
    const node2: WorkflowNode = {
      id: 'q2',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'JSON Query',
        type: 'json_query',
        category: 'data',
        properties: {
          jsonInput: '{{apiPayload}}',
          queryPath: 'data.users[1].name',
          outputVariable: 'secondUserName',
        },
      },
    };
    await executeJsonQuery(node2, ctx);
    expect(ctx.variables.secondUserName).toBe('Bob');

    // 3. Wildcard array projection
    const node3: WorkflowNode = {
      id: 'q3',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'JSON Query',
        type: 'json_query',
        category: 'data',
        properties: {
          jsonInput: '{{apiPayload}}',
          queryPath: 'data.users[*].id',
          outputVariable: 'allUserIds',
        },
      },
    };
    await executeJsonQuery(node3, ctx);
    expect(ctx.variables.allUserIds).toEqual([101, 102, 103]);
  });
});

describe('Control Logic Nodes (Flow, Resilience & Branching)', () => {
  it('executeSwitchCase: matches matching case branch and routes to default when unmatched', async () => {
    const ctx = createMockContext({ pageType: 'checkout' });

    const node: WorkflowNode = {
      id: 'switch_1',
      type: 'switchNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Switch Case',
        type: 'switch_case',
        category: 'logic',
        properties: {
          expression: '{{pageType}}',
          cases: [
            { id: 'case_0', value: 'login', label: 'Login' },
            { id: 'case_1', value: 'checkout', label: 'Checkout' },
            { id: 'case_2', value: 'dashboard', label: 'Dashboard' },
          ],
          outputVariable: 'matched',
        },
      },
    };

    const res1 = await executeSwitchCase(node, ctx);
    expect(res1.nextBranch).toBe('case_1');
    expect(res1.output.matchedValue).toBe('checkout');
    expect(ctx.variables.matched).toBe('checkout');

    // Test unmatched -> default
    ctx.variables.pageType = 'unknown_page';
    const res2 = await executeSwitchCase(node, ctx);
    expect(res2.nextBranch).toBe('default');
    expect(res2.output.matchedBranch).toBe('default');
  });

  it('executeRateLimiter: throttles execution and logs delay', async () => {
    const ctx = createMockContext();
    const node: WorkflowNode = {
      id: 'limiter_1',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Rate Limiter',
        type: 'rate_limiter',
        category: 'logic',
        properties: {
          mode: 'fixed_delay',
          fixedDelayMs: 15, // short for test
          outputVariable: 'delayPassed',
        },
      },
    };

    const start = Date.now();
    const res = await executeRateLimiter(node, ctx);
    const elapsed = Date.now() - start;
    expect(res.success).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(10);
    expect(ctx.variables.delayPassed).toBe(15);
  });

  it('executeRetryBlock: initializes retry block and outputs try branch', async () => {
    const ctx = createMockContext();
    const node: WorkflowNode = {
      id: 'retry_1',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Retry Block',
        type: 'retry_block',
        category: 'logic',
        properties: {
          maxRetries: 4,
          backoffMode: 'exponential',
          retryDelayMs: 2000,
          outputVariable: 'retryState',
        },
      },
    };

    const res = await executeRetryBlock(node, ctx);
    expect(res.success).toBe(true);
    expect(res.nextBranch).toBe('try');
    expect(ctx.variables.retryState.maxRetries).toBe(4);
  });

  it('executeManualApproval: pauses workflow and publishes awaitingUser state', async () => {
    const ctx = createMockContext();
    const node: WorkflowNode = {
      id: 'approval_1',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Manual Approval',
        type: 'manual_approval',
        category: 'logic',
        properties: {
          promptMessage: 'Please solve captcha in browser',
          inputType: 'confirm',
          outputVariable: 'approved',
        },
      },
    };

    const res = await executeManualApproval(node, ctx);
    expect(res.success).toBe(true);
    expect(ctx._pauseTrigger).toHaveBeenCalled();
    expect(ctx.updateNodeState).toHaveBeenCalledWith(
      'approval_1',
      expect.objectContaining({
        dynamicState: expect.objectContaining({
          awaitingUser: true,
          message: 'Awaiting human approval',
        }),
      })
    );
  });

  it('WorkflowEngine: executes while_loop until condition is false', async () => {
    // Construct workflow:
    // while_loop (condition: count < 3) -> math_calculate (increment count) -> loop_done (set_variable finished=true)
    const workflow: Workflow = {
      id: 'wf_while_loop',
      name: 'While Loop Test',
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: {
        timeout: 10000,
        retryCount: 0,
        retryDelay: 0,
        stopOnError: true,
        highlightElements: false,
      },
      variables: {
        count: 0,
        finished: false,
      },
      nodes: [
        {
          id: 'n_while',
          type: 'loopNode',
          position: { x: 100, y: 100 },
          data: {
            label: 'While Condition',
            type: 'while_loop',
            category: 'logic',
            properties: {
              leftValue: '{{count}}',
              operator: 'less_than',
              rightValue: '3',
              maxIterations: 10,
              delayBetweenMs: 0,
              outputVariable: 'whileIter',
            },
          },
        },
        {
          id: 'n_inc',
          type: 'customNode',
          position: { x: 100, y: 250 },
          data: {
            label: 'Increment',
            type: 'math_calculate',
            category: 'data',
            properties: {
              operation: 'increment',
              leftOperand: '{{count}}',
              outputVariable: 'count',
            },
          },
        },
        {
          id: 'n_done',
          type: 'customNode',
          position: { x: 300, y: 250 },
          data: {
            label: 'Finished',
            type: 'set_variable',
            category: 'data',
            properties: {
              name: 'finished',
              value: 'true',
            },
          },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'n_while',
          target: 'n_inc',
          sourceHandle: 'loop_body',
        },
        {
          id: 'e2',
          source: 'n_while',
          target: 'n_done',
          sourceHandle: 'loop_done',
        },
      ],
    };

    const engine = new WorkflowEngine(workflow);
    await engine.run();

    const vars = engine.getVariables();
    expect(vars.count).toBe(3);
    expect(vars.finished).toBe('true');
  });
});
