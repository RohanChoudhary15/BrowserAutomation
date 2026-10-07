import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import {
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Play,
  Trash2,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

export interface ErrorHandlerNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

export const ErrorHandlerNode: React.FC<ErrorHandlerNodeProps> = memo(
  ({ id, data, selected }) => {
    const runtime = data.runtimeState;
    const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');
    const props = data.properties || {};

    const watchMode = props.watchMode || 'chosen';
    const watchedNodeIds: string[] = Array.isArray(props.watchedNodeIds) ? props.watchedNodeIds : [];
    const watchedCount = watchedNodeIds.length;
    const outVar = props.outputVariable || 'lastError';

    // Check if this handler intercepted an error during the last run
    const hasHandledError = !!runtime?.dynamicState?.errorNode || !!runtime?.dynamicState?.message?.includes('Handled');

    let borderClass = 'border-amber-500/40 hover:border-amber-400';
    let glowClass = '';

    if (status === 'running') {
      borderClass = 'border-amber-400 ring-2 ring-amber-400/40';
      glowClass = 'shadow-[0_0_15px_rgba(251,191,36,0.4)]';
    } else if (hasHandledError) {
      borderClass = 'border-rose-500 ring-1 ring-rose-500/40';
      glowClass = 'shadow-[0_0_12px_rgba(244,63,94,0.3)]';
    } else if (status === 'success') {
      borderClass = 'border-emerald-500/60 ring-1 ring-emerald-500/30';
    } else if (selected) {
      borderClass = 'border-amber-400 ring-2 ring-amber-400/50';
      glowClass = 'shadow-[0_0_12px_rgba(251,191,36,0.3)]';
    }

    return (
      <div
        className={`relative rounded-xl bg-[#0f121a] border ${borderClass} ${glowClass} min-w-[220px] max-w-[280px] p-3 text-white shadow-xl transition-all select-none`}
      >
        {/* Left Input Handle */}
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="!w-2.5 !h-2.5 !bg-amber-400 !border-2 !border-[#0f121a]"
        />

        {/* Node Header */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="p-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <span className="font-semibold text-xs text-amber-200 truncate">
              {data.label || 'Error Handler'}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {status === 'running' && (
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
            {hasHandledError && (
              <span className="px-1.5 py-0.2 rounded bg-rose-950/80 border border-rose-500/40 text-[9px] font-medium text-rose-300">
                Caught
              </span>
            )}
            {!hasHandledError && status === 'success' && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </div>
        </div>

        {/* Summary Description */}
        <div className="p-2 rounded-lg bg-black/40 border border-[#1d2433] space-y-1 mb-2">
          <div className="text-[10px] text-gray-300 flex items-center justify-between">
            <span className="text-gray-400">Mode:</span>
            <span className="font-medium text-amber-300">
              {watchMode === 'all'
                ? 'All Nodes'
                : watchMode === 'try_branch'
                ? 'Try Branch'
                : `${watchedCount} Chosen Node${watchedCount === 1 ? '' : 's'}`}
            </span>
          </div>

          <div className="text-[10px] text-gray-400 flex items-center justify-between">
            <span>Saves Error To:</span>
            <code className="text-[9px] font-mono text-amber-300/90 bg-amber-950/50 px-1 py-0.2 rounded border border-amber-500/20">
              &#123;&#123;{outVar}&#125;&#125;
            </code>
          </div>
        </div>

        {/* Caught Error Alert Banner if intercepted */}
        {hasHandledError && (
          <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/30 space-y-1 mb-2 text-[10px]">
            <div className="flex items-center gap-1 text-rose-300 font-semibold">
              <AlertCircle className="w-3 h-3 text-rose-400" />
              <span>Handled Error on: {runtime?.dynamicState?.errorNode || 'Node'}</span>
            </div>
            {runtime?.dynamicState?.detail && (
              <p className="text-[9px] font-mono text-gray-300 truncate">
                {runtime.dynamicState.detail}
              </p>
            )}
          </div>
        )}

        {/* Outgoing Branch Labels & Handles */}
        <div className="pt-2 border-t border-[#1d2433] space-y-2">
          {/* Catch / Error Branch (Runs on error) */}
          <div className="relative flex items-center justify-between text-[10px]">
            <span className="text-rose-400 font-medium flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              <span>On Error (Catch)</span>
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id="error"
              className="!w-2.5 !h-2.5 !bg-rose-500 !border-2 !border-[#0f121a] !-right-1.5"
            />
          </div>

          {/* Continue / Done Branch (Normal flow) */}
          <div className="relative flex items-center justify-between text-[10px]">
            <span className="text-emerald-400 font-medium flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              <span>Continue (Done)</span>
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id="done"
              className="!w-2.5 !h-2.5 !bg-emerald-400 !border-2 !border-[#0f121a] !-right-1.5"
            />
          </div>

          {/* Try Branch Handle (Optional) */}
          {watchMode === 'try_branch' && (
            <div className="relative flex items-center justify-between text-[10px]">
              <span className="text-indigo-300 font-medium flex items-center gap-1">
                <ArrowRight className="w-3 h-3" />
                <span>Try Protected Flow</span>
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id="try"
                className="!w-2.5 !h-2.5 !bg-indigo-400 !border-2 !border-[#0f121a] !-right-1.5"
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);
