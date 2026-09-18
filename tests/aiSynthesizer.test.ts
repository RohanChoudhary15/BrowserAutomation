import { describe, it, expect } from 'vitest';
import { synthesizeWithSemanticParser } from '../src/ai/workflowSynthesizer';
import { WorkflowNode } from '../src/types/workflow';

describe('AI Workflow Synthesizer', () => {
  it('synthesizes linear workflow from prompt', () => {
    const result = synthesizeWithSemanticParser({
      prompt: 'Navigate to https://github.com, wait for element #search, type react into search, click submit button, and take a screenshot',
      mode: 'replace',
    });

    expect(result.nodes.length).toBeGreaterThanOrEqual(4);
    expect(result.edges.length).toBe(result.nodes.length - 1);

    const nodeTypes = result.nodes.map(n => n.data.type);
    expect(nodeTypes).toContain('navigate');
    expect(nodeTypes).toContain('wait_for_element');
    expect(nodeTypes).toContain('type_text');
    expect(nodeTypes).toContain('click');
    expect(nodeTypes).toContain('screenshot');

    const navNode = result.nodes.find(n => n.data.type === 'navigate');
    expect(navNode?.data.properties.url).toBe('https://github.com');
  });

  it('synthesizes branching condition workflows', () => {
    const result = synthesizeWithSemanticParser({
      prompt: 'Go to https://news.ycombinator.com, extract text from .titleline, if extracted text contains AI, take screenshot and send webhook',
      mode: 'replace',
    });

    const nodeTypes = result.nodes.map(n => n.data.type);
    expect(nodeTypes).toContain('navigate');
    expect(nodeTypes).toContain('extract_text');
    expect(nodeTypes).toContain('condition');
    expect(nodeTypes).toContain('screenshot');

    // Verify condition node has 'true' branch edge
    const conditionEdge = result.edges.find(e => e.sourceHandle === 'true');
    expect(conditionEdge).toBeDefined();
    expect(conditionEdge?.label).toBe('TRUE');
  });

  it('synthesizes append mode to existing selected node', () => {
    const existingNodes: WorkflowNode[] = [
      {
        id: 'node_start',
        type: 'customNode',
        position: { x: 250, y: 100 },
        data: { label: 'Start Nav', category: 'browser', type: 'navigate', properties: { url: 'https://test.com' } },
      },
    ];

    const result = synthesizeWithSemanticParser({
      prompt: 'Wait 3s and click button#confirm',
      mode: 'append',
      selectedNodeId: 'node_start',
      currentNodes: existingNodes,
    });

    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    // Nodes should be positioned vertically below selected node
    expect(result.nodes[0].position.y).toBeGreaterThan(100);
  });
});
