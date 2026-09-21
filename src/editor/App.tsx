import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
} from '@xyflow/react';

import { Workflow, WorkflowNode, WorkflowEdge, NodeType, WorkflowSettings, HumanIntensity } from '../types/workflow';
import { NodeRuntimeState, ExecutionLog, WorkflowExecutionStatus } from '../types/execution';
import { HeaderBar } from '../components/topbar/HeaderBar';
import { NodeLibrary } from '../components/sidebar/NodeLibrary';
import { WorkflowCanvas } from '../components/canvas/WorkflowCanvas';
import { PropertiesPanel } from '../components/properties/PropertiesPanel';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { ExecutionPanel } from '../components/bottompanel/ExecutionPanel';
import { WorkflowListModal } from '../components/sidebar/WorkflowListModal';
import { AiCopilotDrawer } from '../components/ai/AiCopilotDrawer';
import { BrowserAgentModal } from '../components/ai/BrowserAgentModal';
import { BotCredentialsModal } from '../components/modals/BotCredentialsModal';

import {
  loadAllWorkflows,
  saveWorkflow,
  createNewWorkflow,
  duplicateWorkflow,
  deleteWorkflow,
  exportWorkflowJson,
  validateAndParseWorkflow,
  resetToOfficialTemplates,
} from '../storage/workflowStore';
import { STARTER_WORKFLOW } from '../storage/starterWorkflow';
import { NODE_REGISTRY } from '../nodes/registry';
import { WorkflowEngine } from '../runtime/engine';
import { generateId } from '../utils/id';
import { useHistory } from './hooks/useHistory';
import { ElementSelectionResult } from '../types/selector';
import { RecordedActionPayload } from '../types/messages';
import {
  copyNodesToClipboard,
  getCopiedNodesFromClipboard,
  hasCopiedNodes,
  preparePastedNodes,
} from '../utils/nodeClipboard';
import { autoLayoutNodes } from '../utils/autoLayout';

