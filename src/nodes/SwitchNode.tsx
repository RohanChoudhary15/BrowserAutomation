import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import { Loader2, CheckCircle2, AlertCircle, Play, Trash2, GitFork } from 'lucide-react';

export interface SwitchCaseItem {
  id: string;
  value: string;
  label?: string;
}

export interface SwitchNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

export const SwitchNode: React.FC<SwitchNodeProps> = memo(({ id, data, selected }) => {
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');

  const expression = data.properties?.expression || '{{value}}';
  const rawCases: SwitchCaseItem[] = Array.isArray(data.properties?.cases)
    ? data.properties.cases
    : [
        { id: 'case_0', value: '1', label: 'Case 1' },
        { id: 'case_1', value: '2', label: 'Case 2' },
      ];

  const matchedBranch = runtime?.output?.matchedBranch || runtime?.output?.nextBranch;

  let borderClass = 'border-[#232a3b] hover:border-violet-500/60';
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-violet-500 ring-2 ring-violet-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(139,92,246,0.4)]';
  } else if (status === 'success') {
    borderClass = 'border-emerald-500 ring-1 ring-emerald-500/40';
  } else if (status === 'error') {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/40';
  } else if (selected) {
    borderClass = 'border-violet-500 ring-2 ring-violet-500/50';
    glowClass = 'shadow-[0_0_12px_rgba(139,92,246,0.3)]';
  }

  const allOutputs = [
    ...rawCases.map((c, i) => ({
      id: c.id || `case_${i}`,
      label: c.label || c.value || `Case ${i + 1}`,
      isDefault: false,
    })),
    {
      id: 'default',
      label: 'Default',
      isDefault: true,
    },
  ];

  return (
    <div
      className={`group relative min-w-[240px] max-w-[320px] rounded-xl bg-[#11141c] p-3 text-xs text-gray-200 border transition-all duration-150 ${borderClass} ${glowClass} ${
        data.disabled ? 'opacity-50 grayscale' : ''
      }`}
    >
      {/* Top Handle (Incoming Execution) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[#323c52] !border-2 !border-[#11141c] hover:!bg-violet-400"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center text-white shrink-0 shadow-sm">
            <GitFork className="w-3.5 h-3.5" />
          </div>
          <div className="truncate font-semibold text-gray-100">{data.label || 'Switch Case'}</div>
        </div>

        <div className="shrink-0 flex items-center gap-1">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
          {status === 'idle' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onRunNode?.(id);
              }}
              title="Run this node"
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-violet-400 transition-all"
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

      {/* Expression Preview */}
      <div className="bg-[#161a24] rounded-md px-2 py-1 text-[11px] text-gray-300 font-mono truncate border border-[#1c2230] mb-2.5">
        switch (<span className="text-violet-400">{expression}</span>)
      </div>

      {/* Branch Labels */}
      <div className="flex items-center justify-between pt-2 border-t border-[#1c2230] text-[10px] font-medium text-gray-400 gap-1 pb-1">
        {allOutputs.map((out) => {
          const isMatched = matchedBranch === out.id;
          return (
            <div
              key={out.id}
              className={`truncate text-center flex-1 px-1 py-0.5 rounded ${
                isMatched
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                  : out.isDefault
                  ? 'text-gray-400'
                  : 'text-violet-300'
              }`}
              title={out.label}
            >
              {out.label}
            </div>
          );
        })}
      </div>

      {/* Branch Handles */}
      {allOutputs.map((out, idx) => {
        const leftPercent = ((idx + 0.5) / allOutputs.length) * 100;
        return (
          <Handle
            key={out.id}
            id={out.id}
            type="source"
            position={Position.Bottom}
            style={{ left: `${leftPercent}%` }}
            className={`!w-3 !h-3 !border-2 !border-[#11141c] hover:scale-125 transition-transform ${
              out.isDefault
                ? '!bg-gray-400 hover:!bg-gray-300'
                : '!bg-violet-500 hover:!bg-violet-400'
            }`}
          />
        );
      })}
    </div>
  );
});

SwitchNode.displayName = 'SwitchNode';
