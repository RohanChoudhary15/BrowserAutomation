import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Icon } from '../components/common/Icon';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import { Loader2, CheckCircle2, AlertCircle, Play, Trash2 } from 'lucide-react';

export interface ContainsNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

/**
 * Branching logic node that checks whether a particular element (or text)
 * is present on the current web page. Emits TRUE when found, FALSE otherwise.
 */
export const ContainsNode: React.FC<ContainsNodeProps> = memo(({ id, data, selected }) => {
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');

  const selector = data.properties?.selector || '';
  const matchMode = data.properties?.matchMode || 'element';
  const text = data.properties?.text || '';

  let summary = '';
  if (selector) {
    summary = matchMode === 'text' && text ? `${selector} contains "${text}"` : selector;
  }

  // Live TRUE/FALSE result badge after a run
  const present = runtime?.output?.present;
  const hasResult = typeof present === 'boolean';

  let borderClass = 'border-[#232a3b] hover:border-purple-500/60';
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-purple-500 ring-2 ring-purple-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(168,85,247,0.4)]';
  } else if (status === 'success') {
    borderClass = 'border-emerald-500 ring-1 ring-emerald-500/40';
  } else if (status === 'error') {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/40';
  } else if (selected) {
    borderClass = 'border-purple-500 ring-2 ring-purple-500/50';
    glowClass = 'shadow-[0_0_12px_rgba(168,85,247,0.3)]';
  }

  return (
    <div
      onClick={(e) => {
        if (e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          data.onDeleteNode?.(id);
        }
      }}
      className={`group relative min-w-[220px] max-w-[270px] rounded-xl bg-[#11141c] p-3 text-xs text-gray-200 border transition-all duration-150 ${borderClass} ${glowClass} ${
        data.disabled ? 'opacity-50 grayscale' : ''
      }`}
    >
      {/* Top Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[#323c52] !border-2 !border-[#11141c] hover:!bg-purple-400"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-6 h-6 rounded-lg bg-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm">
            <Icon name="SearchCheck" className="w-3.5 h-3.5" />
          </div>
          <div className="truncate font-semibold text-gray-100">{data.label || 'Contains'}</div>
        </div>

        <div className="shrink-0 flex items-center gap-1">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
          {status === 'idle' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onRunNode?.(id);
              }}
              title="Run this node"
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-purple-400 transition-all"
            >
              <Play className="w-3 h-3 fill-current" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onDeleteNode?.(id);
            }}
            title="Delete this node (Alt+Click)"
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-all"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Selector Summary */}
      <div
        className="bg-[#161a24] rounded-md px-2 py-1 text-[11px] text-gray-400 font-mono truncate border border-[#1c2230] mb-3"
        title={selector}
      >
        {summary || 'Select an element...'}
      </div>

      {/* Branch Labels and Handles */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1c2230] px-1 text-[10px] font-semibold">
        <div className="flex items-center gap-1 text-emerald-400">
          <span>TRUE</span>
          {hasResult && present === true && (
            <span className="px-1 rounded bg-emerald-500/20 border border-emerald-500/30 text-[9px]">hit</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-rose-400">
          {hasResult && present === false && (
            <span className="px-1 rounded bg-rose-500/20 border border-rose-500/30 text-[9px]">miss</span>
          )}
          <span>FALSE</span>
        </div>
      </div>

      {/* Branch Source Handles */}
      <Handle
        id="true"
        type="source"
        position={Position.Bottom}
        style={{ left: '25%' }}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-[#11141c] hover:!bg-emerald-400"
      />
      <Handle
        id="false"
        type="source"
        position={Position.Bottom}
        style={{ left: '75%' }}
        className="!w-3 !h-3 !bg-rose-500 !border-2 !border-[#11141c] hover:!bg-rose-400"
      />
    </div>
  );
});