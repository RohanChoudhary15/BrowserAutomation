import React, { useEffect, useRef } from 'react';
import { Play, Copy, EyeOff, Eye, Trash2, Edit3, Plus, Maximize2, CheckSquare, ClipboardCopy, ClipboardPaste } from 'lucide-react';
import { WorkflowNode } from '../../types/workflow';

interface ContextMenuProps {
  x: number;
  y: number;
  node?: WorkflowNode | null;
  selectedNodesCount?: number;
  canPaste?: boolean;
  onClose: () => void;
  onRunNode?: (nodeId: string) => void;
  onCopyNode?: (node: WorkflowNode) => void;
  onCopySelected?: () => void;
  onPaste?: (pos: { x: number; y: number }) => void;
  onDuplicateNode?: (node: WorkflowNode) => void;
  onDuplicateSelected?: () => void;
  onToggleDisableNode?: (nodeId: string) => void;
  onToggleDisableSelected?: () => void;
  onDeleteNode?: (nodeId: string) => void;
  onDeleteSelected?: () => void;
  onAddNode?: (pos: { x: number; y: number }) => void;
  onFitView?: () => void;
  onSelectAll?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  node,
  selectedNodesCount = 0,
  canPaste = false,
  onClose,
  onRunNode,
  onCopyNode,
  onCopySelected,
  onPaste,
  onDuplicateNode,
  onDuplicateSelected,
  onToggleDisableNode,
  onToggleDisableSelected,
  onDeleteNode,
  onDeleteSelected,
  onAddNode,
  onFitView,
  onSelectAll,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{ left: `${x}px`, top: `${y}px` }}
      className="fixed z-50 min-w-[160px] bg-[#161a24] border border-[#232a3b] rounded-xl shadow-2xl p-1 text-xs text-gray-200 select-none backdrop-blur-md animate-in fade-in duration-100"
    >
      {selectedNodesCount > 1 ? (
        <>
          <div className="px-2.5 py-1 text-[10px] font-semibold text-indigo-400 border-b border-[#232a3b] mb-1">
            {selectedNodesCount} Nodes Selected
          </div>
          <button
            onClick={() => {
              onCopySelected?.();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#232a3b] text-left transition-colors"
          >
            <ClipboardCopy className="w-3.5 h-3.5 text-indigo-400" />
            <span>Copy ({selectedNodesCount})</span>
          </button>
          <button
            onClick={() => {
              onDuplicateSelected?.();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#232a3b] text-left transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-indigo-400" />
            <span>Duplicate ({selectedNodesCount})</span>
          </button>
          <button
            onClick={() => {
              onToggleDisableSelected?.();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#232a3b] text-left transition-colors"
          >
            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
            <span>Toggle Disable ({selectedNodesCount})</span>
          </button>
          <div className="h-[1px] bg-[#232a3b] my-1" />
          {node && (
            <button
              onClick={() => {
                onDeleteNode?.(node.id);
                onClose();
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 text-left transition-colors"
              title="Delete this node (Alt+Click)"
            >
              <div className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Node</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Alt+Click</span>
            </button>
          )}
          <button
            onClick={() => {
              onDeleteSelected?.();
              onClose();
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 text-left transition-colors"
          >
            <div className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Delete ({selectedNodesCount})</span>
            </div>
            <span className="text-[10px] text-gray-500 font-mono">Del</span>
          </button>
        </>
      ) : node ? (
        <>
          <button
            onClick={() => {
              onRunNode?.(node.id);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#232a3b] hover:text-emerald-400 text-left transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Node</span>
          </button>
          <button
            onClick={() => {
              onCopyNode?.(node);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#232a3b] text-left transition-colors"
          >
            <ClipboardCopy className="w-3.5 h-3.5 text-indigo-400" />
            <span>Copy Node</span>
          </button>
          <button
            onClick={() => {
              onDuplicateNode?.(node);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#232a3b] text-left transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>
          <button
            onClick={() => {
              onToggleDisableNode?.(node.id);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#232a3b] text-left transition-colors"
          >
            {node.data.disabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{node.data.disabled ? 'Enable Node' : 'Disable Node'}</span>
          </button>
          <div className="h-[1px] bg-[#232a3b] my-1" />
          <button
            onClick={() => {
              onDeleteNode?.(node.id);
              onClose();
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 text-left transition-colors"
            title="Delete this node (Alt+Click or Del)"
          >
            <div className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Node</span>
            </div>
            <span className="text-[10px] text-gray-500 font-mono">Alt+Click</span>
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => {
              onAddNode?.({ x, y });
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#232a3b] text-left transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Node...</span>
          </button>
          {canPaste && (
            <button
              onClick={() => {
                onPaste?.({ x, y });
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#232a3b] text-indigo-300 text-left transition-colors"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Paste Nodes</span>
            </button>
          )}
          <button
            onClick={() => {
              onFitView?.();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#232a3b] text-left transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit View</span>
          </button>
          <button
            onClick={() => {
              onSelectAll?.();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#232a3b] text-left transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Select All</span>
          </button>
        </>
      )}
    </div>
  );
};
