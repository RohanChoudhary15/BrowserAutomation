import React, { useEffect, useRef } from 'react';
import { Play, Copy, EyeOff, Eye, Trash2, Edit3, Plus, Maximize2, CheckSquare } from 'lucide-react';
import { WorkflowNode } from '../../types/workflow';

interface ContextMenuProps {
  x: number;
  y: number;
  node?: WorkflowNode | null;
  onClose: () => void;
  onRunNode?: (nodeId: string) => void;
  onDuplicateNode?: (node: WorkflowNode) => void;
  onToggleDisableNode?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  onAddNode?: (pos: { x: number; y: number }) => void;
  onFitView?: () => void;
  onSelectAll?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  node,
  onClose,
  onRunNode,
  onDuplicateNode,
  onToggleDisableNode,
  onDeleteNode,
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
      {node ? (
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
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 text-left transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
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
