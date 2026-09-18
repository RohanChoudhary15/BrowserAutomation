import { WorkflowNode, WorkflowEdge } from '../types/workflow';
import { generateId } from './id';

export interface CopiedNodesPayload {
  version: 1;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  copiedAt: number;
}

const CLIPBOARD_STORAGE_KEY = 'autoflow_copied_nodes';
let inMemoryClipboard: CopiedNodesPayload | null = null;

/**
 * Copies single or multiple nodes and their internal edges to clipboard.
 */
export function copyNodesToClipboard(
  nodes: WorkflowNode[],
  allEdges: WorkflowEdge[] = []
): CopiedNodesPayload {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const internalEdges = allEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  const payload: CopiedNodesPayload = {
    version: 1,
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges: JSON.parse(JSON.stringify(internalEdges)),
    copiedAt: Date.now(),
  };

  inMemoryClipboard = payload;

  try {
    sessionStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage might be restricted in some extension contexts
  }

  return payload;
}

/**
 * Retrieves the currently copied nodes from in-memory cache or sessionStorage.
 */
export function getCopiedNodesFromClipboard(): CopiedNodesPayload | null {
  if (inMemoryClipboard && inMemoryClipboard.nodes && inMemoryClipboard.nodes.length > 0) {
    return inMemoryClipboard;
  }

  try {
    const raw = sessionStorage.getItem(CLIPBOARD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CopiedNodesPayload;
      if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        inMemoryClipboard = parsed;
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }

  return null;
}

/**
 * Checks whether there are copied nodes ready to paste.
 */
export function hasCopiedNodes(): boolean {
  return getCopiedNodesFromClipboard() !== null;
}

/**
 * Prepares new nodes and remapped edges with fresh IDs for pasting.
 */
export function preparePastedNodes(
  payload: CopiedNodesPayload,
  targetPosition?: { x: number; y: number }
): {
  newNodes: WorkflowNode[];
  newEdges: WorkflowEdge[];
} {
  if (!payload || !payload.nodes || !payload.nodes.length) {
    return { newNodes: [], newEdges: [] };
  }

  const idMap = new Map<string, string>();

  let minX = Infinity;
  let minY = Infinity;
  for (const n of payload.nodes) {
    if (n.position.x < minX) minX = n.position.x;
    if (n.position.y < minY) minY = n.position.y;
  }

  const hasTarget = targetPosition !== undefined;
  const offsetX = hasTarget ? targetPosition.x - minX : 40;
  const offsetY = hasTarget ? targetPosition.y - minY : 40;

  const newNodes: WorkflowNode[] = payload.nodes.map((node) => {
    const newId = generateId('node');
    idMap.set(node.id, newId);

    const pos = hasTarget
      ? { x: node.position.x + offsetX, y: node.position.y + offsetY }
      : { x: node.position.x + 40, y: node.position.y + 40 };

    return {
      ...node,
      id: newId,
      position: pos,
      selected: true,
      data: JSON.parse(JSON.stringify(node.data)),
    };
  });

  const newEdges: WorkflowEdge[] = (payload.edges || [])
    .filter((e) => idMap.has(e.source) && idMap.has(e.target))
    .map((e) => ({
      ...e,
      id: generateId('edge'),
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
    }));

  return { newNodes, newEdges };
}
