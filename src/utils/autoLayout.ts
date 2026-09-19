import dagre from '@dagrejs/dagre';
import { WorkflowNode, WorkflowEdge } from '../types/workflow';

export interface AutoLayoutOptions {
  direction?: 'TB' | 'LR';
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number; // Distance between levels (vertical for TB)
  nodeSep?: number; // Distance between sibling nodes (horizontal for TB)
}

/**
 * Automatically calculates tidy, hierarchical top-to-bottom or left-to-right
 * coordinates for all workflow nodes and edges using Dagre DAG layout.
 */
export function autoLayoutNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options: AutoLayoutOptions = {}
): WorkflowNode[] {
  if (!nodes || nodes.length === 0) return [];

  const {
    direction = 'TB',
    nodeWidth = 260,
    nodeHeight = 130,
    rankSep = 80,
    nodeSep = 60,
  } = options;

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: nodeSep,
    ranksep: rankSep,
    marginx: 50,
    marginy: 50,
  });

  // Register nodes with appropriate dimension metrics based on node type
  nodes.forEach((node) => {
    let width = nodeWidth;
    let height = nodeHeight;

    if (node.type === 'loopNode') {
      width = 260;
      height = 150;
    } else if (node.type === 'iteratorNode') {
      width = 270;
      height = 170;
    } else if (node.type === 'conditionNode' || node.type === 'containsNode') {
      width = 250;
      height = 140;
    } else if (node.data?.type === 'wait') {
      width = 240;
      height = 120;
    }

    dagreGraph.setNode(node.id, { width, height });
  });

  // Register connecting edges
  edges.forEach((edge) => {
    const hasSource = nodes.some((n) => n.id === edge.source);
    const hasTarget = nodes.some((n) => n.id === edge.target);
    if (hasSource && hasTarget) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  // Run Dagre layout algorithm
  dagre.layout(dagreGraph);

  // Map calculated coordinates back to nodes
  return nodes.map((node) => {
    const nodeWithPos = dagreGraph.node(node.id);
    if (!nodeWithPos) return node;

    let width = nodeWidth;
    let height = nodeHeight;
    if (node.type === 'loopNode') {
      width = 260;
      height = 150;
    } else if (node.type === 'iteratorNode') {
      width = 270;
      height = 170;
    } else if (node.type === 'conditionNode' || node.type === 'containsNode') {
      width = 250;
      height = 140;
    }

    return {
      ...node,
      position: {
        x: Math.round(nodeWithPos.x - width / 2),
        y: Math.round(nodeWithPos.y - height / 2),
      },
    };
  });
}
