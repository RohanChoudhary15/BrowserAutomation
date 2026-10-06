import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Icon } from '../components/common/Icon';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import { Loader2, CheckCircle2, AlertCircle, Play, Trash2, Upload, Check } from 'lucide-react';
import { importDatasetFile } from '../utils/datasetImporter';

export interface LoopNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

export const LoopNode: React.FC<LoopNodeProps> = memo(({ id, data, selected }) => {
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');

  const isForEach = data.type === 'for_each';
  const [copiedVar, setCopiedVar] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const exposedVars: string[] = React.useMemo(() => {
    if (Array.isArray(data.properties?.exposedVariables) && data.properties.exposedVariables.length > 0) {
      return data.properties.exposedVariables;
    }
    if (Array.isArray(data.properties?.importedHeaders) && data.properties.importedHeaders.length > 0) {
      return data.properties.importedHeaders;
    }
    if (Array.isArray(data.properties?.importedItems) && data.properties.importedItems.length > 0) {
      return Object.keys(data.properties.importedItems[0] || {});
    }
    return [];
  }, [data.properties?.exposedVariables, data.properties?.importedHeaders, data.properties?.importedItems]);

  const itemVar = data.properties?.itemVariable || 'item';

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await importDatasetFile(file);
      window.dispatchEvent(
        new CustomEvent('autoflow:update-node-properties', {
          detail: {
            nodeId: id,
            properties: {
              importedItems: parsed.rows,
              importedHeaders: parsed.headers,
              importedFilename: parsed.filename,
              exposedVariables: parsed.headers,
              array: `importedItems`,
            },
          },
        })
      );
    } catch (err: any) {
      console.error('Import failed:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const summary = isForEach
    ? `For each in ${data.properties?.array || '[]'}`
    : `Repeat ${data.properties?.count || 1} times`;

  let borderClass = 'border-[#232a3b] hover:border-indigo-500/60';
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-indigo-500 ring-2 ring-indigo-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(99,102,241,0.4)]';
  } else if (status === 'success') {
    borderClass = 'border-emerald-500 ring-1 ring-emerald-500/40';
  } else if (status === 'error') {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/40';
  } else if (selected) {
    borderClass = 'border-indigo-500 ring-2 ring-indigo-500/50';
    glowClass = 'shadow-[0_0_12px_rgba(99,102,241,0.3)]';
  }

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={async (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const file = e.dataTransfer.files[0];
          try {
            const parsed = await importDatasetFile(file);
            window.dispatchEvent(
              new CustomEvent('autoflow:update-node-properties', {
                detail: {
                  nodeId: id,
                  properties: {
                    importedItems: parsed.rows,
                    importedHeaders: parsed.headers,
                    importedFilename: parsed.filename,
                    exposedVariables: parsed.headers,
                    array: `importedItems`,
                  },
                },
              })
            );
          } catch (err) {
            console.error('File drop import failed:', err);
          }
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
        className="!w-3 !h-3 !bg-[#323c52] !border-2 !border-[#11141c] hover:!bg-indigo-400"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm">
            <Icon name={isForEach ? 'List' : 'Repeat'} className="w-3.5 h-3.5" />
          </div>
          <div className="truncate font-semibold text-gray-100">{data.label || (isForEach ? 'For Each' : 'Loop')}</div>
        </div>

        <div className="shrink-0 flex items-center gap-1">
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

      {/* Summary or Live Iteration Widget */}
      {status === 'running' && runtime?.dynamicState ? (
        <div className="bg-indigo-950/50 rounded-lg p-2 border border-indigo-500/50 mb-3 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono text-indigo-200">
            <span className="font-semibold flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
              <span>
                {runtime.dynamicState.message ||
                  `${isForEach ? 'Item' : 'Iteration'} ${runtime.dynamicState.currentIteration || 1}${
                    runtime.dynamicState.totalIterations ? ` / ${runtime.dynamicState.totalIterations}` : ''
                  }`}
              </span>
            </span>
            {runtime.dynamicState.progress !== undefined && (
              <span className="text-[10px] text-indigo-400 font-bold shrink-0 ml-1">
                {runtime.dynamicState.progress}%
              </span>
            )}
          </div>
          {runtime.dynamicState.progress !== undefined && (
            <div className="w-full bg-[#11141c] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-150"
                style={{ width: `${runtime.dynamicState.progress}%` }}
              />
            </div>
          )}
          {runtime.dynamicState.detail && (
            <div className="text-[9px] text-indigo-300/80 font-mono truncate bg-[#11141c]/70 px-1.5 py-0.5 rounded border border-indigo-900/40">
              {runtime.dynamicState.detail}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#161a24] rounded-md px-2 py-1 text-[11px] text-gray-400 font-mono truncate border border-[#1c2230] mb-2">
          {summary}
        </div>
      )}

      {status === 'success' && runtime?.dynamicState?.message && (
        <div className="text-[10px] text-emerald-400 font-mono mb-2 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="truncate">{runtime.dynamicState.message}</span>
        </div>
      )}

      {/* For Each Exposed Variables Badges */}
      {isForEach && exposedVars.length > 0 && (
        <div className="mb-2 p-1.5 rounded-lg bg-indigo-950/40 border border-indigo-500/25">
          <div className="text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-1 flex items-center justify-between">
            <span>Exposed Variables:</span>
            <span className="text-indigo-400 font-mono text-[8px] lowercase">click to copy</span>
          </div>
          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
            {exposedVars.map((v) => {
              const isCopied = copiedVar === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard?.writeText(`{{${v}}}`);
                    setCopiedVar(v);
                    setTimeout(() => setCopiedVar(null), 1500);
                  }}
                  className={`text-[8px] font-mono px-1 py-0.5 rounded border transition-colors flex items-center gap-0.5 truncate max-w-[85px] ${
                    isCopied
                      ? 'bg-emerald-900/60 text-emerald-200 border-emerald-500/60'
                      : 'bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-200 border-indigo-500/30 hover:border-indigo-400'
                  }`}
                  title={`Click to copy {{${v}}} (also {{${itemVar}.${v}}})`}
                >
                  {isCopied ? <Check className="w-2 h-2 text-emerald-300 shrink-0" /> : null}
                  <span>&#123;&#123;{v}&#125;&#125;</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* For Each: Option to import CSV / JSON directly */}
      {isForEach && (
        <div className="mb-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="w-full py-1 px-1.5 rounded-lg bg-indigo-950/30 hover:bg-indigo-900/40 border border-dashed border-indigo-500/30 hover:border-indigo-400 text-indigo-300 text-[9px] font-medium flex items-center justify-center gap-1 transition-colors shadow-sm"
            title="Import CSV or JSON file to loop over its rows"
          >
            <Upload className="w-2.5 h-2.5 text-indigo-400" />
            <span>{Array.isArray(data.properties?.importedItems) ? `Replace Dataset (${data.properties.importedItems.length})` : 'Import CSV / JSON to Loop'}</span>
          </button>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.json"
        onChange={handleImportFile}
        className="hidden"
      />

      {/* Output Handle Labels */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1c2230] px-1 text-[10px] font-semibold">
        <div className="text-indigo-400">Loop Body</div>
        <div className="text-gray-400">Done</div>
      </div>

      {/* Branch Source Handles */}
      <Handle
        id="loop_body"
        type="source"
        position={Position.Bottom}
        style={{ left: '25%' }}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-[#11141c] hover:!bg-indigo-400"
      />
      <Handle
        id="loop_done"
        type="source"
        position={Position.Bottom}
        style={{ left: '75%' }}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-[#11141c] hover:!bg-gray-300"
      />
    </div>
  );
});
