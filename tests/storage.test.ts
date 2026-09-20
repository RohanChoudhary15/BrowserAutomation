import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportWorkflowJson,
  validateAndParseWorkflow,
  loadAllWorkflows,
  resetToOfficialTemplates,
  getWorkflowById,
} from '../src/storage/workflowStore';
import {
  STARTER_WORKFLOW,
  ALL_TEMPLATES,
  DEPRECATED_TEMPLATE_IDS,
  ECOMMERCE_INTELLIGENCE_WORKFLOW,
  B2B_LEAD_ENRICHMENT_WORKFLOW,
  TECH_TALENT_ANALYZER_WORKFLOW,
  REAL_ESTATE_DEAL_FINDER_WORKFLOW,
  BRAND_SENTIMENT_CRISIS_WORKFLOW,
} from '../src/storage/starterWorkflow';
import { db } from '../src/storage/db';

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

describe('Official Complex Templates & Migration', () => {
  it('contains exactly 5 highly complex production templates', () => {
    expect(ALL_TEMPLATES).toHaveLength(5);
    const ids = ALL_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('tpl_ecommerce_intel');
    expect(ids).toContain('tpl_b2b_lead_pipeline');
    expect(ids).toContain('tpl_tech_talent_scanner');
    expect(ids).toContain('tpl_real_estate_modeler');
    expect(ids).toContain('tpl_brand_sentiment_crisis');
  });

  it('ensures none of the deprecated templates remain in ALL_TEMPLATES', () => {
    const currentIds = ALL_TEMPLATES.map((t) => t.id);
    for (const depId of DEPRECATED_TEMPLATE_IDS) {
      expect(currentIds).not.toContain(depId);
    }
  });

  it('validates that every template has valid nodes, non-overlapping positions, and healthy edge connections', () => {
    for (const tpl of ALL_TEMPLATES) {
      expect(tpl.nodes.length).toBeGreaterThanOrEqual(8);
      expect(tpl.edges.length).toBeGreaterThanOrEqual(7);
      expect(tpl.name).toBeTruthy();
      expect(tpl.description).toBeTruthy();

      // Check all edges connect existing nodes
      for (const edge of tpl.edges) {
        const sourceExists = tpl.nodes.some((n) => n.id === edge.source);
        const targetExists = tpl.nodes.some((n) => n.id === edge.target);
        expect(sourceExists).toBe(true);
        expect(targetExists).toBe(true);
      }

      // Check serializability
      const serialized = exportWorkflowJson(tpl);
      const rehydrated = validateAndParseWorkflow(serialized);
      expect(rehydrated.nodes.length).toBe(tpl.nodes.length);
      expect(rehydrated.edges.length).toBe(tpl.edges.length);
    }
  });

  it('automatically purges deprecated templates when loading workflows', async () => {
    // Seed db with old deprecated templates
    for (const depId of DEPRECATED_TEMPLATE_IDS) {
      await db.saveWorkflow({
        id: depId,
        name: `Old ${depId}`,
        version: 1,
        createdAt: 100,
        updatedAt: 100,
        variables: {},
        settings: { timeout: 30000, retryCount: 0, retryDelay: 1000, stopOnError: true, highlightElements: true },
        nodes: [],
        edges: [],
      });
    }

    const loaded = await loadAllWorkflows();
    const loadedIds = loaded.map((w) => w.id);

    // Verify deprecated templates were removed
    for (const depId of DEPRECATED_TEMPLATE_IDS) {
      expect(loadedIds).not.toContain(depId);
      const inDb = await db.getWorkflow(depId);
      expect(inDb).toBeUndefined();
    }

    // Verify new templates are present
    expect(loadedIds).toContain(ECOMMERCE_INTELLIGENCE_WORKFLOW.id);
    expect(loadedIds).toContain(B2B_LEAD_ENRICHMENT_WORKFLOW.id);
  });

  it('refreshes all official templates via resetToOfficialTemplates', async () => {
    const refreshed = await resetToOfficialTemplates();
    expect(refreshed.length).toBeGreaterThanOrEqual(5);
    const ids = refreshed.map((w) => w.id);
    expect(ids).toContain(ECOMMERCE_INTELLIGENCE_WORKFLOW.id);
    expect(ids).toContain(B2B_LEAD_ENRICHMENT_WORKFLOW.id);
    expect(ids).toContain(TECH_TALENT_ANALYZER_WORKFLOW.id);
    expect(ids).toContain(REAL_ESTATE_DEAL_FINDER_WORKFLOW.id);
    expect(ids).toContain(BRAND_SENTIMENT_CRISIS_WORKFLOW.id);
  });
});
