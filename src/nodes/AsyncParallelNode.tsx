import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import { Zap, Play, Trash2, CheckCircle2, AlertCircle, Loader2, Gauge, Timer, GitFork, Plus, GripVertical } from 'lucide-react';

export interface AsyncParallelNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

export const AsyncParallelNode: React.FC<AsyncParallelNodeProps> = memo(({ id, data, selected }) => {
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');
  const props = data.properties || {};

  const mode = props.mode || 'all';
  const branches: Array<{ id: string; name: string }> = props.branches?.length
    ? props.branches
    : [
        { id: 'branch_1', name: 'Branch 1' },
        { id: 'branch_2', name: 'Branch 2' },
      ];
  const maxConcurrency = props.maxConcurrency || 0;
  const timeoutMs = props.timeoutMs || 30000;
  const outVar = props.outputVariable || 'parallelResults';

  let borderClass = 'border-[#232a3b] hover:border-amber-500/60';
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-amber-400 ring-2 ring-amber-400/40';
    glowClass = 'shadow-[0_0_16px_rgba(251,191,36,0.4)]';
  } else if (status === 'success') {
    borderClass = 'border-emerald-500 ring-1 ring-emerald-500/40';
  } else if (status === 'error') {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(244,63,94,0.3)]';
  } else if (selected) {
    borderClass = 'border-amber-400 ring-2 ring-amber-400/50';
    glowClass = 'shadow-[0_0_14px_rgba(251,191,36,0.3)]';
  }

  return (
    <div
      className={`group relative min-w-[240px] max-w-[320px] rounded-xl bg-[#0e111a] p-3 text-xs text-gray-200 border transition-all duration-150 ${borderClass} ${glowClass} ${
        data.disabled ? 'opacity-50 grayscale' : ''
      }`}
    >
      {/* Target Handle (Top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[#f59e0b] !border-2 !border-[#0e111a] hover:!bg-amber-300 transition-colors"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shrink-0 shadow-sm">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div className="truncate font-semibold text-gray-100">{data.label || 'Async Parallel'}</div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-1 shrink-0">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
        </div>
      </div>

      {/* Mode & Configuration Badges */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold tracking-wide uppercase">
          {mode === 'all' ? 'Promise.all' : mode === 'settled' ? 'All Settled' : 'Race'}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium flex items-center gap-1">
          <GitFork className="w-2.5 h-2.5" /> {branches.length} branches
        </span>
        {maxConcurrency > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 flex items-center gap-0.5">
            <Gauge className="w-2.5 h-2.5 text-amber-400" /> {maxConcurrency} max
          </span>
        )}
      </div>

      {/* Target Variable & Info */}
      <div className="rounded-lg bg-[#141824] p-2 border border-[#202738] space-y-1 text-[11px] mb-2.5">
        <div className="flex items-center justify-between text-gray-400">
          <span>Results Target:</span>
          <span className="font-mono text-amber-400 truncate max-w-[120px]">
            &#123;&#123;{outVar}&#125;&#125;
          </span>
        </div>
        <div className="flex items-center justify-between text-gray-400 text-[10px]">
          <span className="flex items-center gap-1">
            <Timer className="w-2.5 h-2.5 text-gray-500" /> Timeout:
          </span>
          <span className="font-mono text-gray-300">{(timeoutMs / 1000).toFixed(0)}s</span>
        </div>
      </div>

      {/* Quick Action buttons */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1c2233] mb-2 text-[10px] text-gray-400">
        <span className="font-medium text-amber-300/80">Parallel Outgoing Lanes</span>
        <div className="flex items-center gap-1">
          {data.onRunNode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onRunNode?.(id);
              }}
              className="p-1 hover:bg-[#1a2030] text-gray-400 hover:text-amber-400 rounded transition-colors"
              title="Execute Parallel Branches"
            >
              <Play className="w-3 h-3 fill-current" />
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
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Branch Node Addition */}
      <div className="space-y-1.5 pt-1.5 border-t border-[#1c2233] mb-2">
        <div className="flex items-center justify-between text-[10px] text-amber-400 font-semibold px-0.5">
          <span className="flex items-center gap-1">
            <GitFork className="w-3 h-3 text-amber-400" />
            <span>Branch Nodes</span>
          </span>
          <span className="text-[9px] text-gray-500 font-mono">click + or drag</span>
        </div>

        <div className="space-y-1">
          {branches.map((b) => (
            <div
              key={b.id}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData('application/autoflow-node', 'navigate');
                e.dataTransfer.setData('application/autoflow-source-node', id);
                e.dataTransfer.setData('application/autoflow-source-handle', b.id);
                e.dataTransfer.effectAllowed = 'copyMove';
              }}
              className="flex items-center justify-between gap-1.5 py-1 px-2 rounded-lg bg-[#141824] hover:bg-[#1a2030] border border-[#202738] hover:border-amber-500/40 text-[10px] text-gray-300 cursor-grab active:cursor-grabbing select-none transition-all group/branch"
              title={`Drag to add node for ${b.name}, or click + button`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <GripVertical className="w-3 h-3 text-gray-500 group-hover/branch:text-amber-400 shrink-0" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="font-medium text-white truncate">{b.name}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent('autoflow:add-branch-node', {
                      detail: {
                        branchId: b.id,
                        branchName: b.name,
                        sourceNodeId: id,
                        handleId: b.id,
                      },
                    })
                  );
                }}
                className="p-0.5 rounded bg-amber-600/30 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/40 transition-colors flex items-center gap-0.5 px-1.5 shrink-0"
                title={`Quick add node connected to ${b.name}`}
              >
                <Plus className="w-2.5 h-2.5" />
                <span className="text-[9px] font-semibold">Add Node</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Branch Labels Header */}
      <div className="flex items-center justify-between px-1 text-[10px] text-gray-300 font-mono pb-1">
        {branches.map((b) => (
          <span key={b.id} className="truncate max-w-[80px] text-amber-400/90 font-medium">
            {b.name}
          </span>
        ))}
      </div>

      {/* Dynamic Branch Handles along bottom */}
      {branches.map((b, idx) => {
        const leftPercent = ((idx + 1) / (branches.length + 1)) * 100;
        return (
          <Handle
            key={b.id}
            id={b.id}
            type="source"
            position={Position.Bottom}
            style={{ left: `${leftPercent}%` }}
            className="!w-3 !h-3 !bg-[#f59e0b] !border-2 !border-[#0e111a] hover:!bg-amber-300 transition-colors"
            title={`Branch: ${b.name}`}
          />
        );
      })}
    </div>
  );
});

AsyncParallelNode.displayName = 'AsyncParallelNode';
