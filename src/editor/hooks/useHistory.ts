import { useState, useCallback, useRef } from 'react';
import { WorkflowNode, WorkflowEdge } from '../../types/workflow';

interface HistorySnapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export function useHistory(initialNodes: WorkflowNode[], initialEdges: WorkflowEdge[]) {
  const [history, setHistory] = useState<HistorySnapshot[]>([
    { nodes: initialNodes, edges: initialEdges },
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isUndoRedoRef = useRef(false);

  const takeSnapshot = useCallback((nodes: WorkflowNode[], edges: WorkflowEdge[]) => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    setHistory(prev => {
      const nextHistory = prev.slice(0, currentIndex + 1);
      // Only add if changed
      const last = nextHistory[nextHistory.length - 1];
      if (
        last &&
        JSON.stringify(last.nodes) === JSON.stringify(nodes) &&
        JSON.stringify(last.edges) === JSON.stringify(edges)
      ) {
        return prev;
      }

      const updated = [...nextHistory, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }];
      if (updated.length > 50) updated.shift(); // Limit history to 50
      return updated;
    });

    setCurrentIndex(prev => Math.min(prev + 1, 49));
  }, [currentIndex]);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const undo = useCallback((): HistorySnapshot | null => {
    if (!canUndo) return null;
    isUndoRedoRef.current = true;
    const newIdx = currentIndex - 1;
    setCurrentIndex(newIdx);
    return history[newIdx];
  }, [canUndo, currentIndex, history]);

  const redo = useCallback((): HistorySnapshot | null => {
    if (!canRedo) return null;
    isUndoRedoRef.current = true;
    const newIdx = currentIndex + 1;
    setCurrentIndex(newIdx);
    return history[newIdx];
  }, [canRedo, currentIndex, history]);

  const resetHistory = useCallback((nodes: WorkflowNode[], edges: WorkflowEdge[]) => {
    setHistory([{ nodes, edges }]);
    setCurrentIndex(0);
  }, []);

  return {
    takeSnapshot,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  };
}
