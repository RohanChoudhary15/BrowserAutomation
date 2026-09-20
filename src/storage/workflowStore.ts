import { db } from './db';
import { Workflow } from '../types/workflow';
import { STARTER_WORKFLOW, ALL_TEMPLATES, DEPRECATED_TEMPLATE_IDS } from './starterWorkflow';
import { generateId } from '../utils/id';

export async function loadAllWorkflows(): Promise<Workflow[]> {
  let workflows = (await db.getAllWorkflows()) || [];

  // Automatically purge deprecated starter templates from storage
  const hasDeprecated = workflows.some((w) => DEPRECATED_TEMPLATE_IDS.includes(w.id));
  if (hasDeprecated) {
    for (const depId of DEPRECATED_TEMPLATE_IDS) {
      await db.deleteWorkflow(depId);
    }
    workflows = workflows.filter((w) => !DEPRECATED_TEMPLATE_IDS.includes(w.id));
  }

  if (workflows.length === 0) {
    for (const tpl of ALL_TEMPLATES) {
      await db.saveWorkflow(tpl);
    }
    return ALL_TEMPLATES;
  }

  // Ensure any newly added templates are seeded
  for (const tpl of ALL_TEMPLATES) {
    if (!workflows.some((w) => w.id === tpl.id)) {
      await db.saveWorkflow(tpl);
      workflows.push(tpl);
    }
  }

  return workflows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function resetToOfficialTemplates(): Promise<Workflow[]> {
  for (const depId of DEPRECATED_TEMPLATE_IDS) {
    await db.deleteWorkflow(depId);
  }
  for (const tpl of ALL_TEMPLATES) {
    await db.saveWorkflow(tpl);
  }
  return loadAllWorkflows();
}

export async function getWorkflowById(id: string): Promise<Workflow | null> {
  if (DEPRECATED_TEMPLATE_IDS.includes(id)) {
    return null;
  }
  const wf = await db.getWorkflow(id);
  if (!wf) {
    const tpl = ALL_TEMPLATES.find((t) => t.id === id);
    if (tpl) {
      await db.saveWorkflow(tpl);
      return tpl;
    }
  }
  return wf || null;
}

export async function saveWorkflow(workflow: Workflow): Promise<void> {
  const updated: Workflow = {
    ...workflow,
    updatedAt: Date.now(),
  };
  await db.saveWorkflow(updated);
}

export async function deleteWorkflow(id: string): Promise<void> {
  await db.deleteWorkflow(id);
}

export async function createNewWorkflow(name = 'Untitled Workflow'): Promise<Workflow> {
  const newWf: Workflow = {
    id: generateId('wf'),
    name,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    variables: {},
    settings: {
      timeout: 30000,
      retryCount: 0,
      retryDelay: 1000,
      stopOnError: true,
      highlightElements: true,
      humanMode: false,
      humanIntensity: 'natural',
      humanCursor: true,
    },
    nodes: [
      {
        id: generateId('node'),
        type: 'customNode',
        position: { x: 250, y: 100 },
        data: {
          label: 'Navigate',
          category: 'browser',
          type: 'navigate',
          properties: {
            url: 'https://example.com',
            waitUntil: 'load',
          },
        },
      },
    ],
    edges: [],
  };
  await db.saveWorkflow(newWf);
  return newWf;
}

export async function duplicateWorkflow(original: Workflow): Promise<Workflow> {
  const idMap = new Map<string, string>();

  const newNodes = original.nodes.map(n => {
    const newId = generateId('node');
    idMap.set(n.id, newId);
    return {
      ...n,
      id: newId,
      position: { x: n.position.x + 30, y: n.position.y + 30 },
    };
  });

  const newEdges = original.edges.map(e => ({
    ...e,
    id: generateId('edge'),
    source: idMap.get(e.source) || e.source,
    target: idMap.get(e.target) || e.target,
  }));

  const copy: Workflow = {
    ...original,
    id: generateId('wf'),
    name: `${original.name} (Copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: newNodes,
    edges: newEdges,
  };

  await db.saveWorkflow(copy);
  return copy;
}

export function exportWorkflowJson(workflow: Workflow): string {
  const exportData = {
    version: workflow.version || 1,
    name: workflow.name,
    description: workflow.description,
    exportedAt: new Date().toISOString(),
    nodes: workflow.nodes,
    edges: workflow.edges,
    variables: workflow.variables,
    settings: workflow.settings,
  };
  return JSON.stringify(exportData, null, 2);
}

export function validateAndParseWorkflow(jsonString: string): Workflow {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err: any) {
    throw new Error(`Invalid JSON syntax: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Imported workflow must be a valid JSON object.');
  }

  if (!Array.isArray(parsed.nodes)) {
    throw new Error('Workflow JSON is missing required "nodes" array.');
  }

  if (!Array.isArray(parsed.edges)) {
    throw new Error('Workflow JSON is missing required "edges" array.');
  }

  return {
    id: generateId('wf_import'),
    name: parsed.name ? `${parsed.name} (Imported)` : 'Imported Workflow',
    description: parsed.description,
    version: parsed.version || 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: parsed.nodes,
    edges: parsed.edges,
    variables: parsed.variables || {},
    settings: {
      timeout: 30000,
      retryCount: 0,
      retryDelay: 1000,
      stopOnError: true,
      highlightElements: true,
      humanMode: false,
      humanIntensity: 'natural',
      humanCursor: true,
      ...parsed.settings,
    },
  };
}
