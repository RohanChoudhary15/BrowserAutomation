import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Icon } from '../components/common/Icon';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import { Loader2, CheckCircle2, AlertCircle, Play, Trash2, GitMerge, GitFork, Ban, CircleSlash } from 'lucide-react';

export interface LogicGateNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

export const LogicGateNode: React.FC<LogicGateNodeProps> = memo(({ id, data, selected }) => {
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');

  // Gate type resolution
  const rawType = String(data.type || '').toLowerCase();
  let gate = String(data.properties?.gate || '').toUpperCase();
  if (!gate) {
    if (rawType.includes('and') && !rawType.includes('nand')) gate = 'AND';
    else if (rawType.includes('nand')) gate = 'NAND';
    else if (rawType.includes('nor')) gate = 'NOR';
    else gate = 'OR';
  }

  const gateConfig: Record<string, {
    label: string;
    icon: React.ReactNode;
    color: string;
    badgeBg: string;
    border: string;
    glow: string;
    formula: string;
  }> = {
    AND: {
      label: 'AND Gate',
      icon: <GitMerge className="w-3.5 h-3.5 text-white" />,
      color: 'bg-emerald-600',
      badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      border: 'border-emerald-500/40 hover:border-emerald-400',
      glow: 'shadow-[0_0_15px_rgba(16,185,129,0.35)]',
      formula: 'ALL incoming branches must be TRUE / complete',
    },
    OR: {
      label: 'OR Gate',
      icon: <GitFork className="w-3.5 h-3.5 text-white" />,
      color: 'bg-purple-600',
      badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      border: 'border-purple-500/40 hover:border-purple-400',
      glow: 'shadow-[0_0_15px_rgba(168,85,247,0.35)]',
      formula: 'ANY incoming branch continues (race condition)',
    },
    NAND: {
      label: 'NAND Gate',
      icon: <Ban className="w-3.5 h-3.5 text-white" />,
      color: 'bg-rose-600',
      badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      border: 'border-rose-500/40 hover:border-rose-400',
      glow: 'shadow-[0_0_15px_rgba(244,63,94,0.35)]',
      formula: 'Negated AND: Continues unless ALL branches are TRUE',
    },
    NOR: {
      label: 'NOR Gate',
      icon: <CircleSlash className="w-3.5 h-3.5 text-white" />,
      color: 'bg-amber-600',
      badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      border: 'border-amber-500/40 hover:border-amber-400',
      glow: 'shadow-[0_0_15px_rgba(245,158,11,0.35)]',
      formula: 'Negated OR: Continues only when ALL branches are FALSE',
    },
  };

  const currentGate = gateConfig[gate] || gateConfig.AND;

  // Runtime output inspection
  const outResult = runtime?.output?.result ?? runtime?.output;
  const hasResult = typeof outResult === 'boolean';

  let borderClass = currentGate.border;
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-indigo-500 ring-2 ring-indigo-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(99,102,241,0.4)]';
  } else if (status === 'success') {
    borderClass = hasResult && !outResult ? 'border-amber-500 ring-1 ring-amber-500/40' : 'border-emerald-500 ring-1 ring-emerald-500/40';
  } else if (status === 'error') {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/40';
  } else if (selected) {
    borderClass = 'border-indigo-500 ring-2 ring-indigo-500/50';
    glowClass = currentGate.glow;
  }

  return (
    <div
      className={`group relative min-w-[230px] max-w-[280px] rounded-xl bg-[#0f121a] p-3 text-xs text-gray-200 border transition-all duration-150 ${borderClass} ${glowClass} ${
        data.disabled ? 'opacity-50 grayscale' : ''
      }`}
    >
      {/* Top Input Handle: Accepts multiple incoming branches */}
      <div className="absolute -top-3.5 left-0 right-0 flex items-center justify-center pointer-events-none">
        <span className="bg-[#181d2a] text-gray-400 text-[9px] font-mono px-2 py-0.5 rounded-full border border-[#2b354d] shadow-sm">
          ⬇ Merge Branches In
        </span>
      </div>
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-4 !h-4 !bg-[#323c52] !border-2 !border-[#0f121a] hover:!bg-indigo-400 !rounded-full !-top-2 shadow-md cursor-crosshair transition-all"
        title="Connect multiple upstream branches here to combine them"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 pt-1">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className={`w-6 h-6 rounded-lg ${currentGate.color} flex items-center justify-center shrink-0 shadow-sm`}>
            {currentGate.icon}
          </div>
          <div className="truncate font-bold text-gray-100">{data.label || currentGate.label}</div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border font-bold ${currentGate.badgeBg}`}>
            {gate}
          </span>

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

      {/* Gate Formula & Combining Explanation */}
      <div className="rounded-lg bg-[#141824] p-2 border border-[#20273a] space-y-1 mb-2">
        <div className="text-[10px] text-gray-300 leading-snug">
          {currentGate.formula}
        </div>
        {hasResult && (
          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#232b40]">
            <span className="text-gray-400">Gate Output:</span>
            <span className={`font-mono font-bold ${outResult ? 'text-emerald-400' : 'text-rose-400'}`}>
              {outResult ? 'TRUE (PASSED)' : 'FALSE'}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Output Handles */}
      <div className="relative pt-1 border-t border-[#1e2536] flex items-center justify-between text-[10px] text-gray-400">
        <span className="text-[9px] font-mono text-gray-400">
          Combines to 1 Out
        </span>

        {/* Center Primary Handle: Single Combined Output */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="output"
          className="!w-3.5 !h-3.5 !bg-indigo-500 !border-2 !border-[#0f121a] hover:!bg-indigo-300 !rounded-full shadow-md cursor-crosshair !-bottom-2"
          style={{ left: '50%' }}
          title="Combined output branch: connects downstream as ONE branch"
        />

        {/* Auxiliary True/False handles */}
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-semibold text-emerald-400">T</span>
          <span className="text-[9px] font-semibold text-rose-400">F</span>
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          id="true"
          className="!w-2.5 !h-2.5 !bg-emerald-500 !border !border-[#0f121a] hover:!bg-emerald-300 !rounded-full !-bottom-1.5"
          style={{ left: '78%' }}
          title="True branch (if TRUE)"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="false"
          className="!w-2.5 !h-2.5 !bg-rose-500 !border !border-[#0f121a] hover:!bg-rose-300 !rounded-full !-bottom-1.5"
          style={{ left: '92%' }}
          title="False branch (if FALSE)"
        />
      </div>
    </div>
  );
});

LogicGateNode.displayName = 'LogicGateNode';
