import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import { Layers, Play, Trash2, CheckCircle2, AlertCircle, Loader2, Filter, GitMerge, FileSpreadsheet } from 'lucide-react';

export interface CombineDatasetsNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

export const CombineDatasetsNode: React.FC<CombineDatasetsNodeProps> = memo(({ id, data, selected }) => {
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');
  const props = data.properties || {};

  const mode = props.mode || 'union';
  const dedup = props.deduplicate !== false;
  const outVar = props.outputVariable || 'combinedDataset';
  const rowCount = runtime?.output?.rowCount ?? runtime?.output?.items?.length;

  let borderClass = 'border-[#232a3b] hover:border-pink-500/60';
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-pink-500 ring-2 ring-pink-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(236,72,153,0.4)]';
  } else if (status === 'success') {
    borderClass = 'border-emerald-500 ring-1 ring-emerald-500/40';
  } else if (status === 'error') {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(244,63,94,0.3)]';
  } else if (selected) {
    borderClass = 'border-pink-500 ring-2 ring-pink-500/50';
    glowClass = 'shadow-[0_0_15px_rgba(236,72,153,0.3)]';
  }

  return (
    <div
      className={`group relative min-w-[220px] max-w-[270px] rounded-xl bg-[#0f111a] p-3 text-xs text-gray-200 border transition-all duration-150 ${borderClass} ${glowClass} ${
        data.disabled ? 'opacity-50 grayscale' : ''
      }`}
    >
      {/* Target Handle (Left or Top for converging inputs) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[#ec4899] !border-2 !border-[#0f111a] hover:!bg-pink-300 transition-colors"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white shrink-0 shadow-sm">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div className="truncate font-semibold text-gray-100">{data.label || 'Combine Datasets'}</div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-1 shrink-0">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 text-pink-400 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
        </div>
      </div>

      {/* Mode & Dedup Badges */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/30 font-medium capitalize">
          {mode.replace('_', ' ')}
        </span>
        {dedup && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium flex items-center gap-1">
            <Filter className="w-2.5 h-2.5" /> Dedup on
          </span>
        )}
      </div>

      {/* Summary info / Live counts */}
      <div className="rounded-lg bg-[#141824] p-2 border border-[#202738] space-y-1 text-[11px]">
        <div className="flex items-center justify-between text-gray-400">
          <span>Target Variable:</span>
          <span className="font-mono text-pink-400 truncate max-w-[110px]">
            &#123;&#123;{outVar}&#125;&#125;
          </span>
        </div>
        {typeof rowCount === 'number' && (
          <div className="flex items-center justify-between text-gray-300 font-medium pt-0.5 border-t border-[#202738]">
            <span className="flex items-center gap-1 text-emerald-400">
              <FileSpreadsheet className="w-3 h-3" /> Merged Rows:
            </span>
            <span className="font-bold text-white">{rowCount}</span>
          </div>
        )}
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
            title="Execute Combine Datasets"
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
        className="!w-3 !h-3 !bg-[#ec4899] !border-2 !border-[#0f111a] hover:!bg-pink-300 transition-colors"
      />
    </div>
  );
});
