import { WorkflowNode, WorkflowEdge } from '../types/workflow';

export interface AutoLayoutOptions {
  direction?: 'TB' | 'LR';
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number; // Distance between levels (vertical for TB)
  nodeSep?: number; // Distance between sibling nodes (horizontal for TB)
}

function getNodeDimensions(
  node: WorkflowNode,
  defaultWidth: number,
  defaultHeight: number
): { width: number; height: number } {
  let width = defaultWidth;
  let height = defaultHeight;

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

  return { width, height };
}

/**
 * Automatically calculates tidy, hierarchical top-to-bottom or left-to-right
 * coordinates for all workflow nodes and edges using a zero-dependency
 * directed acyclic graph (DAG) Sugiyama-style layout engine.
 */
export function autoLayoutNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options: AutoLayoutOptions = {}
): WorkflowNode[] {
  if (!nodes || nodes.length === 0) return [];
  if (nodes.length === 1) {
    return [
      {
        ...nodes[0],
        position: { x: 50, y: 50 },
      },
    ];
  }

  const {
    direction = 'TB',
    nodeWidth = 260,
    nodeHeight = 130,
    rankSep = 80,
    nodeSep = 60,
  } = options;

  const nodeMap = new Map<string, WorkflowNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const validEdges = (edges || []).filter(
    (e) => nodeMap.has(e.source) && nodeMap.has(e.target)
  );

  // 1. Cycle detection (DFS) to identify and ignore back-edges in loops
  const visited = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
  const backEdges = new Set<string>();

  function dfs(u: string) {
    visited.set(u, 1);
    const neighbors = validEdges.filter((e) => e.source === u).map((e) => e.target);
    for (const v of neighbors) {
      if (visited.get(v) === 1) {
        backEdges.add(`${u}->${v}`);
      } else if (!visited.has(v) || visited.get(v) === 0) {
        dfs(v);
      }
    }
    visited.set(u, 2);
  }

  nodes.forEach((n) => {
    if (!visited.has(n.id) || visited.get(n.id) === 0) {
      dfs(n.id);
    }
  });

  // 2. Build forward adjacency graph
  const forwardAdj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  nodes.forEach((n) => {
    forwardAdj.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  validEdges.forEach((e) => {
    if (!backEdges.has(`${e.source}->${e.target}`)) {
      forwardAdj.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  });

  // 3. Longest-path layering (hierarchical rank assignment)
  const rank = new Map<string, number>();
  nodes.forEach((n) => rank.set(n.id, 0));

  const queue: string[] = [];
  nodes.forEach((n) => {
    if ((inDegree.get(n.id) || 0) === 0) {
      queue.push(n.id);
    }
  });

  if (queue.length === 0 && nodes.length > 0) {
    queue.push(nodes[0].id);
  }

  const processed = new Set<string>();

  while (queue.length > 0) {
    const u = queue.shift()!;
    processed.add(u);
    const uRank = rank.get(u) || 0;

    for (const v of forwardAdj.get(u) || []) {
      const currentVRank = rank.get(v) || 0;
      if (uRank + 1 > currentVRank) {
        rank.set(v, uRank + 1);
      }
      inDegree.set(v, (inDegree.get(v) || 1) - 1);
      if (inDegree.get(v) === 0 && !processed.has(v)) {
        queue.push(v);
      }
    }
  }

  // 4. Group nodes into layers
  const layers = new Map<number, string[]>();
  let maxRank = 0;
  nodes.forEach((n) => {
    const r = rank.get(n.id) || 0;
    if (r > maxRank) maxRank = r;
    if (!layers.has(r)) {
      layers.set(r, []);
    }
    layers.get(r)!.push(n.id);
  });

  // 5. Order nodes within layers based on parent connections
  for (let r = 1; r <= maxRank; r++) {
    const layerNodes = layers.get(r) || [];
    const prevLayer = layers.get(r - 1) || [];
    const prevPosMap = new Map<string, number>();
    prevLayer.forEach((id, idx) => prevPosMap.set(id, idx));

    layerNodes.sort((a, b) => {
      const parentsA = validEdges
        .filter((e) => e.target === a && prevPosMap.has(e.source))
        .map((e) => prevPosMap.get(e.source)!);
      const parentsB = validEdges
        .filter((e) => e.target === b && prevPosMap.has(e.source))
        .map((e) => prevPosMap.get(e.source)!);

      const avgA = parentsA.length > 0 ? parentsA.reduce((s, x) => s + x, 0) / parentsA.length : 0;
      const avgB = parentsB.length > 0 ? parentsB.reduce((s, x) => s + x, 0) / parentsB.length : 0;

      return avgA - avgB;
    });
  }

  // 6. Coordinate Assignment
  const positions = new Map<string, { x: number; y: number }>();

  if (direction === 'TB') {
    // Top-to-Bottom
    const layerY = new Map<number, number>();
    let currentY = 50;

    for (let r = 0; r <= maxRank; r++) {
      const layerNodes = layers.get(r) || [];
      const maxHeight = Math.max(
        ...layerNodes.map((id) => getNodeDimensions(nodeMap.get(id)!, nodeWidth, nodeHeight).height),
        nodeHeight
      );
      layerY.set(r, currentY);
      currentY += maxHeight + rankSep;
    }

    // Determine max width across layers to center everything
    let maxLayerWidth = 0;
    for (let r = 0; r <= maxRank; r++) {
      const layerNodes = layers.get(r) || [];
      const totalW =
        layerNodes.reduce(
          (sum, id) => sum + getNodeDimensions(nodeMap.get(id)!, nodeWidth, nodeHeight).width,
          0
        ) + Math.max(0, layerNodes.length - 1) * nodeSep;
      if (totalW > maxLayerWidth) maxLayerWidth = totalW;
    }

    for (let r = 0; r <= maxRank; r++) {
      const layerNodes = layers.get(r) || [];
      const totalW =
        layerNodes.reduce(
          (sum, id) => sum + getNodeDimensions(nodeMap.get(id)!, nodeWidth, nodeHeight).width,
          0
        ) + Math.max(0, layerNodes.length - 1) * nodeSep;
      const startX = 50 + Math.max(0, (maxLayerWidth - totalW) / 2);

      let curX = startX;
      for (const id of layerNodes) {
        const dims = getNodeDimensions(nodeMap.get(id)!, nodeWidth, nodeHeight);
        positions.set(id, {
          x: Math.round(curX),
          y: Math.round(layerY.get(r) || 50),
        });
        curX += dims.width + nodeSep;
      }
    }
  } else {
    // Left-to-Right (LR)
    const layerX = new Map<number, number>();
    let currentX = 50;

    for (let r = 0; r <= maxRank; r++) {
      const layerNodes = layers.get(r) || [];
      const maxWidth = Math.max(
        ...layerNodes.map((id) => getNodeDimensions(nodeMap.get(id)!, nodeWidth, nodeHeight).width),
        nodeWidth
      );
      layerX.set(r, currentX);
      currentX += maxWidth + rankSep;
    }

    let maxLayerHeight = 0;
    for (let r = 0; r <= maxRank; r++) {
      const layerNodes = layers.get(r) || [];
      const totalH =
        layerNodes.reduce(
          (sum, id) => sum + getNodeDimensions(nodeMap.get(id)!, nodeWidth, nodeHeight).height,
          0
        ) + Math.max(0, layerNodes.length - 1) * nodeSep;
      if (totalH > maxLayerHeight) maxLayerHeight = totalH;
    }

    for (let r = 0; r <= maxRank; r++) {
      const layerNodes = layers.get(r) || [];
      const totalH =
        layerNodes.reduce(
          (sum, id) => sum + getNodeDimensions(nodeMap.get(id)!, nodeWidth, nodeHeight).height,
          0
        ) + Math.max(0, layerNodes.length - 1) * nodeSep;
      const startY = 50 + Math.max(0, (maxLayerHeight - totalH) / 2);

      let curY = startY;
      for (const id of layerNodes) {
        const dims = getNodeDimensions(nodeMap.get(id)!, nodeWidth, nodeHeight);
        positions.set(id, {
          x: Math.round(layerX.get(r) || 50),
          y: Math.round(curY),
        });
        curY += dims.height + nodeSep;
      }
    }
  }

  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) || node.position,
  }));
}
