import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Icon } from '../components/common/Icon';
import { NODE_REGISTRY, CATEGORIES } from './registry';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import { Play, CheckCircle2, AlertCircle, Loader2, Trash2 } from 'lucide-react';

export interface CustomNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

export const BaseNode: React.FC<CustomNodeProps> = memo(({ id, data, selected }) => {
  const def = NODE_REGISTRY[data.type] || {
    label: data.label || 'Node',
    icon: 'Box',
    category: data.category || 'browser',
    description: '',
  };

  const category = CATEGORIES.find(c => c.id === data.category) || CATEGORIES[0];
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');

  // Summary of primary configuration
  let summary = '';
  if (data.properties?.url) summary = data.properties.url;
  else if (data.properties?.selector) summary = data.properties.selector;
  else if (data.properties?.text) summary = `"${data.properties.text}"`;
  else if (data.properties?.duration) summary = `${data.properties.duration}ms`;
  else if (data.properties?.name) summary = `name: ${data.properties.name}`;
  else if (data.properties?.leftValue) summary = `${data.properties.leftValue} ${data.properties.operator || '=='} ${data.properties.rightValue || ''}`;
  else if (data.properties?.code) summary = data.properties.code.slice(0, 30);
  else if (data.properties?.message) summary = `"${data.properties.message.slice(0, 28)}"`;
  else if (data.properties?.content) summary = `"${data.properties.content.slice(0, 28)}"`;

  // Status-specific border and glow
  let borderClass = 'border-[#232a3b] hover:border-[#3b82f6]/60';
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-blue-500 ring-2 ring-blue-500/30';
    glowClass = 'shadow-[0_0_15px_rgba(59,130,246,0.5)]';
  } else if (status === 'success') {
    borderClass = 'border-emerald-500 ring-1 ring-emerald-500/40';
  } else if (status === 'error') {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(244,63,94,0.3)]';
  } else if (selected) {
    borderClass = 'border-indigo-500 ring-2 ring-indigo-500/50';
    glowClass = 'shadow-[0_0_12px_rgba(99,102,241,0.3)]';
  }

  return (
    <div
      className={`group relative min-w-[210px] max-w-[260px] rounded-xl bg-[#11141c] p-3 text-xs text-gray-200 border transition-all duration-150 ${borderClass} ${glowClass} ${
        data.disabled ? 'opacity-50 grayscale' : ''
      }`}
    >
      {/* Target Handle (Input) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[#323c52] !border-2 !border-[#11141c] hover:!bg-indigo-400 transition-colors"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
            style={{ backgroundColor: category.color }}
          >
            <Icon name={def.icon} className="w-3.5 h-3.5" />
          </div>
          <div className="truncate font-semibold text-gray-100">{data.label || def.label}</div>
        </div>

        {/* Status Indicator & Quick Actions */}
        <div className="shrink-0 flex items-center gap-1">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
          {status === 'idle' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onRunNode?.(id);
              }}
              title="Run this node"
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-emerald-400 transition-all"
            >
              <Play className="w-3 h-3 fill-current" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onDeleteNode?.(id);
            }}
            title="Delete node (Del)"
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-all"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Summary preview */}
      {summary && (
        <div className="bg-[#161a24] rounded-md px-2 py-1 text-[11px] text-gray-400 font-mono truncate border border-[#1c2230]">
          {summary}
        </div>
      )}

      {/* Execution timing / Error message badge */}
      {runtime?.durationMs !== undefined && status === 'success' && (
        <div className="mt-1.5 text-[10px] text-emerald-400/80 font-mono">
          ✓ completed in {runtime.durationMs}ms
        </div>
      )}

      {runtime?.error && status === 'error' && (
        <div className="mt-1.5 text-[10px] text-rose-400 font-mono truncate" title={runtime.error}>
          ! {runtime.error}
        </div>
      )}

      {/* Source Handle (Output) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-[#323c52] !border-2 !border-[#11141c] hover:!bg-indigo-400 transition-colors"
      />
    </div>
  );
});