export const App: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow>(STARTER_WORKFLOW);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(STARTER_WORKFLOW.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>(STARTER_WORKFLOW.edges);

  // Undo / Redo history
  const { takeSnapshot, undo, redo, canUndo, canRedo, resetHistory } = useHistory(
    STARTER_WORKFLOW.nodes,
    STARTER_WORKFLOW.edges
  );

  // UI Panel Collapse states (default collapsed on narrow screens / side panels)
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);
  const [isExecutionCollapsed, setIsExecutionCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [isWorkflowsModalOpen, setIsWorkflowsModalOpen] = useState(false);
  const [isAiCopilotOpen, setIsAiCopilotOpen] = useState(false);
  const [isBrowserAgentOpen, setIsBrowserAgentOpen] = useState(false);
  const [isBotCredentialsModalOpen, setIsBotCredentialsModalOpen] = useState(false);

  // Execution & Engine state
  const [executionStatus, setExecutionStatus] = useState<WorkflowExecutionStatus>('idle');
  const [nodeStates, setNodeStates] = useState<Record<string, NodeRuntimeState>>({});
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [liveVariables, setLiveVariables] = useState<Record<string, any>>({});
  const engineRef = useRef<WorkflowEngine | null>(null);

  // Recording & Element Picker State
  const [isRecording, setIsRecording] = useState(false);
  const [isPickingElement, setIsPickingElement] = useState(false);
  const lastRecordedNodeIdRef = useRef<string | null>(null);

  // Autosave tracking
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<any>(null);

  // Clipboard revision tracker for UI reactivity
  const [clipboardRevision, setClipboardRevision] = useState(0);

  // Load workflows on mount
  useEffect(() => {
    loadAllWorkflows().then((all) => {
      setWorkflows(all);
      if (all.length > 0) {
        const initial = all.find((w) => w.id === STARTER_WORKFLOW.id) || all[0];
        setActiveWorkflow(initial);
        setNodes(initial.nodes);
        setEdges(initial.edges);
        resetHistory(initial.nodes, initial.edges);
      }
    });
  }, [resetHistory, setEdges, setNodes]);

  // Autosave handler debounced 600ms
  const triggerAutosave = useCallback(
    (newNodes: WorkflowNode[], newEdges: WorkflowEdge[], newName?: string, settingsPatch?: Partial<WorkflowSettings>) => {
      setIsSaving(true);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        const updated: Workflow = {
          ...activeWorkflow,
          name: newName || activeWorkflow.name,
          nodes: newNodes,
          edges: newEdges,
          settings: settingsPatch ? { ...activeWorkflow.settings, ...settingsPatch } : activeWorkflow.settings,
          updatedAt: Date.now(),
        };
        await saveWorkflow(updated);
        setActiveWorkflow(updated);
        setIsSaving(false);
      }, 600);
    },
    [activeWorkflow]
  );

  // Handle nodes change
  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      setNodes((current) => {
        takeSnapshot(current, edges);
        triggerAutosave(current, edges);
        return current;
      });
    },
    [edges, onNodesChange, setNodes, takeSnapshot, triggerAutosave]
  );

  // Handle edges change
  const handleEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChange(changes);
      setEdges((current) => {
        takeSnapshot(nodes, current);
        triggerAutosave(nodes, current);
        return current;
      });
    },
    [nodes, onEdgesChange, setEdges, takeSnapshot, triggerAutosave]
  );

  // Handle edge connection
  const handleConnect = useCallback(
    (params: Connection) => {
      if (params.source === params.target) return; // Prevent loop to self

      const newEdge: WorkflowEdge = {
        id: generateId('edge'),
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
        animated: true,
        label:
          params.sourceHandle === 'true'
            ? 'TRUE'
            : params.sourceHandle === 'false'
            ? 'FALSE'
            : params.sourceHandle === 'loop_body'
            ? 'Loop Body'
            : params.sourceHandle === 'loop_done'
            ? 'Done'
            : undefined,
      };

      setEdges((eds) => {
        const updated = addEdge(newEdge as any, eds) as WorkflowEdge[];
        takeSnapshot(nodes, updated);
        triggerAutosave(nodes, updated);
        return updated;
      });
    },
    [nodes, setEdges, takeSnapshot, triggerAutosave]
  );

  // Add node to canvas
  const handleAddNode = useCallback(
    (type: NodeType, position?: { x: number; y: number }) => {
      const def = NODE_REGISTRY[type];
      const pos = position || {
        x: 200 + Math.random() * 80,
        y: 150 + Math.random() * 80,
      };

      const reactFlowType = def.reactFlowType || 'customNode';
      const newNode: WorkflowNode = {
        id: generateId('node'),
        type: reactFlowType,
        position: pos,
        data: {
          label: def.label,
          category: def.category,
          type: def.type,
          properties: { ...def.defaultProperties },
        },
      };

      setNodes((nds) => {
        const updated = [...nds, newNode];
        takeSnapshot(updated, edges);
        triggerAutosave(updated, edges);
        return updated;
      });

      setSelectedNodeId(newNode.id);
      setIsPropertiesCollapsed(false);
    },
    [edges, setNodes, takeSnapshot, triggerAutosave]
  );

  // Duplicate node
  const handleDuplicateNode = useCallback(
    (node: WorkflowNode) => {
      const newNode: WorkflowNode = {
        ...node,
        id: generateId('node'),
        position: { x: node.position.x + 30, y: node.position.y + 30 },
        data: JSON.parse(JSON.stringify(node.data)),
      };

      setNodes((nds) => {
        const updated = [...nds, newNode];
        takeSnapshot(updated, edges);
        triggerAutosave(updated, edges);
        return updated;
      });

      setSelectedNodeId(newNode.id);
    },
    [edges, setNodes, takeSnapshot, triggerAutosave]
  );

  // Batch duplicate nodes (preserves internal edges between selected nodes)
  const handleDuplicateNodes = useCallback(
    (nodesToDup: WorkflowNode[]) => {
      if (!nodesToDup.length) return;

      const idMap = new Map<string, string>();
      const newNodes: WorkflowNode[] = nodesToDup.map((node) => {
        const newId = generateId('node');
        idMap.set(node.id, newId);
        return {
          ...node,
          id: newId,
          position: { x: node.position.x + 40, y: node.position.y + 40 },
          selected: true,
          data: JSON.parse(JSON.stringify(node.data)),
        };
      });

      const oldIdSet = new Set(nodesToDup.map((n) => n.id));
      const internalEdges = edges.filter((e) => oldIdSet.has(e.source) && oldIdSet.has(e.target));
      const newEdges: WorkflowEdge[] = internalEdges.map((e) => ({
        ...e,
        id: generateId('edge'),
        source: idMap.get(e.source) || e.source,
        target: idMap.get(e.target) || e.target,
      }));

      setNodes((nds) => {
        const updated = nds.map((n) => ({ ...n, selected: false })).concat(newNodes);
        setEdges((eds) => {
          const updatedEdges = eds.concat(newEdges);
          takeSnapshot(updated, updatedEdges);
          triggerAutosave(updated, updatedEdges);
          return updatedEdges;
        });
        return updated;
      });

      if (newNodes.length === 1) {
        setSelectedNodeId(newNodes[0].id);
      }
    },
    [edges, setEdges, setNodes, takeSnapshot, triggerAutosave]
  );

  // Copy nodes (single or multiple) to clipboard
  const handleCopyNodes = useCallback(
    (nodesToCopy: WorkflowNode[]) => {
      if (!nodesToCopy || nodesToCopy.length === 0) return;
      copyNodesToClipboard(nodesToCopy, edges);
      setClipboardRevision((r) => r + 1);
    },
    [edges]
  );

  // Paste nodes from clipboard
  const handlePasteNodes = useCallback(
    (targetPosition?: { x: number; y: number }) => {
      const payload = getCopiedNodesFromClipboard();
      if (!payload || !payload.nodes.length) return;

      const { newNodes, newEdges } = preparePastedNodes(payload, targetPosition);
      if (!newNodes.length) return;

      setNodes((nds) => {
        const updated = nds.map((n) => ({ ...n, selected: false })).concat(newNodes);
        setEdges((eds) => {
          const updatedEdges = eds.concat(newEdges);
          takeSnapshot(updated, updatedEdges);
          triggerAutosave(updated, updatedEdges);
          return updatedEdges;
        });
        return updated;
      });

      if (newNodes.length === 1) {
        setSelectedNodeId(newNodes[0].id);
        setIsPropertiesCollapsed(false);
      } else {
        setSelectedNodeId(null);
      }
    },
    [setEdges, setNodes, takeSnapshot, triggerAutosave]
  );

  // Delete node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const updatedNodes = nds.filter((n) => n.id !== nodeId);
        setEdges((eds) => {
          const updatedEdges = eds.filter((e) => e.source !== nodeId && e.target !== nodeId);
          takeSnapshot(updatedNodes, updatedEdges);
          triggerAutosave(updatedNodes, updatedEdges);
          return updatedEdges;
        });
        return updatedNodes;
      });

      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [selectedNodeId, setEdges, setNodes, takeSnapshot, triggerAutosave]
  );

  // Delete edge / connection
  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => {
        const updated = eds.filter((e) => e.id !== edgeId);
        takeSnapshot(nodes, updated);
        triggerAutosave(nodes, updated);
        return updated;
      });
    },
    [nodes, setEdges, takeSnapshot, triggerAutosave]
  );

  // Batch delete nodes
  const handleDeleteNodes = useCallback(
    (nodeIds: string[]) => {
      const idSet = new Set(nodeIds);
      setNodes((nds) => {
        const updatedNodes = nds.filter((n) => !idSet.has(n.id));
        setEdges((eds) => {
          const updatedEdges = eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target));
          takeSnapshot(updatedNodes, updatedEdges);
          triggerAutosave(updatedNodes, updatedEdges);
          return updatedEdges;
        });
        return updatedNodes;
      });

      if (selectedNodeId && idSet.has(selectedNodeId)) {
        setSelectedNodeId(null);
      }
    },
    [selectedNodeId, setEdges, setNodes, takeSnapshot, triggerAutosave]
  );

  // Toggle node disabled
  const handleToggleDisableNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const updated = nds.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              data: {
                ...n.data,
                disabled: !n.data.disabled,
              },
            };
          }
          return n;
        });
        takeSnapshot(updated, edges);
        triggerAutosave(updated, edges);
        return updated;
      });
    },
    [edges, setNodes, takeSnapshot, triggerAutosave]
  );

  // Batch toggle nodes disabled
  const handleToggleDisableNodes = useCallback(
    (nodeIds: string[]) => {
      const idSet = new Set(nodeIds);
      setNodes((nds) => {
        const updated = nds.map((n) => {
          if (idSet.has(n.id)) {
            return {
              ...n,
              data: {
                ...n.data,
                disabled: !n.data.disabled,
              },
            };
          }
          return n;
        });
        takeSnapshot(updated, edges);
        triggerAutosave(updated, edges);
        return updated;
      });
    },
    [edges, setNodes, takeSnapshot, triggerAutosave]
  );

  // Add node and immediately connect from a dragged handle
  const handleAddNodeAndConnect = useCallback(
    (
      type: NodeType,
      position: { x: number; y: number },
      connection: { sourceNodeId: string; sourceHandleId?: string | null; handleType: 'source' | 'target' }
    ) => {
      const def = NODE_REGISTRY[type];
      const reactFlowType = def.reactFlowType || 'customNode';
      const newNode: WorkflowNode = {
        id: generateId('node'),
        type: reactFlowType,
        position,
        data: {
          label: def.label,
          category: def.category,
          type: def.type,
          properties: { ...def.defaultProperties },
        },
      };

      let newEdge: WorkflowEdge;
      if (connection.handleType === 'target') {
        newEdge = {
          id: generateId('edge'),
          source: newNode.id,
          target: connection.sourceNodeId,
          targetHandle: connection.sourceHandleId || undefined,
          animated: true,
        };
      } else {
        newEdge = {
          id: generateId('edge'),
          source: connection.sourceNodeId,
          target: newNode.id,
          sourceHandle: connection.sourceHandleId || undefined,
          animated: true,
          label:
            connection.sourceHandleId === 'true'
              ? 'TRUE'
              : connection.sourceHandleId === 'false'
              ? 'FALSE'
              : connection.sourceHandleId === 'loop_body'
              ? 'Loop Body'
              : connection.sourceHandleId === 'loop_done'
              ? 'Done'
              : undefined,
        };
      }

      setNodes((nds) => {
        const updatedNodes = [...nds, newNode];
        setEdges((eds) => {
          const updatedEdges = addEdge(newEdge as any, eds) as WorkflowEdge[];
          takeSnapshot(updatedNodes, updatedEdges);
          triggerAutosave(updatedNodes, updatedEdges);
          return updatedEdges;
        });
        return updatedNodes;
      });

      setSelectedNodeId(newNode.id);
      setIsPropertiesCollapsed(false);
    },
    [setEdges, setNodes, takeSnapshot, triggerAutosave]
  );

  // Update node properties
  const handleUpdateProperties = useCallback(
    (nodeId: string, properties: Record<string, any>) => {
      setNodes((nds) => {
        const updated = nds.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              data: {
                ...n.data,
                properties,
              },
            };
          }
          return n;
        });
        takeSnapshot(updated, edges);
        triggerAutosave(updated, edges);
        return updated;
      });
    },
    [edges, setNodes, takeSnapshot, triggerAutosave]
  );

  // Update node label
  const handleUpdateLabel = useCallback(
    (nodeId: string, label: string) => {
      setNodes((nds) => {
        const updated = nds.map((n) => {
          if (n.id === nodeId) {
            return { ...n, data: { ...n.data, label } };
          }
          return n;
        });
        triggerAutosave(updated, edges);
        return updated;
      });
    },
    [edges, setNodes, triggerAutosave]
  );

  // Undo / Redo actions
  const handleUndo = useCallback(() => {
    const snap = undo();
    if (snap) {
      setNodes(snap.nodes);
      setEdges(snap.edges);
      triggerAutosave(snap.nodes, snap.edges);
    }
  }, [setEdges, setNodes, triggerAutosave, undo]);

  const handleRedo = useCallback(() => {
    const snap = redo();
    if (snap) {
      setNodes(snap.nodes);
      setEdges(snap.edges);
      triggerAutosave(snap.nodes, snap.edges);
    }
  }, [redo, setEdges, setNodes, triggerAutosave]);

  // Rename workflow
  const handleRenameWorkflow = useCallback(
    (name: string) => {
      triggerAutosave(nodes, edges, name);
    },
    [edges, nodes, triggerAutosave]
  );

  // Update workflow-level execution settings (Human Mode, pacing, cursor)
  const handleUpdateSettings = useCallback(
    (patch: Partial<WorkflowSettings>) => {
      // Optimistic local update so the toggle reacts instantly...
      setActiveWorkflow((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
      // ...then persist through the same debounced autosave path.
      triggerAutosave(nodes, edges, undefined, patch);
    },
    [edges, nodes, triggerAutosave]
  );

  const humanMode = activeWorkflow.settings?.humanMode === true;
  const humanIntensity: HumanIntensity = activeWorkflow.settings?.humanIntensity || 'natural';
  const humanCursor = activeWorkflow.settings?.humanCursor !== false;

  const handleToggleHumanMode = useCallback(() => {
    handleUpdateSettings({ humanMode: !humanMode });
  }, [handleUpdateSettings, humanMode]);

  const handleChangeHumanIntensity = useCallback(
    (intensity: HumanIntensity) => {
      handleUpdateSettings({ humanIntensity: intensity });
    },
    [handleUpdateSettings]
  );

  const handleToggleHumanCursor = useCallback(() => {
    handleUpdateSettings({ humanCursor: !humanCursor });
  }, [handleUpdateSettings, humanCursor]);

  // Execution: Run Workflow
  const handleRunWorkflow = useCallback(() => {
    setIsExecutionCollapsed(false);
    setExecutionLogs([]);
    setNodeStates({});

    const currentWorkflow: Workflow = {
      ...activeWorkflow,
      nodes,
      edges,
    };

    const engine = new WorkflowEngine(currentWorkflow, {
      onStatusChange: (status) => setExecutionStatus(status),
      onNodeStateChange: (id, state) => {
        setNodeStates((prev) => ({
          ...prev,
          [id]: { ...prev[id], ...state },
        }));
      },
      onLog: (log) => setExecutionLogs((prev) => [...prev, log]),
      onVariablesChange: (vars) => setLiveVariables(vars),
    });

    engineRef.current = engine;
    engine.run();
  }, [activeWorkflow, edges, nodes]);

  const handlePauseWorkflow = () => engineRef.current?.pause();
  const handleResumeWorkflow = () => engineRef.current?.resume();
  const handleStopWorkflow = () => engineRef.current?.stop();
  const handleStepWorkflow = () => {
    if (executionStatus === 'paused') {
      engineRef.current?.resume();
    } else {
      setIsExecutionCollapsed(false);
      const currentWorkflow: Workflow = { ...activeWorkflow, nodes, edges };
      const engine = new WorkflowEngine(currentWorkflow, {
        onStatusChange: (status) => setExecutionStatus(status),
        onNodeStateChange: (id, state) => {
          setNodeStates((prev) => ({ ...prev, [id]: { ...prev[id], ...state } }));
        },
        onLog: (log) => setExecutionLogs((prev) => [...prev, log]),
        onVariablesChange: (vars) => setLiveVariables(vars),
      });
      engineRef.current = engine;
      engine.run({ isStepMode: true });
    }
  };

  // Run single node debug
  const handleRunSingleNode = useCallback(
    async (node: WorkflowNode) => {
      setIsExecutionCollapsed(false);
      const engine = new WorkflowEngine(
        { ...activeWorkflow, nodes, edges },
        {
          onNodeStateChange: (id, state) => {
            setNodeStates((prev) => ({ ...prev, [id]: { ...prev[id], ...state } }));
          },
          onLog: (log) => setExecutionLogs((prev) => [...prev, log]),
          onVariablesChange: (vars) => setLiveVariables(vars),
        }
      );
      try {
        await engine.runSingleNode(node, liveVariables);
      } catch (err) {
        console.warn('Single node run error:', err);
      }
    },
    [activeWorkflow, edges, liveVariables, nodes]
  );

  // Element Picker Integration
  const handleStartElementPicker = useCallback(async (mode: 'single' | 'pattern_2click' = 'single') => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      setIsPickingElement(true);
      try {
        const res = await chrome.runtime.sendMessage({ type: 'START_ELEMENT_PICKER', payload: { mode } });
        if (res && !res.success) {
          setIsPickingElement(false);
          alert(res.error || 'Could not start Element Picker. Please ensure a webpage is open in another tab.');
        }
      } catch (err: any) {
        setIsPickingElement(false);
        alert(`Could not start Element Picker: ${err.message || String(err)}`);
      }
    } else {
      alert('Element Picker communicates directly with live webpages in Chrome/Edge.');
    }
  }, []);

  // Action Recorder Integration
  const handleToggleRecord = useCallback(async () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      if (!isRecording) {
        setIsRecording(true);
        lastRecordedNodeIdRef.current = null;
        try {
          const res = await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
          if (res && !res.success) {
            setIsRecording(false);
            alert(res.error || 'Could not start Recorder on target tab.');
          }
        } catch (err: any) {
          setIsRecording(false);
          alert(`Could not start Recorder: ${err.message || String(err)}`);
        }
      } else {
        setIsRecording(false);
        chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }).catch(() => {});
      }
    } else {
      alert('Recorder records real user interactions on open browser tabs.');
    }
  }, [isRecording]);

  // Extension Runtime Message Listener for Element Picker and Recorder
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

    const listener = (message: any) => {
      if (message.type === 'ELEMENT_PICKED') {
        const picked: ElementSelectionResult = message.payload;
        setIsPickingElement(false);

        if (selectedNodeId) {
          handleUpdateProperties(selectedNodeId, {
            selector: picked.selector,
            strategies: picked.strategies,
            tagName: picked.tagName,
            textSnippet: picked.textSnippet,
            ...(picked.patternMode
              ? {
                  patternMode: true,
                  patternMatchCount: picked.matchCount,
                  patternSampleTexts: picked.sampleTexts,
                  item1Selector: picked.item1Selector,
                  item2Selector: picked.item2Selector,
                }
              : {}),
          });
        }
      }

      if (message.type === 'PICKER_CANCELLED') {
        setIsPickingElement(false);
      }

      if (message.type === 'RECORDED_ACTION') {
        const action: RecordedActionPayload = message.payload;
        const def = NODE_REGISTRY[action.type];
        if (!def) return;

        setNodes((currentNodes) => {
          const lastNode = currentNodes[currentNodes.length - 1];
          const posX = lastNode ? lastNode.position.x : 250;
          const posY = lastNode ? lastNode.position.y + 130 : 100;

          const newNode: WorkflowNode = {
            id: generateId('rec_node'),
            type: def.reactFlowType || 'customNode',
            position: { x: posX, y: posY },
            data: {
              label: def.label,
              category: def.category,
              type: action.type,
              properties: {
                ...def.defaultProperties,
                ...action.properties,
              },
            },
          };

          const updatedNodes = [...currentNodes, newNode];

          // Auto-connect to previous node
          if (lastRecordedNodeIdRef.current) {
            const edge: WorkflowEdge = {
              id: generateId('rec_edge'),
              source: lastRecordedNodeIdRef.current,
              target: newNode.id,
              animated: true,
            };
            setEdges((eds) => [...eds, edge]);
          } else if (lastNode) {
            const edge: WorkflowEdge = {
              id: generateId('rec_edge'),
              source: lastNode.id,
              target: newNode.id,
              animated: true,
            };
            setEdges((eds) => [...eds, edge]);
          }

          lastRecordedNodeIdRef.current = newNode.id;
          return updatedNodes;
        });
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [handleUpdateProperties, selectedNodeId, setEdges, setNodes]);

  // Export JSON
  const handleExport = useCallback(() => {
    const currentWorkflow: Workflow = { ...activeWorkflow, nodes, edges };
    const jsonStr = exportWorkflowJson(currentWorkflow);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeWorkflow.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_workflow.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeWorkflow, edges, nodes]);

  // Import JSON
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const imported = validateAndParseWorkflow(text);
        await saveWorkflow(imported);
        setWorkflows((prev) => [imported, ...prev]);
        setActiveWorkflow(imported);
        setNodes(imported.nodes);
        setEdges(imported.edges);
        resetHistory(imported.nodes, imported.edges);
        setSelectedNodeId(null);
      } catch (err: any) {
        alert(`Failed to import workflow: ${err.message}`);
      }
    };
    input.click();
  }, [resetHistory, setEdges, setNodes]);

  // AI Workflow Synthesis Handlers
  const handleApplyAiWorkflow = useCallback(
    (newNodes: WorkflowNode[], newEdges: WorkflowEdge[], summary?: string) => {
      setNodes(newNodes);
      setEdges(newEdges);
      takeSnapshot(newNodes, newEdges);
      triggerAutosave(newNodes, newEdges);
      setSelectedNodeId(null);
    },
    [setEdges, setNodes, takeSnapshot, triggerAutosave]
  );

  const handleAppendAiNodes = useCallback(
    (newNodes: WorkflowNode[], newEdges: WorkflowEdge[], targetNodeId?: string) => {
      setNodes((currentNodes) => {
        const lastNode = targetNodeId
          ? currentNodes.find((n) => n.id === targetNodeId) || currentNodes[currentNodes.length - 1]
          : currentNodes[currentNodes.length - 1];

        const updatedNodes = [...currentNodes, ...newNodes];

        setEdges((currentEdges) => {
          const connectingEdges = [...currentEdges, ...newEdges];
          if (lastNode && newNodes.length > 0) {
            connectingEdges.push({
              id: generateId('ai_edge'),
              source: lastNode.id,
              target: newNodes[0].id,
              animated: true,
            });
          }
          takeSnapshot(updatedNodes, connectingEdges);
          triggerAutosave(updatedNodes, connectingEdges);
          return connectingEdges;
        });

        return updatedNodes;
      });
    },
    [setEdges, setNodes, takeSnapshot, triggerAutosave]
  );

  // Auto-Layout / Tidy Nodes callback
  const handleAutoLayout = useCallback(() => {
    setNodes((currentNodes) => {
      if (currentNodes.length === 0) return currentNodes;
      const layoutedNodes = autoLayoutNodes(currentNodes, edges, { direction: 'TB' });
      takeSnapshot(layoutedNodes, edges);
      triggerAutosave(layoutedNodes, edges);
      return layoutedNodes;
    });
  }, [edges, setNodes, takeSnapshot, triggerAutosave]);


  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunWorkflow();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleToggleRecord();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const toCopy = nodes.filter((n) => n.selected);
        if (toCopy.length > 0) {
          e.preventDefault();
          handleCopyNodes(toCopy);
        } else if (selectedNodeId) {
          const target = nodes.find((n) => n.id === selectedNodeId);
          if (target) {
            e.preventDefault();
            handleCopyNodes([target]);
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (hasCopiedNodes()) {
          e.preventDefault();
          handlePasteNodes();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const toDelete = nodes.filter((n) => n.selected);
        if (toDelete.length > 0) {
          e.preventDefault();
          handleDeleteNodes(toDelete.map((n) => n.id));
        } else if (selectedNodeId) {
          e.preventDefault();
          handleDeleteNode(selectedNodeId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCopyNodes, handleDeleteNode, handleDeleteNodes, handlePasteNodes, handleRedo, handleRunWorkflow, handleToggleRecord, handleUndo, nodes, selectedNodeId]);

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedNode = (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : (selectedNodes.length === 1 ? selectedNodes[0] : null)) || null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0c0e14]">
      {/* Top Header Bar */}
      <HeaderBar
        workflowName={activeWorkflow.name}
        isSaving={isSaving}
        executionStatus={executionStatus}
        isRecording={isRecording}
        canUndo={canUndo}
        canRedo={canRedo}
        humanMode={humanMode}
        humanIntensity={humanIntensity}
        humanCursor={humanCursor}
        onToggleHumanMode={handleToggleHumanMode}
        onChangeHumanIntensity={handleChangeHumanIntensity}
        onToggleHumanCursor={handleToggleHumanCursor}
        onRenameWorkflow={handleRenameWorkflow}
        onRun={handleRunWorkflow}
        onPause={handlePauseWorkflow}
        onResume={handleResumeWorkflow}
        onStep={handleStepWorkflow}
        onStop={handleStopWorkflow}
        onToggleRecord={handleToggleRecord}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenWorkflows={() => setIsWorkflowsModalOpen(true)}
        onOpenBotCredentials={() => setIsBotCredentialsModalOpen(true)}
        onExport={handleExport}
        onImport={handleImport}
        onFitView={() => {}}
        onToggleAiCopilot={() => setIsAiCopilotOpen(!isAiCopilotOpen)}
        isAiCopilotOpen={isAiCopilotOpen}
        onOpenBrowserAgent={() => setIsBrowserAgentOpen(true)}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Node Library */}
        <NodeLibrary
          onAddNode={handleAddNode}
          isCollapsed={isLibraryCollapsed}
          onToggleCollapse={() => setIsLibraryCollapsed(!isLibraryCollapsed)}
        />

        {/* Center: React Flow Canvas */}
        <main className="flex-1 h-full relative overflow-hidden">
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            nodeStates={nodeStates}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onSelectNode={(node) => {
              setSelectedNodeId(node ? node.id : null);
              if (node) setIsPropertiesCollapsed(false);
            }}
            onAddNode={handleAddNode}
            onAddNodeAndConnect={handleAddNodeAndConnect}
            onDuplicateNode={handleDuplicateNode}
            onDuplicateNodes={handleDuplicateNodes}
            onCopyNode={(node) => handleCopyNodes([node])}
            onCopyNodes={handleCopyNodes}
            onPasteNodes={handlePasteNodes}
            canPaste={clipboardRevision >= 0 && hasCopiedNodes()}
            onDeleteNode={handleDeleteNode}
            onDeleteNodes={handleDeleteNodes}
            onDeleteEdge={handleDeleteEdge}
            onToggleDisableNode={handleToggleDisableNode}
            onToggleDisableNodes={handleToggleDisableNodes}
            onRunNode={(id) => {
              const target = nodes.find((n) => n.id === id);
              if (target) handleRunSingleNode(target);
            }}
            onAutoLayout={handleAutoLayout}
          />
        </main>

        {/* Right: Properties Panel */}
        {!isPropertiesCollapsed && (selectedNode || selectedNodes.length > 1) && (
          <ErrorBoundary fallbackTitle="Properties Panel Error" onReset={() => setSelectedNodeId(null)}>
            <PropertiesPanel
              selectedNode={selectedNode}
              selectedNodes={selectedNodes}
              runtimeState={selectedNode ? nodeStates[selectedNode.id] : undefined}
              variables={liveVariables}
              onUpdateProperties={handleUpdateProperties}
              onUpdateLabel={handleUpdateLabel}
              onToggleDisable={handleToggleDisableNode}
              onToggleDisableNodes={handleToggleDisableNodes}
              onDeleteNode={handleDeleteNode}
              onDeleteNodes={handleDeleteNodes}
              onCopyNode={(node) => handleCopyNodes([node])}
              onCopyNodes={handleCopyNodes}
              onDuplicateNodes={handleDuplicateNodes}
              onRunSingleNode={handleRunSingleNode}
              onStartElementPicker={handleStartElementPicker}
              isPickingElement={isPickingElement}
              onClose={() => setIsPropertiesCollapsed(true)}
              allNodes={nodes}
            />
          </ErrorBoundary>
        )}
      </div>

      {/* Bottom: Execution & Logs Panel */}
      <ExecutionPanel
        logs={executionLogs}
        variables={liveVariables}
        isCollapsed={isExecutionCollapsed}
        onToggleCollapse={() => setIsExecutionCollapsed(!isExecutionCollapsed)}
        onClearLogs={() => setExecutionLogs([])}
        onSelectNode={(id) => setSelectedNodeId(id)}
      />

      {/* Workflows Management Modal */}
      <WorkflowListModal
        isOpen={isWorkflowsModalOpen}
        workflows={workflows}
        activeWorkflowId={activeWorkflow.id}
        onClose={() => setIsWorkflowsModalOpen(false)}
        onSelectWorkflow={(id) => {
          const wf = workflows.find((w) => w.id === id);
          if (wf) {
            setActiveWorkflow(wf);
            setNodes(wf.nodes);
            setEdges(wf.edges);
            resetHistory(wf.nodes, wf.edges);
            setSelectedNodeId(null);
          }
        }}
        onCreateWorkflow={async () => {
          const newWf = await createNewWorkflow();
          setWorkflows((prev) => [newWf, ...prev]);
          setActiveWorkflow(newWf);
          setNodes(newWf.nodes);
          setEdges(newWf.edges);
          resetHistory(newWf.nodes, newWf.edges);
          setSelectedNodeId(null);
          setIsWorkflowsModalOpen(false);
        }}
        onDuplicateWorkflow={async (wf) => {
          const copy = await duplicateWorkflow(wf);
          setWorkflows((prev) => [copy, ...prev]);
        }}
        onDeleteWorkflow={async (id) => {
          await deleteWorkflow(id);
          const remaining = workflows.filter((w) => w.id !== id);
          setWorkflows(remaining);
          if (activeWorkflow.id === id && remaining.length > 0) {
            setActiveWorkflow(remaining[0]);
            setNodes(remaining[0].nodes);
            setEdges(remaining[0].edges);
            resetHistory(remaining[0].nodes, remaining[0].edges);
          }
        }}
        onResetTemplates={async () => {
          const fresh = await resetToOfficialTemplates();
          setWorkflows(fresh);
          const initial = fresh.find((w) => w.id === STARTER_WORKFLOW.id) || fresh[0];
          setActiveWorkflow(initial);
          setNodes(initial.nodes);
          setEdges(initial.edges);
          resetHistory(initial.nodes, initial.edges);
        }}
      />

      {/* AI Copilot Drawer */}
      <AiCopilotDrawer
        isOpen={isAiCopilotOpen}
        onClose={() => setIsAiCopilotOpen(false)}
        selectedNodeId={selectedNodeId}
        currentNodes={nodes}
        currentEdges={edges}
        onApplyWorkflow={handleApplyAiWorkflow}
        onAppendNodes={handleAppendAiNodes}
      />

      {/* Autonomous Browser Agent Modal (Vision-Powered) */}
      <BrowserAgentModal
        isOpen={isBrowserAgentOpen}
        onClose={() => setIsBrowserAgentOpen(false)}
        onApplyWorkflowToCanvas={(newNodes, newEdges) => {
          takeSnapshot(nodes, edges);
          setNodes(newNodes);
          setEdges(newEdges);
          triggerAutosave(newNodes, newEdges);
        }}
      />

      {/* Bot Credentials Management Modal (Telegram, Discord, Slack) */}
      <BotCredentialsModal
        isOpen={isBotCredentialsModalOpen}
        onClose={() => setIsBotCredentialsModalOpen(false)}
      />
    </div>
  );
};

