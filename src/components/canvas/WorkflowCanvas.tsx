import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
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
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes } from '../../nodes/NodeTypes';
import { WorkflowNode, WorkflowEdge, NodeType } from '../../types/workflow';
import { NodeRuntimeState } from '../../types/execution';
import { ContextMenu } from './ContextMenu';
import { QuickAddModal } from './QuickAddModal';
import { NODE_REGISTRY } from '../../nodes/registry';
import { generateId } from '../../utils/id';
import { Copy, Trash2, EyeOff, X, ClipboardCopy, ClipboardPaste, Sparkles } from 'lucide-react';

interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  nodeStates: Record<string, NodeRuntimeState>;
  onNodesChange: OnNodesChange<WorkflowNode>;
  onEdgesChange: OnEdgesChange<WorkflowEdge>;
  onConnect: OnConnect;
  onSelectNode: (node: WorkflowNode | null) => void;
  onAddNode: (type: NodeType, position?: { x: number; y: number }) => void;
  onAddNodeAndConnect?: (
    type: NodeType,
    position: { x: number; y: number },
    connection: { sourceNodeId: string; sourceHandleId?: string | null; handleType: 'source' | 'target' }
  ) => void;
  onDuplicateNode: (node: WorkflowNode) => void;
  onDuplicateNodes?: (nodes: WorkflowNode[]) => void;
  onCopyNode?: (node: WorkflowNode) => void;
  onCopyNodes?: (nodes: WorkflowNode[]) => void;
  onPasteNodes?: (position?: { x: number; y: number }) => void;
  canPaste?: boolean;
  onDeleteNode: (nodeId: string) => void;
  onDeleteNodes?: (nodeIds: string[]) => void;
  onDeleteEdge?: (edgeId: string) => void;
  onToggleDisableNode: (nodeId: string) => void;
  onToggleDisableNodes?: (nodeIds: string[]) => void;
  onRunNode: (nodeId: string) => void;
  onAutoLayout?: () => void;
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
  onAddNodeAndConnect,
  onDuplicateNode,
  onDuplicateNodes,
  onCopyNode,
  onCopyNodes,
  onPasteNodes,
  canPaste = false,
  onDeleteNode,
  onDeleteNodes,
  onDeleteEdge,
  onToggleDisableNode,
  onToggleDisableNodes,
  onRunNode,
  onAutoLayout,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const handleAutoLayout = useCallback(() => {
    onAutoLayout?.();
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
    }, 60);
  }, [onAutoLayout, fitView]);

  // Selected nodes list
  const selectedNodes = nodes.filter((n) => n.selected);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node?: WorkflowNode | null;
    edge?: WorkflowEdge | null;
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

  // Pending line connection when dragging from a handle onto empty canvas
  const [pendingConnection, setPendingConnection] = useState<{
    sourceNodeId: string;
    sourceHandleId?: string | null;
    handleType: 'source' | 'target';
  } | null>(null);

  const connectingNodeInfo = useRef<{
    nodeId: string | null;
    handleId: string | null;
    handleType: 'source' | 'target' | null;
  }>({ nodeId: null, handleId: null, handleType: null });

  // Map nodes to inject live runtime state and onRunNode callback
  const enrichedNodes = nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      runtimeState: nodeStates[n.id],
      onRunNode: onRunNode,
      onDeleteNode: onDeleteNode,
    },
  }));

  const handleConnectStart = useCallback((_: any, { nodeId, handleId, handleType }: any) => {
    connectingNodeInfo.current = { nodeId, handleId, handleType };
  }, []);

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!connectingNodeInfo.current.nodeId) return;

      const targetIsHandle = (event.target as Element)?.closest?.('.react-flow__handle');
      if (!targetIsHandle) {
        const clientX = 'changedTouches' in event ? event.changedTouches[0].clientX : (event as MouseEvent).clientX;
        const clientY = 'changedTouches' in event ? event.changedTouches[0].clientY : (event as MouseEvent).clientY;

        if (reactFlowWrapper.current) {
          const bounds = reactFlowWrapper.current.getBoundingClientRect();
          if (
            clientX >= bounds.left &&
            clientX <= bounds.right &&
            clientY >= bounds.top &&
            clientY <= bounds.bottom
          ) {
            const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
            setPendingConnection({
              sourceNodeId: connectingNodeInfo.current.nodeId,
              sourceHandleId: connectingNodeInfo.current.handleId,
              handleType: connectingNodeInfo.current.handleType || 'source',
            });
            setQuickAdd({
              isOpen: true,
              screenPos: { x: clientX, y: clientY },
              flowPos,
            });
          }
        }
      }
      connectingNodeInfo.current = { nodeId: null, handleId: null, handleType: null };
    },
    [screenToFlowPosition]
  );

  // Keyboard shortcuts for multi-node operations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      // Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const toDelete = nodes.filter((n) => n.selected);
        if (toDelete.length > 0) {
          e.preventDefault();
          if (onDeleteNodes) {
            onDeleteNodes(toDelete.map((n) => n.id));
          } else {
            toDelete.forEach((n) => onDeleteNode(n.id));
          }
        }
      }

      // Ctrl+D / Cmd+D -> Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        const toDuplicate = nodes.filter((n) => n.selected);
        if (toDuplicate.length > 0) {
          e.preventDefault();
          if (onDuplicateNodes) {
            onDuplicateNodes(toDuplicate);
          } else {
            toDuplicate.forEach(onDuplicateNode);
          }
        }
      }

      // Ctrl+C / Cmd+C -> Copy
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const toCopy = nodes.filter((n) => n.selected);
        if (toCopy.length > 0) {
          e.preventDefault();
          if (onCopyNodes) {
            onCopyNodes(toCopy);
          } else if (onCopyNode && toCopy.length === 1) {
            onCopyNode(toCopy[0]);
          }
        }
      }

      // Ctrl+V / Cmd+V -> Paste
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (onPasteNodes && canPaste) {
          e.preventDefault();
          onPasteNodes();
        }
      }

      // Ctrl+A / Cmd+A -> Select All Nodes
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        onNodesChange(nodes.map((n) => ({ type: 'select', id: n.id, selected: true })));
      }

      // Escape -> Deselect All & dismiss menus
      if (e.key === 'Escape') {
        onNodesChange(nodes.map((n) => ({ type: 'select', id: n.id, selected: false })));
        onSelectNode(null);
        setContextMenu(null);
        setQuickAdd((prev) => ({ ...prev, isOpen: false }));
        setPendingConnection(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, onDeleteNodes, onDeleteNode, onDuplicateNodes, onDuplicateNode, onCopyNodes, onCopyNode, onPasteNodes, canPaste, onNodesChange, onSelectNode]);

  // Track Alt key globally for tactile cursor and visual cue
  const [isAltPressed, setIsAltPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.altKey) {
        setIsAltPressed(true);
      }
      if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        handleAutoLayout();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || !e.altKey) {
        setIsAltPressed(false);
      }
    };
    const handleBlur = () => setIsAltPressed(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleAutoLayout]);

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
      setQuickAdd((prev) => ({ ...prev, isOpen: false }));
      setPendingConnection(null);
    },
    [onSelectNode]
  );

  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: WorkflowEdge) => {
      if (event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        onDeleteEdge?.(edge.id);
        setContextMenu(null);
      }
    },
    [onDeleteEdge]
  );

  const handleEdgeContextMenu = useCallback(
    (e: React.MouseEvent, edge: WorkflowEdge) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        node: null,
        edge,
      });
      setQuickAdd((prev) => ({ ...prev, isOpen: false }));
      setPendingConnection(null);
    },
    []
  );

  // Capture phase listener for Alt+Click on any edge/connection element
  const handleCanvasClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (e.altKey) {
        const edgeEl = (e.target as HTMLElement).closest('.react-flow__edge');
        if (edgeEl) {
          const edgeId = edgeEl.getAttribute('data-id');
          if (edgeId) {
            e.preventDefault();
            e.stopPropagation();
            onDeleteEdge?.(edgeId);
            setContextMenu(null);
            setQuickAdd((prev) => ({ ...prev, isOpen: false }));
            setPendingConnection(null);
          }
        }
      }
    },
    [onDeleteEdge]
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
    setContextMenu(null);
    setQuickAdd((prev) => ({ ...prev, isOpen: false }));
    setPendingConnection(null);
  }, [onSelectNode]);

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: WorkflowNode) => {
      e.preventDefault();
      e.stopPropagation();
      // Right-clicking a node selects it if not already selected
      if (!node.selected) {
        onNodesChange(nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === node.id })));
        onSelectNode(node);
      }
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        node,
        edge: null,
      });
      setQuickAdd((prev) => ({ ...prev, isOpen: false }));
      setPendingConnection(null);
    },
    [nodes, onNodesChange, onSelectNode]
  );

  const handlePaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node: null,
      edge: null,
    });
    setQuickAdd((prev) => ({ ...prev, isOpen: false }));
    setPendingConnection(null);
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const flowPos = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      setPendingConnection(null);
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
      className={`w-full h-full relative select-none bg-[#0c0e14] ${isAltPressed ? 'alt-delete-mode' : ''}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClickCapture={handleCanvasClickCapture}
    >
      {isAltPressed && (
        <style>{`
          .alt-delete-mode .react-flow__edge {
            cursor: pointer !important;
          }
          .alt-delete-mode .react-flow__edge:hover .react-flow__edge-path {
            stroke: #f43f5e !important;
            stroke-width: 3.5px !important;
            filter: drop-shadow(0 0 6px rgba(244, 63, 94, 0.9));
          }
          .alt-delete-mode .react-flow__edge:hover .react-flow__edge-interaction {
            cursor: pointer !important;
          }
          .alt-delete-mode .react-flow__edge-textwrapper:hover {
            cursor: pointer !important;
          }
        `}</style>
      )}
      <ReactFlow
        nodes={enrichedNodes as any}
        edges={edges as any}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange as any}
        onEdgesChange={onEdgesChange as any}
        onConnect={onConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick as any}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu as any}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onDoubleClick={handleDoubleClick}
        snapToGrid={true}
        snapGrid={[15, 15]}
        defaultViewport={{ x: 100, y: 100, zoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        selectionKeyCode="Shift"
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1c2230" />
        <Controls className="!m-4 !border-[#1c2230] !bg-[#11141c]">
          {onAutoLayout && (
            <ControlButton
              onClick={handleAutoLayout}
              title="Auto-Layout / Tidy Nodes (Alt+L)"
              aria-label="Auto-Layout / Tidy Nodes"
              className="!bg-[#11141c] hover:!bg-[#1c2230] !border-[#1c2230] !text-indigo-400"
            >
              <Sparkles className="w-4 h-4 text-indigo-400 hover:text-indigo-300" />
            </ControlButton>
          )}
        </Controls>
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

      {/* Floating Multi-Selection Toolbar */}
      {selectedNodes.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-[#11141c]/95 border border-[#232a3b] backdrop-blur-md px-4 py-2 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-150">
          <div className="flex items-center gap-2 pr-3 border-r border-[#232a3b] text-xs font-semibold text-white">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            <span>{selectedNodes.length} nodes selected</span>
          </div>
          <button
            onClick={() => {
              if (onCopyNodes) onCopyNodes(selectedNodes);
              else if (onCopyNode && selectedNodes.length === 1) onCopyNode(selectedNodes[0]);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1c2230] hover:bg-[#252c3d] text-gray-200 hover:text-white transition-colors text-xs font-medium"
            title="Copy selected nodes (Ctrl+C)"
          >
            <ClipboardCopy className="w-3.5 h-3.5 text-indigo-400" />
            <span>Copy</span>
          </button>
          <button
            onClick={() => {
              if (onDuplicateNodes) onDuplicateNodes(selectedNodes);
              else selectedNodes.forEach(onDuplicateNode);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1c2230] hover:bg-[#252c3d] text-gray-200 hover:text-white transition-colors text-xs font-medium"
            title="Duplicate selected nodes (Ctrl+D)"
          >
            <Copy className="w-3.5 h-3.5 text-indigo-400" />
            <span>Duplicate</span>
          </button>
          <button
            onClick={() => {
              if (onToggleDisableNodes) onToggleDisableNodes(selectedNodes.map((n) => n.id));
              else selectedNodes.forEach((n) => onToggleDisableNode(n.id));
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1c2230] hover:bg-[#252c3d] text-gray-200 hover:text-white transition-colors text-xs font-medium"
            title="Toggle enable/disable"
          >
            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
            <span>Disable/Enable</span>
          </button>
          <button
            onClick={() => {
              if (onDeleteNodes) onDeleteNodes(selectedNodes.map((n) => n.id));
              else selectedNodes.forEach((n) => onDeleteNode(n.id));
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors text-xs font-medium"
            title="Delete selected nodes (Del)"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Delete</span>
          </button>
          <button
            onClick={() => {
              onNodesChange(nodes.map((n) => ({ type: 'select', id: n.id, selected: false })));
            }}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Deselect all (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Canvas Tidy Nodes Toolbar Button */}
      {onAutoLayout && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          <button
            onClick={handleAutoLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#11141c]/90 hover:bg-[#1c2230] border border-[#232a3b] text-gray-200 hover:text-white shadow-xl backdrop-blur-md text-xs font-medium transition-all group hover:border-indigo-500/50"
            title="Automatically arrange nodes into a clean top-to-bottom flowchart (Alt+L)"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 group-hover:rotate-12 transition-transform" />
            <span>Tidy Nodes</span>
            <span className="text-[10px] text-gray-500 font-mono ml-0.5">Alt+L</span>
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          edge={contextMenu.edge}
          selectedNodesCount={selectedNodes.length}
          canPaste={canPaste}
          onClose={() => setContextMenu(null)}
          onRunNode={onRunNode}
          onCopyNode={onCopyNode}
          onCopySelected={() => {
            if (onCopyNodes) onCopyNodes(selectedNodes);
            else if (onCopyNode && selectedNodes.length === 1) onCopyNode(selectedNodes[0]);
          }}
          onPaste={(pos) => {
            const flowPos = screenToFlowPosition(pos);
            onPasteNodes?.(flowPos);
          }}
          onDuplicateNode={onDuplicateNode}
          onDuplicateSelected={() => {
            if (onDuplicateNodes) onDuplicateNodes(selectedNodes);
            else selectedNodes.forEach(onDuplicateNode);
          }}
          onToggleDisableNode={onToggleDisableNode}
          onToggleDisableSelected={() => {
            if (onToggleDisableNodes) onToggleDisableNodes(selectedNodes.map((n) => n.id));
            else selectedNodes.forEach((n) => onToggleDisableNode(n.id));
          }}
          onDeleteNode={onDeleteNode}
          onDeleteSelected={() => {
            if (onDeleteNodes) onDeleteNodes(selectedNodes.map((n) => n.id));
            else selectedNodes.forEach((n) => onDeleteNode(n.id));
          }}
          onDeleteEdge={onDeleteEdge}
          onAddNode={(pos) => {
            const flowPos = screenToFlowPosition(pos);
            setPendingConnection(null);
            setQuickAdd({
              isOpen: true,
              screenPos: pos,
              flowPos,
            });
          }}
          onFitView={() => fitView({ padding: 0.2, duration: 400 })}
          onSelectAll={() => onNodesChange(nodes.map((n) => ({ type: 'select', id: n.id, selected: true })))}
          onAutoLayout={handleAutoLayout}
        />
      )}

      {/* Quick Add Node Modal */}
      <QuickAddModal
        isOpen={quickAdd.isOpen}
        position={quickAdd.screenPos}
        onClose={() => {
          setQuickAdd((prev) => ({ ...prev, isOpen: false }));
          setPendingConnection(null);
        }}
        onSelectNode={(type) => {
          if (pendingConnection && onAddNodeAndConnect) {
            onAddNodeAndConnect(type, quickAdd.flowPos, pendingConnection);
          } else {
            onAddNode(type, quickAdd.flowPos);
          }
          setPendingConnection(null);
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
