import React, { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Connection,
  Edge,
  Node,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes } from '../../nodes/NodeTypes';
import { WorkflowNode, WorkflowEdge, NodeType } from '../../types/workflow';
import { NodeRuntimeState } from '../../types/execution';
import { ContextMenu } from './ContextMenu';
import { QuickAddModal } from './QuickAddModal';
import { NODE_REGISTRY } from '../../nodes/registry';
import { generateId } from '../../utils/id';

interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  nodeStates: Record<string, NodeRuntimeState>;
  onNodesChange: OnNodesChange<WorkflowNode>;
  onEdgesChange: OnEdgesChange<WorkflowEdge>;
  onConnect: OnConnect;
  onSelectNode: (node: WorkflowNode | null) => void;
  onAddNode: (type: NodeType, position?: { x: number; y: number }) => void;
  onDuplicateNode: (node: WorkflowNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onToggleDisableNode: (nodeId: string) => void;
  onRunNode: (nodeId: string) => void;
}

const WorkflowCanvasInner: React.FC<WorkflowCanvasProps> = ({
  nodes,
  edges,
  nodeStates,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectNode,
  onAddNode,
  onDuplicateNode,
  onDeleteNode,
  onToggleDisableNode,
  onRunNode,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node?: WorkflowNode | null;
  } | null>(null);

  // Quick Add Modal state
  const [quickAdd, setQuickAdd] = useState<{
    isOpen: boolean;
    screenPos: { x: number; y: number };
    flowPos: { x: number; y: number };
  }>({
    isOpen: false,
    screenPos: { x: 0, y: 0 },
    flowPos: { x: 0, y: 0 },
  });

  // Map nodes to inject live runtime state and onRunNode callback
  const enrichedNodes = nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      runtimeState: nodeStates[n.id],
      onRunNode: onRunNode,
    },
  }));

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('application/autoflow-node') as NodeType;
      if (!nodeType) return;

      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      onAddNode(nodeType, position);
    },
    [screenToFlowPosition, onAddNode]
  );

  const handleNodeClick = useCallback(
    (_: any, node: WorkflowNode) => {
      onSelectNode(node);
      setContextMenu(null);
    },
    [onSelectNode]
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
    setContextMenu(null);
  }, [onSelectNode]);

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: WorkflowNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
    });
  }, []);

  const handlePaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node: null,
    });
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const flowPos = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      setQuickAdd({
        isOpen: true,
        screenPos: { x: e.clientX, y: e.clientY },
        flowPos,
      });
    },
    [screenToFlowPosition]
  );

  return (
    <div
      ref={reactFlowWrapper}
      className="w-full h-full relative select-none bg-[#0c0e14]"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={enrichedNodes as any}
        edges={edges as any}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange as any}
        onEdgesChange={onEdgesChange as any}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        onDoubleClick={handleDoubleClick}
        snapToGrid={true}
        snapGrid={[15, 15]}
        defaultViewport={{ x: 100, y: 100, zoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1c2230" />
        <Controls className="!m-4 !border-[#1c2230] !bg-[#11141c]" />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(n: any) => {
            if (n.data?.category === 'browser') return '#3b82f6';
            if (n.data?.category === 'interaction') return '#6366f1';
            if (n.data?.category === 'wait') return '#f59e0b';
            if (n.data?.category === 'extraction') return '#10b981';
            if (n.data?.category === 'logic') return '#8b5cf6';
            return '#475569';
          }}
          maskColor="rgba(12, 14, 20, 0.7)"
          className="!bottom-4 !right-4"
        />
      </ReactFlow>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={() => setContextMenu(null)}
          onRunNode={onRunNode}
          onDuplicateNode={onDuplicateNode}
          onToggleDisableNode={onToggleDisableNode}
          onDeleteNode={onDeleteNode}
          onAddNode={(pos) => {
            const flowPos = screenToFlowPosition(pos);
            setQuickAdd({
              isOpen: true,
              screenPos: pos,
              flowPos,
            });
          }}
          onFitView={() => fitView({ padding: 0.2, duration: 400 })}
        />
      )}

      {/* Quick Add Node Modal */}
      <QuickAddModal
        isOpen={quickAdd.isOpen}
        position={quickAdd.screenPos}
        onClose={() => setQuickAdd((prev) => ({ ...prev, isOpen: false }))}
        onSelectNode={(type) => {
          onAddNode(type, quickAdd.flowPos);
        }}
      />
    </div>
  );
};

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
};
