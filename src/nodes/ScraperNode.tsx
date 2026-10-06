import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Icon } from '../components/common/Icon';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  Trash2,
  Database,
  Repeat,
  Layers,
  Table as TableIcon,
  Download,
  FileSpreadsheet,
  FileText,
  Maximize2,
  ChevronDown,
  ChevronUp,
  FileCode,
  Sparkles,
  Upload,
  GripVertical,
  Copy,
  Check,
} from 'lucide-react';
import { exportAndDownloadDataset } from '../utils/documentExporter';
import { importDatasetFile } from '../utils/datasetImporter';
import { TableModal } from '../components/properties/TableModal';

export interface ScraperNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
  };
}

const BRAND_THEMES: Record<string, { bg: string; border: string; text: string; ring: string; icon: string }> = {
  youtube_scraper: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    text: 'text-red-400',
    ring: 'ring-red-500/30',
    icon: 'PlaySquare',
  },
  instagram_scraper: {
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/40',
    text: 'text-pink-400',
    ring: 'ring-pink-500/30',
    icon: 'Camera',
  },
  reddit_scraper: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/40',
    text: 'text-orange-400',
    ring: 'ring-orange-500/30',
    icon: 'Flame',
  },
  linkedin_scraper: {
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/40',
    text: 'text-sky-400',
    ring: 'ring-sky-500/30',
    icon: 'Briefcase',
  },
  amazon_scraper: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/40',
    text: 'text-amber-400',
    ring: 'ring-amber-500/30',
    icon: 'ShoppingCart',
  },
  twitter_scraper: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/40',
    text: 'text-cyan-400',
    ring: 'ring-cyan-500/30',
    icon: 'AtSign',
  },
  google_search_scraper: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/40',
    text: 'text-emerald-400',
    ring: 'ring-emerald-500/30',
    icon: 'Search',
  },
};

