import { describe, it, expect } from 'vitest';
import { exportWorkflowJson, validateAndParseWorkflow } from '../src/storage/workflowStore';
import { STARTER_WORKFLOW } from '../src/storage/starterWorkflow';

describe('Workflow Storage & Serialization', () => {
  it('exports workflow to valid JSON', () => {
    const jsonStr = exportWorkflowJson(STARTER_WORKFLOW);
    expect(typeof jsonStr).toBe('string');
    const parsed = JSON.parse(jsonStr);
    expect(parsed.name).toBe(STARTER_WORKFLOW.name);
    expect(parsed.nodes.length).toBe(STARTER_WORKFLOW.nodes.length);
  });

  it('validates and imports workflow JSON', () => {
    const jsonStr = exportWorkflowJson(STARTER_WORKFLOW);
    const imported = validateAndParseWorkflow(jsonStr);

    expect(imported.name).toContain(STARTER_WORKFLOW.name);
    expect(imported.nodes.length).toBe(STARTER_WORKFLOW.nodes.length);
    expect(imported.edges.length).toBe(STARTER_WORKFLOW.edges.length);
    expect(imported.id).toBeDefined();
  });

  it('rejects malformed workflow JSON', () => {
    expect(() => validateAndParseWorkflow('not valid json')).toThrow(/Invalid JSON/);
    expect(() => validateAndParseWorkflow('{}')).toThrow(/missing required "nodes"/);
    expect(() => validateAndParseWorkflow(JSON.stringify({ nodes: [] }))).toThrow(/missing required "edges"/);
  });
});
