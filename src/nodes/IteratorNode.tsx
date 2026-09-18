import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Icon } from '../components/common/Icon';
import { NODE_REGISTRY, CATEGORIES } from './registry';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import { Play, CheckCircle2, AlertCircle, Loader2, Repeat } from 'lucide-react';

export interface IteratorNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
  };
}

export const IteratorNode: React.FC<IteratorNodeProps> = memo(({ id, data, selected }) => {
  const def = NODE_REGISTRY[data.type] || {
    label: data.label || 'Collection',
    icon: 'ListChecks',
    category: 'extraction',
    description: '',
  };

  const category = CATEGORIES.find(c => c.id === data.category) || CATEGORIES[0];
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');

  const isImageNode = data.type === 'extract_all_images' || data.type === 'extract_image';
  const forEachLabel = isImageNode ? 'For Each Image' : 'For Each Element';
  const itemVar = data.properties?.itemVariable || (isImageNode ? 'currentImage' : 'currentElement');

  let summary = '';
  if (data.type === 'extract_all_images') {
    summary = data.properties?.containerSelector
      ? `All images in ${data.properties.containerSelector}`
      : 'All images on page';
  } else if (data.properties?.selector) {
    summary = data.properties.selector;
  } else {
    summary = `Output: {{${data.properties?.outputVariable || 'items'}}}`;
  }

  // Status-specific border and glow
  let borderClass = 'border-[#232a3b] hover:border-indigo-500/60';
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-indigo-500 ring-2 ring-indigo-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(99,102,241,0.4)]';
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
      className={`group relative min-w-[230px] max-w-[280px] rounded-xl bg-[#11141c] p-3 text-xs text-gray-200 border transition-all duration-150 ${borderClass} ${glowClass} ${
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

        {/* Status Indicator */}
        <div className="shrink-0 flex items-center">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
          {status === 'idle' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onRunNode?.(id);
              }}
              title="Run this node"
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-indigo-400 transition-all"
            >
              <Play className="w-3 h-3 fill-current" />
            </button>
          )}
        </div>
      </div>

      {/* Summary preview */}
      {summary && (
        <div className="bg-[#161a24] rounded-md px-2 py-1 text-[11px] text-gray-400 font-mono truncate border border-[#1c2230] mb-2">
          {summary}
        </div>
      )}

      {/* Iterator variable badge */}
      <div className="flex items-center gap-1.5 mb-2.5 px-1 text-[10px] text-indigo-300 font-mono bg-indigo-950/40 border border-indigo-800/40 rounded py-0.5">
        <Repeat className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
        <span className="truncate">item: &#123;&#123;{itemVar}&#125;&#125;</span>
      </div>

      {/* Execution timing / Error message badge */}
      {runtime?.durationMs !== undefined && status === 'success' && (
        <div className="mb-2 text-[10px] text-emerald-400/80 font-mono">
          ✓ completed in {runtime.durationMs}ms
        </div>
      )}

      {runtime?.error && status === 'error' && (
        <div className="mb-2 text-[10px] text-rose-400 font-mono truncate" title={runtime.error}>
          ! {runtime.error}
        </div>
      )}

      {/* Output Handle Labels */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1c2230] px-1 text-[10px] font-semibold">
        <div className="text-indigo-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block"></span>
          <span>{forEachLabel}</span>
        </div>
        <div className="text-gray-400 flex items-center gap-1">
          <span>Done</span>
          <span className="w-1.5 h-1.5 rounded-full bg-gray-500 inline-block"></span>
        </div>
      </div>

      {/* Branch Source Handles */}
      <Handle
        id="loop_body"
        type="source"
        position={Position.Bottom}
        style={{ left: '28%' }}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-[#11141c] hover:!bg-indigo-400 transition-colors"
        title={`${forEachLabel} (iterates over collection)`}
      />
      <Handle
        id="loop_done"
        type="source"
        position={Position.Bottom}
        style={{ left: '72%' }}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-[#11141c] hover:!bg-gray-300 transition-colors"
        title="Done (continues when collection finishes)"
      />
    </div>
  );
});