export const ScraperNode: React.FC<ScraperNodeProps> = memo(({ id, data, selected }) => {
  const runtime = data.runtimeState;
  const status = runtime?.status || (data.disabled ? 'disabled' : 'idle');
  const theme = BRAND_THEMES[data.type] || {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/40',
    text: 'text-orange-400',
    ring: 'ring-orange-500/30',
    icon: 'Box',
  };

  const mode = data.properties?.mode || 'default';
  const outVar = data.properties?.outputVariable || 'data';
  const itemVar = data.properties?.itemVariable || 'item';
  const engine = data.properties?.engine;

  // Format concise query/target summary
  let queryDesc = '';
  if (data.type === 'youtube_scraper') {
    if (mode === 'video_script') {
      queryDesc = `Transcript: ${data.properties?.query || data.properties?.url || 'active video'}`;
    } else if (mode === 'comments') {
      queryDesc = data.properties?.url ? 'from video' : 'current video';
    } else {
      queryDesc = `"${data.properties?.query || ''}"`;
    }
  } else if (data.type === 'instagram_scraper') {
    queryDesc = `@${data.properties?.target || 'target'}`;
  } else if (data.type === 'reddit_scraper') {
    queryDesc = mode === 'subreddit' ? `r/${data.properties?.subreddit || 'all'}` : `q: "${data.properties?.query || ''}"`;
  } else if (data.type === 'linkedin_scraper') {
    queryDesc = `${data.properties?.keywords || 'Jobs'} (${data.properties?.location || 'Remote'})`;
  } else if (data.type === 'amazon_scraper') {
    queryDesc = `"${data.properties?.query || 'products'}"`;
  } else if (data.type === 'twitter_scraper') {
    queryDesc = mode === 'profile_tweets' ? `@${data.properties?.username || 'user'}` : `"${data.properties?.query || ''}"`;
  } else if (data.type === 'google_search_scraper') {
    queryDesc = `"${data.properties?.query || 'search'}"`;
  }

  const maxRes = data.properties?.maxResults || 15;

  let borderClass = 'border-[#232a3b] hover:border-orange-500/60';
  let glowClass = '';

  if (status === 'running') {
    borderClass = 'border-orange-500 ring-2 ring-orange-500/40';
    glowClass = 'shadow-[0_0_15px_rgba(249,115,22,0.4)]';
  } else if (status === 'success') {
    borderClass = 'border-emerald-500 ring-1 ring-emerald-500/40';
  } else if (status === 'error') {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/40';
  } else if (selected) {
    borderClass = 'border-orange-500 ring-2 ring-orange-500/50';
    glowClass = 'shadow-[0_0_12px_rgba(249,115,22,0.3)]';
  }

  // Local imported dataset fallback state
  const [localImported, setLocalImported] = useState<{ headers: string[]; rows: any[]; filename?: string } | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Extract items for Table Output
  const items: any[] = Array.isArray(runtime?.output)
    ? runtime.output
    : (runtime?.output?.items && Array.isArray(runtime.output.items)
      ? runtime.output.items
      : (runtime?.dynamicState?.table?.rows && Array.isArray(runtime.dynamicState.table.rows)
        ? runtime.dynamicState.table.rows
        : (Array.isArray(runtime?.dynamicState?.items)
          ? runtime.dynamicState.items
          : (Array.isArray(data.properties?.importedItems) && data.properties.importedItems.length > 0
            ? data.properties.importedItems
            : (localImported?.rows && localImported.rows.length > 0
              ? localImported.rows
              : [])))));

  const resultCount = items.length > 0
    ? items.length
    : (runtime?.dynamicState?.count ?? (Array.isArray(runtime?.output) ? runtime.output.length : undefined));

  const headers = runtime?.dynamicState?.table?.headers ||
    (Array.isArray(data.properties?.importedHeaders) && data.properties.importedHeaders.length > 0
      ? data.properties.importedHeaders
      : (localImported?.headers && localImported.headers.length > 0
        ? localImported.headers
        : (items.length > 0 && typeof items[0] === 'object' && items[0] !== null
          ? Object.keys(items[0])
          : ['title', 'url'])));

  // Local table preview and export dropdown states
  const [showTablePreview, setShowTablePreview] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);

  const handleExport = (fmt: 'csv' | 'xlsx' | 'json', e: React.MouseEvent) => {
    e.stopPropagation();
    if (items.length === 0) return;
    exportAndDownloadDataset(items, fmt, `${outVar}_${data.type}`);
    setShowExportMenu(false);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await importDatasetFile(file);
      setLocalImported({ headers: parsed.headers, rows: parsed.rows, filename: parsed.filename });
      setShowTablePreview(true);
      window.dispatchEvent(
        new CustomEvent('autoflow:update-node-properties', {
          detail: {
            nodeId: id,
            properties: {
              importedItems: parsed.rows,
              importedHeaders: parsed.headers,
              importedFilename: parsed.filename,
              useImportedData: true,
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

  const handleCopyVar = (varName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(`{{${varName}}}`);
    setCopiedVar(varName);
    setTimeout(() => setCopiedVar(null), 1500);
  };

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
            setLocalImported({ headers: parsed.headers, rows: parsed.rows, filename: parsed.filename });
            setShowTablePreview(true);
            window.dispatchEvent(
              new CustomEvent('autoflow:update-node-properties', {
                detail: {
                  nodeId: id,
                  properties: {
                    importedItems: parsed.rows,
                    importedHeaders: parsed.headers,
                    importedFilename: parsed.filename,
                    useImportedData: true,
                  },
                },
              })
            );
          } catch (err) {
            console.error('File drop import failed:', err);
          }
        }
      }}
      className={`group relative min-w-[250px] max-w-[310px] rounded-xl bg-[#11141c] p-3 text-xs text-gray-200 border transition-all duration-150 ${borderClass} ${glowClass} ${
        data.disabled ? 'opacity-50 grayscale' : ''
      }`}
    >
      {/* Top Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[#323c52] !border-2 !border-[#11141c] hover:!bg-orange-400"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className={`w-6 h-6 rounded-lg ${theme.bg} ${theme.border} border flex items-center justify-center ${theme.text} shrink-0 shadow-sm`}>
            <Icon name={theme.icon} className="w-3.5 h-3.5" />
          </div>
          <div className="truncate font-semibold text-gray-100">{data.label || 'Scraper'}</div>
        </div>

        <div className="shrink-0 flex items-center gap-1">
          {engine === 'youtubei_js' && (
            <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-0.5" title="youtubei.js Innertube direct engine active">
              <Sparkles className="w-2.5 h-2.5 text-amber-300" />
              yt.js
            </span>
          )}
          {data.properties?.headless && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-0.5" title="Headless background mode (no focus stealing)">
              👻 Headless
            </span>
          )}
          <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
            Free
          </span>
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
          {status === 'idle' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onRunNode?.(id);
              }}
              title="Run this scraper"
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-orange-400 transition-all"
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

      {/* Mode & Query Details */}
      <div className="bg-[#161a24] rounded-lg p-2 border border-[#1c2230] mb-2 space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-400 font-mono uppercase bg-[#11141c] px-1.5 py-0.5 rounded border border-[#232a3b] flex items-center gap-1">
            {mode === 'video_script' && <FileCode className="w-3 h-3 text-red-400" />}
            {mode.replace(/_/g, ' ')}
          </span>
          <span className="text-gray-400 font-mono text-[10px]">
            limit: <strong className="text-gray-200">{maxRes}</strong>
          </span>
        </div>

        <div className="text-[11px] font-mono text-gray-200 truncate" title={queryDesc}>
          {queryDesc}
        </div>

        {/* Live dynamic progress or item counter */}
        {status === 'running' && runtime?.dynamicState?.message && (
          <div className="text-[10px] text-orange-300 font-mono flex items-center gap-1.5 pt-1 border-t border-[#232a3b]">
            <Loader2 className="w-3 h-3 animate-spin shrink-0 text-orange-400" />
            <span className="truncate">{runtime.dynamicState.message}</span>
          </div>
        )}

        {status === 'success' && resultCount !== undefined && (
          <div className="text-[10px] text-emerald-400 font-mono flex items-center justify-between pt-1 border-t border-[#232a3b]">
            <div className="flex items-center gap-1.5 truncate">
              <Database className="w-3 h-3 shrink-0" />
              <span>Extracted {resultCount} items</span>
            </div>
            <code>{`{{${outVar}}}`}</code>
          </div>
        )}

        {/* TABLE OUTPUT & TABLE EXPORT BUTTON */}
        {items.length > 0 && (
          <div className="pt-2 border-t border-[#232a3b] space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTablePreview(!showTablePreview);
                }}
                className="text-[10px] font-semibold text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors"
                title="Toggle Table Output Preview"
              >
                <TableIcon className="w-3 h-3" />
                <span>Table Output ({items.length})</span>
                {showTablePreview ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
              </button>

            {/* Table Import & Export Buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-1.5 py-0.5 rounded bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-1 transition-colors shadow-sm"
                title="Import CSV or JSON dataset"
              >
                <Upload className="w-2.5 h-2.5" />
                <span>Import</span>
              </button>

              {/* Table Export Button with Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowExportMenu(!showExportMenu);
                  }}
                  className="px-2 py-0.5 rounded bg-orange-600/30 hover:bg-orange-600/50 text-orange-300 border border-orange-500/40 text-[10px] font-semibold flex items-center gap-1 transition-colors shadow-sm"
                  title="Export Table (CSV, Excel XLSX, JSON)"
                >
                  <Download className="w-2.5 h-2.5" />
                  <span>Export</span>
                </button>

                {showExportMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1 z-30 w-36 bg-[#161a26] border border-[#283247] rounded-lg shadow-xl p-1 text-[10px] space-y-0.5 animate-fadeIn"
                  >
                    <button
                      onClick={(e) => handleExport('csv', e)}
                      className="w-full text-left px-2 py-1 text-gray-200 hover:bg-white/10 rounded flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3 h-3 text-orange-400" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      onClick={(e) => handleExport('xlsx', e)}
                      className="w-full text-left px-2 py-1 text-gray-200 hover:bg-white/10 rounded flex items-center gap-1.5 transition-colors"
                    >
                      <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                      <span>Export Excel</span>
                    </button>
                    <button
                      onClick={(e) => handleExport('json', e)}
                      className="w-full text-left px-2 py-1 text-gray-200 hover:bg-white/10 rounded flex items-center gap-1.5 transition-colors"
                    >
                      <FileText className="w-3 h-3 text-indigo-400" />
                      <span>Export JSON</span>
                    </button>
                    <div className="pt-0.5 border-t border-[#232a3b]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowExportMenu(false);
                          setIsTableModalOpen(true);
                        }}
                        className="w-full text-left px-2 py-1 text-orange-400 hover:bg-white/10 rounded flex items-center gap-1.5 font-medium transition-colors"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>View Full Table</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

            {/* Inline Mini-Table Preview */}
            {showTablePreview && (
              <div className="rounded border border-[#232a3b] bg-[#0c0e14] overflow-hidden text-[9px] mt-1">
                <div className="overflow-x-auto max-h-24">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-[#181d2a] text-orange-400/90 border-b border-[#232a3b]">
                        {headers.map((h) => (
                          <th key={h} className="py-0.5 px-1 text-left truncate max-w-[70px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1c2230]">
                      {items.slice(0, 3).map((r, i) => (
                        <tr key={i} className="hover:bg-white/5">
                          {headers.map((h) => (
                            <td key={h} className="py-0.5 px-1 truncate max-w-[70px] text-gray-300" title={String(r[h] ?? '')}>
                              {typeof r[h] === 'object' ? JSON.stringify(r[h]) : String(r[h] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-1 bg-[#141824] border-t border-[#1c2230] flex items-center justify-between text-gray-400">
                  <span>{items.length} rows</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsTableModalOpen(true);
                    }}
                    className="text-orange-400 hover:underline flex items-center gap-0.5"
                  >
                    <span>Full View</span>
                    <Maximize2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty items quick import button */}
        {items.length === 0 && (
          <div className="pt-2 border-t border-[#232a3b]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="w-full py-1.5 px-2 rounded-lg bg-orange-950/30 hover:bg-orange-900/40 border border-dashed border-orange-500/30 hover:border-orange-400 text-orange-300 text-[10px] font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              title="Import CSV or JSON to populate dataset"
            >
              <Upload className="w-3 h-3 text-orange-400" />
              <span>Import CSV / JSON</span>
            </button>
          </div>
        )}

        {/* Draggable "For Each" Loop Node for this scraper */}
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData('application/autoflow-node', 'for_each');
            e.dataTransfer.setData(
              'application/autoflow-node-props',
              JSON.stringify({
                array: `{{${outVar}}}`,
                itemVariable: itemVar || 'item',
                exposedVariables: headers,
              })
            );
            e.dataTransfer.setData('application/autoflow-source-node', id);
            e.dataTransfer.setData('application/autoflow-source-handle', 'loop_done');
            e.dataTransfer.effectAllowed = 'copyMove';
          }}
          className="mt-2 p-1.5 rounded-lg bg-orange-950/30 border border-orange-500/30 hover:bg-orange-900/40 hover:border-orange-400 cursor-grab active:cursor-grabbing transition-all select-none shadow-sm group/drag"
          title="Drag onto canvas to create a For Each loop iterating over each scraped item"
        >
          <div className="flex items-center justify-between gap-1 text-[10px] mb-1">
            <div className="flex items-center gap-1 text-orange-300 font-medium">
              <GripVertical className="w-3 h-3 text-orange-400/80 group-hover/drag:text-orange-200 shrink-0" />
              <Repeat className="w-3 h-3 text-orange-400 shrink-0" />
              <span>Drag &quot;For Each&quot; Loop</span>
            </div>
            <span className="text-[9px] font-mono text-orange-300 bg-orange-900/60 px-1 py-0.5 rounded border border-orange-700/40">
              &#123;&#123;{outVar}&#125;&#125;
            </span>
          </div>

          {/* Exposed Column Variables preview */}
          <div className="pt-1 border-t border-orange-500/20">
            <div className="text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-1 flex items-center justify-between">
              <span>Exposes Variables:</span>
              <span className="text-orange-400/80 font-mono text-[8px] lowercase">click to copy</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
              {headers.slice(0, 6).map((col) => {
                const isCopied = copiedVar === col;
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={(e) => handleCopyVar(col, e)}
                    className={`text-[8px] font-mono px-1 py-0.5 rounded border transition-colors flex items-center gap-0.5 truncate max-w-[85px] ${
                      isCopied
                        ? 'bg-emerald-900/60 text-emerald-200 border-emerald-500/60'
                        : 'bg-orange-900/40 hover:bg-orange-800/60 text-orange-200 border border-orange-500/30 hover:border-orange-400'
                    }`}
                    title={`Click to copy {{${col}}} (also {{${itemVar}.${col}}})`}
                  >
                    {isCopied ? <Check className="w-2 h-2 text-emerald-300 shrink-0" /> : null}
                    <span>&#123;&#123;{col}&#125;&#125;</span>
                  </button>
                );
              })}
              {headers.length > 6 && (
                <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-orange-900/20 text-orange-400/70 border border-orange-500/20">
                  +{headers.length - 6} more
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Hidden File Input for CSV/JSON import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.json"
          onChange={handleImportFile}
          className="hidden"
        />
      </div>

      {/* Output Handles Header */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1c2230] px-1 text-[10px] font-semibold">
        <div className="text-orange-400 flex items-center gap-1">
          <Repeat className="w-2.5 h-2.5" />
          <span>Loop {`{{${itemVar}}}`}</span>
        </div>
        <div className="text-gray-400 flex items-center gap-1">
          <span>All Items</span>
          <Layers className="w-2.5 h-2.5" />
        </div>
      </div>

      {/* Dual Bottom Handles */}
      <Handle
        id="loop_body"
        type="source"
        position={Position.Bottom}
        style={{ left: '25%' }}
        className="!w-3 !h-3 !bg-orange-500 !border-2 !border-[#11141c] hover:!bg-orange-400"
        title="Streams each extracted item into the downstream loop body"
      />
      <Handle
        id="loop_done"
        type="source"
        position={Position.Bottom}
        style={{ left: '75%' }}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-[#11141c] hover:!bg-gray-300"
        title="Emits when all items are scraped (contains full array)"
      />

      {/* Interactive Full Table Modal */}
      {isTableModalOpen && (
        <TableModal
          isOpen={isTableModalOpen}
          onClose={() => setIsTableModalOpen(false)}
          title={`${data.label || 'Scraper'} Table Output`}
          data={items}
          defaultFilename={`${outVar}_table`}
        />
      )}
    </div>
  );
});
