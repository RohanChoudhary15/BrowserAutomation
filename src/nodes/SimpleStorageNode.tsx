import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import {
  Archive,
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  Layers,
  FileText,
  Image as ImageIcon,
  KeyRound,
  HardDrive,
} from 'lucide-react';

export interface SimpleStorageNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

export const SimpleStorageNode: React.FC<SimpleStorageNodeProps> = memo(({ id, data, selected }) => {
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');
  const props = data.properties || {};

  const action = (props.action || 'set').toUpperCase();
  const entryType = props.entryType || 'array';
  const key = props.key || 'myItems';
  const scope = props.scope || 'workflow';

  // Entry type styling
  const typeIcons: Record<string, any> = {
    array: Layers,
    dictionary: Database,
    variable: KeyRound,
    image: ImageIcon,
    document: FileText,
  };
  const TypeIcon = typeIcons[entryType] || Database;

  let borderClass = 'border-[#232a3b] hover:border-emerald-500/60';
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-emerald-400 ring-2 ring-emerald-400/40';
    glowClass = 'shadow-[0_0_15px_rgba(52,211,153,0.4)]';
  } else if (status === 'success') {
    borderClass = 'border-emerald-500 ring-1 ring-emerald-500/40';
  } else if (status === 'error') {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(244,63,94,0.3)]';
  } else if (selected) {
    borderClass = 'border-emerald-400 ring-2 ring-emerald-400/50';
    glowClass = 'shadow-[0_0_14px_rgba(52,211,153,0.3)]';
  }

  return (
    <div
      className={`group relative min-w-[220px] max-w-[270px] rounded-xl bg-[#0f111a] p-3 text-xs text-gray-200 border transition-all duration-150 ${borderClass} ${glowClass} ${
        data.disabled ? 'opacity-50 grayscale' : ''
      }`}
    >
      {/* Target Handle (Top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[#10b981] !border-2 !border-[#0f111a] hover:!bg-emerald-300 transition-colors"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-sm">
            <Archive className="w-3.5 h-3.5" />
          </div>
          <div className="truncate font-semibold text-gray-100">{data.label || 'Simple Storage'}</div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-1 shrink-0">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
        </div>
      </div>

      {/* Action & Entry Type Badges */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold uppercase tracking-wider">
          {action}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30 font-medium capitalize flex items-center gap-1">
          <TypeIcon className="w-2.5 h-2.5" /> {entryType}
        </span>
        {scope === 'persistent' && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium flex items-center gap-1">
            <HardDrive className="w-2.5 h-2.5" /> Persistent
          </span>
        )}
      </div>

      {/* Storage Key details */}
      <div className="rounded-lg bg-[#141824] p-2 border border-[#202738] space-y-1 text-[11px]">
        <div className="flex items-center justify-between text-gray-400">
          <span>Key:</span>
          <span className="font-mono text-emerald-400 truncate max-w-[120px] font-semibold">
            {key}
          </span>
        </div>
        <div className="flex items-center justify-between text-gray-500 text-[10px]">
          <span>Cross-Node Ref:</span>
          <span className="font-mono text-gray-400">&#123;&#123;{key}&#125;&#125;</span>
        </div>
      </div>

      {/* Quick Action buttons */}
      <div className="flex items-center justify-end gap-1 mt-2.5 pt-1.5 border-t border-[#1c2233]">
        {data.onRunNode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onRunNode?.(id);
            }}
            className="p-1 hover:bg-[#1a2030] text-gray-400 hover:text-emerald-400 rounded transition-colors"
            title="Execute Storage Action"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
        )}
        {data.onDeleteNode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onDeleteNode?.(id);
            }}
            className="p-1 hover:bg-[#1a2030] text-gray-400 hover:text-rose-400 rounded transition-colors"
            title="Delete Node"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Source Handle (Bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-[#10b981] !border-2 !border-[#0f111a] hover:!bg-emerald-300 transition-colors"
      />
    </div>
  );
});

SimpleStorageNode.displayName = 'SimpleStorageNode';
