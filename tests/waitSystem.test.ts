import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveAppropriateWaitDuration,
  convertAgentStepsToWorkflow,
} from '../src/ai/browserAgent';
import { waitForSmartSettle } from '../src/content/domActions';
import { executeWait } from '../src/runtime/executors';
import { AgentStep } from '../src/ai/types';
import { ExecutionContext } from '../src/types/workflow';

describe('Intelligent Wait System', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('resolveAppropriateWaitDuration', () => {
    it('infers ~3500ms for search and query operations', () => {
      const duration = resolveAppropriateWaitDuration(
        { type: 'wait' },
        'Submitting search query and waiting for results to populate'
      );
      expect(duration).toBe(3500);
    });

    it('infers ~5000ms for page navigation, redirects, and login', () => {
      const duration = resolveAppropriateWaitDuration(
        { type: 'wait' },
        'Clicked login, waiting for redirect to dashboard'
      );
      expect(duration).toBe(5000);
    });

    it('infers ~8000ms for heavy downloads, exports, and AI processing', () => {
      const duration = resolveAppropriateWaitDuration(
        { type: 'wait' },
        'Waiting for AI report generation and file export'
      );
      expect(duration).toBe(8000);
    });

    it('infers ~1500ms for quick modal or animation transitions', () => {
      const duration = resolveAppropriateWaitDuration(
        { type: 'wait' },
        'Opening dropdown menu animation'
      );
      expect(duration).toBe(1500);
    });

    it('honors explicit durationMs when >= 2000ms', () => {
      const duration = resolveAppropriateWaitDuration(
        { type: 'wait', durationMs: 4500 },
        'Some generic wait'
      );
      expect(duration).toBe(4500);
    });

    it('applies exponential backoff for consecutive wait steps', () => {
      const firstWait = resolveAppropriateWaitDuration(
        { type: 'wait' },
        'Still waiting for search results',
        1
      );
      const secondWait = resolveAppropriateWaitDuration(
        { type: 'wait' },
        'Still waiting for search results',
        2
      );
      const thirdWait = resolveAppropriateWaitDuration(
        { type: 'wait' },
        'Still waiting for search results',
        3
      );

      expect(firstWait).toBe(3500);
      expect(secondWait).toBeGreaterThan(firstWait);
      expect(thirdWait).toBeGreaterThan(secondWait);
    });

    it('sets longer ceiling timeout for conditional waits', () => {
      const duration = resolveAppropriateWaitDuration(
        { type: 'wait', waitForSelector: '.results-table' },
        'Waiting for results'
      );
      expect(duration).toBeGreaterThanOrEqual(6000);
    });
  });

  describe('waitForSmartSettle in content script', () => {
    it('resolves early when waitForSelector element appears', async () => {
      setTimeout(() => {
        const el = document.createElement('div');
        el.id = 'loaded-element';
        el.textContent = 'Data ready';
        document.body.appendChild(el);
      }, 50);

      const res = await waitForSmartSettle({
        waitForSelector: '#loaded-element',
        timeout: 2000,
      });

      expect(res.success).toBe(true);
      expect(res.reason).toBe('selector_appeared');
      expect(res.waitedMs).toBeLessThan(1500);
    });

    it('resolves early when waitForText appears', async () => {
      setTimeout(() => {
        const el = document.createElement('p');
        el.textContent = 'Welcome to AutoFlow Dashboard';
        document.body.appendChild(el);
      }, 50);

      const res = await waitForSmartSettle({
        waitForText: 'Welcome to AutoFlow Dashboard',
        timeout: 2000,
      });

      expect(res.success).toBe(true);
      expect(res.reason).toBe('text_appeared');
    });

    it('waits for active spinner to disappear before resolving', async () => {
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      spinner.style.display = 'block';
      spinner.style.width = '20px';
      document.body.appendChild(spinner);

      setTimeout(() => {
        spinner.remove();
      }, 100);

      const res = await waitForSmartSettle({ timeout: 1500 });
      expect(res.success).toBe(true);
      expect(document.querySelector('.spinner')).toBeNull();
    });
  });

  describe('convertAgentStepsToWorkflow wait integration', () => {
    it('maps conditional wait steps to wait_for_element and wait_for_text nodes', () => {
      const steps: AgentStep[] = [
        {
          stepNumber: 1,
          timestamp: Date.now(),
          thought: 'Waiting for search results table',
          action: {
            type: 'wait',
            waitForSelector: '.results-table',
            durationMs: 6000,
          },
          success: true,
        },
        {
          stepNumber: 2,
          timestamp: Date.now() + 1000,
          thought: 'Waiting for confirmation text',
          action: {
            type: 'wait',
            waitForText: 'Success!',
            durationMs: 5000,
          },
          success: true,
        },
      ];

      const { nodes } = convertAgentStepsToWorkflow(steps, 'Test Conditional Waits');
      expect(nodes.length).toBe(2);

      expect(nodes[0].data.type).toBe('wait_for_element');
      expect(nodes[0].data.properties.selector).toBe('.results-table');
      expect(nodes[0].data.properties.timeout).toBe(6000);

      expect(nodes[1].data.type).toBe('wait_for_text');
      expect(nodes[1].data.properties.text).toBe('Success!');
      expect(nodes[1].data.properties.timeout).toBe(5000);
    });

    it('intelligently merges consecutive pure wait steps into a single node with combined duration', () => {
      const steps: AgentStep[] = [
        {
          stepNumber: 1,
          timestamp: Date.now(),
          thought: 'Waiting 3s for API',
          action: { type: 'wait', durationMs: 3000 },
          success: true,
        },
        {
          stepNumber: 2,
          timestamp: Date.now() + 3000,
          thought: 'Still processing, waiting another 2s',
          action: { type: 'wait', durationMs: 2000 },
          success: true,
        },
      ];

      const { nodes } = convertAgentStepsToWorkflow(steps, 'Test Merged Waits');
      // Consecutive wait steps should be merged into 1 single node with 5000ms duration
      expect(nodes.length).toBe(1);
      expect(nodes[0].data.type).toBe('wait');
      expect(nodes[0].data.properties.duration).toBe(5000);
      expect(nodes[0].data.label).toBe('Wait 5.0s');
    });
  });

  describe('executeWait in runtime executor', () => {
    it('supports durationMs property from workflow nodes', async () => {
      const ctx: ExecutionContext = {
        workflowId: 'wf_1',
        executionId: 'exec_1',
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        signal: new AbortController().signal,
        log: vi.fn(),
        updateNodeState: vi.fn(),
      };

      const waitNode: any = {
        id: 'wait_node_1',
        data: {
          properties: {
            durationMs: 50, // fast test duration
          },
        },
      };

      const startTime = Date.now();
      const res = await executeWait(waitNode, ctx);
      expect(res.success).toBe(true);
      expect(Date.now() - startTime).toBeGreaterThanOrEqual(40);
    });
  });
});
