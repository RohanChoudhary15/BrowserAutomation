import React, { memo, useRef, useState, useMemo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import {
  FileSpreadsheet,
  Upload,
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Check,
  Repeat,
  GripHorizontal,
  Table as TableIcon,
  X,
} from 'lucide-react';
import { importDatasetFile } from '../utils/datasetImporter';

export interface DatasetInputNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

export const DatasetInputNode: React.FC<DatasetInputNodeProps> = memo(({ id, data, selected }) => {
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');
  const props = data.properties || {};

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [isDragOverFile, setIsDragOverFile] = useState(false);

  const outVar = props.outputVariable || 'dataset';
  const importedItems: Record<string, any>[] = Array.isArray(props.importedItems) ? props.importedItems : [];
  const importedHeaders: string[] = useMemo(() => {
    if (Array.isArray(props.importedHeaders) && props.importedHeaders.length > 0) {
      return props.importedHeaders;
    }
    if (importedItems.length > 0) {
      return Object.keys(importedItems[0] || {});
    }
    return [];
  }, [props.importedHeaders, importedItems]);

  const hasData = importedItems.length > 0;

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
              sourceType: 'file',
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

  const handleClearData = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent('autoflow:update-node-properties', {
        detail: {
          nodeId: id,
          properties: {
            importedItems: [],
            importedHeaders: [],
            importedFilename: '',
            exposedVariables: [],
          },
        },
      })
    );
  };

  let borderClass = 'border-[#232a3b] hover:border-emerald-500/60';
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-emerald-500 ring-2 ring-emerald-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(16,185,129,0.4)]';
  } else if (status === 'success') {
    borderClass = 'border-emerald-500 ring-1 ring-emerald-500/40';
  } else if (status === 'error') {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(244,63,94,0.3)]';
  } else if (selected) {
    borderClass = 'border-emerald-500 ring-2 ring-emerald-500/50';
    glowClass = 'shadow-[0_0_15px_rgba(16,185,129,0.3)]';
  }

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDragOverFile(true);
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDragLeave={() => setIsDragOverFile(false)}
      onDrop={async (e) => {
        setIsDragOverFile(false);
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
                    sourceType: 'file',
                  },
                },
              })
            );
          } catch (err) {
            console.error('File drop import failed:', err);
          }
        }
      }}
      className={`group relative min-w-[240px] max-w-[310px] rounded-xl bg-[#0e131b] p-3 text-xs text-gray-200 border transition-all duration-150 ${borderClass} ${glowClass} ${
        isDragOverFile ? 'ring-2 ring-emerald-400 bg-emerald-950/20' : ''
      } ${data.disabled ? 'opacity-50 grayscale' : ''}`}
    >
      {/* Target Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-emerald-600 !border-2 !border-[#0e131b] hover:!bg-emerald-400 transition-colors"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-sm">
            <FileSpreadsheet className="w-3.5 h-3.5" />
          </div>
          <div className="truncate font-semibold text-gray-100">{data.label || 'Dataset Input'}</div>
        </div>

        {/* Status & Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />}
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

      {/* Variable Badge & Import Button Bar */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
          &#123;&#123;{outVar}&#125;&#125;
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="py-1 px-2 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 text-[10px] font-semibold flex items-center gap-1 transition-colors shadow-sm"
          title="Import CSV, TSV, or JSON file"
        >
          <Upload className="w-2.5 h-2.5" />
          <span>{hasData ? 'Replace File' : 'Import File'}</span>
        </button>
      </div>

      {/* Empty State Drop Zone */}
      {!hasData && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border border-dashed border-[#232a3b] hover:border-emerald-500/50 rounded-lg p-3 text-center cursor-pointer hover:bg-emerald-950/10 transition-colors mb-2"
        >
          <Upload className="w-4 h-4 text-emerald-400/80 mx-auto mb-1" />
          <div className="text-[11px] font-medium text-gray-300">Click or drag CSV / JSON</div>
          <div className="text-[9px] text-gray-500 mt-0.5">Supports .csv, .tsv, .json files</div>
        </div>
      )}

      {/* Data Loaded Preview Card */}
      {hasData && (
        <div className="rounded-lg bg-[#141824] p-2 border border-[#202738] mb-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1 text-emerald-400 font-semibold truncate max-w-[170px]">
              <TableIcon className="w-3 h-3 shrink-0" />
              <span className="truncate">{props.importedFilename || 'Imported Dataset'}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-mono text-gray-300 bg-[#0e131b] px-1.5 py-0.5 rounded border border-[#202738]">
                {importedItems.length} rows
              </span>
              <button
                type="button"
                onClick={handleClearData}
                className="p-0.5 rounded hover:bg-rose-950/50 text-gray-500 hover:text-rose-400 transition-colors"
                title="Clear dataset"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Micro Table Preview */}
          <div className="rounded border border-[#1e2330] overflow-hidden max-h-24 overflow-x-auto text-[9px] font-mono">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1b2233] text-gray-300">
                  {importedHeaders.slice(0, 4).map((h) => (
                    <th key={h} className="p-1 px-1.5 border-b border-[#232a3b] truncate max-w-[70px]">
                      {h}
                    </th>
                  ))}
                  {importedHeaders.length > 4 && (
                    <th className="p-1 px-1 border-b border-[#232a3b] text-gray-500">+{importedHeaders.length - 4}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2330]">
                {importedItems.slice(0, 3).map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/5 text-gray-300">
                    {importedHeaders.slice(0, 4).map((h) => (
                      <td key={h} className="p-1 px-1.5 truncate max-w-[70px]">
                        {String(row[h] ?? '')}
                      </td>
                    ))}
                    {importedHeaders.length > 4 && <td className="p-1 text-gray-500">...</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Exposed Column Variable Pills */}
      {hasData && importedHeaders.length > 0 && (
        <div className="mb-2 p-1.5 rounded-lg bg-emerald-950/30 border border-emerald-500/25">
          <div className="text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-1 flex items-center justify-between">
            <span>Columns (Variables):</span>
            <span className="text-emerald-400 font-mono text-[8px] lowercase">click to copy</span>
          </div>
          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
            {importedHeaders.map((v) => {
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
                      ? 'bg-emerald-800 text-emerald-100 border-emerald-400'
                      : 'bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border-emerald-500/30 hover:border-emerald-400'
                  }`}
                  title={`Click to copy {{${v}}}`}
                >
                  {isCopied ? <Check className="w-2 h-2 text-emerald-300 shrink-0" /> : null}
                  <span>&#123;&#123;{v}&#125;&#125;</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Draggable For Each Loop Card */}
      {hasData && (
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/autoflow-node', 'for_each');
            e.dataTransfer.setData(
              'application/autoflow-node-props',
              JSON.stringify({
                array: `{{${outVar}}}`,
                itemVariable: 'item',
                exposedVariables: importedHeaders,
                importedHeaders,
              })
            );
            e.dataTransfer.setData('application/autoflow-source-node', id);
            e.dataTransfer.setData('application/autoflow-source-handle', 'done');
            e.dataTransfer.effectAllowed = 'copyMove';
          }}
          className="mb-2 p-1.5 rounded-lg bg-gradient-to-r from-indigo-950/60 to-purple-950/50 hover:from-indigo-900/70 hover:to-purple-900/60 border border-indigo-500/40 hover:border-indigo-400 cursor-grab active:cursor-grabbing transition-all flex items-center justify-between shadow-sm select-none"
          title="Drag this into canvas to create a connected For Each loop"
        >
          <div className="flex items-center gap-1.5 text-indigo-300 text-[10px] font-medium">
            <Repeat className="w-3 h-3 text-indigo-400 shrink-0" />
            <span>Drag For Each Loop</span>
          </div>
          <GripHorizontal className="w-3 h-3 text-indigo-400/80 shrink-0" />
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

      {/* Bottom Source Handle */}
      <Handle
        id="done"
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-[#0e131b] hover:!bg-emerald-400 transition-colors"
      />
    </div>
  );
});
