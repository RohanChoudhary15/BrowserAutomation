import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Icon } from '../components/common/Icon';
import { NODE_REGISTRY, CATEGORIES } from './registry';
import { WorkflowNodeData } from '../types/workflow';
import { NodeRuntimeState } from '../types/execution';
import {
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Repeat,
  Trash2,
  Table as TableIcon,
  Download,
  FileSpreadsheet,
  FileText,
  Maximize2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { exportAndDownloadDataset } from '../utils/documentExporter';
import { TableModal } from '../components/properties/TableModal';

export interface IteratorNodeProps extends NodeProps {
  data: WorkflowNodeData & {
    runtimeState?: NodeRuntimeState;
    onRunNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
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
  const isScrapeCardNode = data.type === 'scrape_elements';
  const forEachLabel = isImageNode ? 'For Each Image' : (isScrapeCardNode ? 'For Each Card' : 'For Each Element');
  const itemVar = data.properties?.itemVariable || (isImageNode ? 'currentImage' : (isScrapeCardNode ? 'currentProduct' : 'currentElement'));

  let summary = '';
  if (data.type === 'extract_all_images') {
    summary = data.properties?.containerSelector
      ? `All images in ${data.properties.containerSelector}`
      : 'All images on page';
  } else if (data.type === 'scrape_elements') {
    summary = data.properties?.containerSelector
      ? `${(data.properties?.fields || []).length} fields from ${data.properties.containerSelector}`
      : 'Multi-field card scraper';
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

        {/* Status Indicator & Quick Actions */}
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

      {/* Summary preview or Live Iteration Widget */}
      {status === 'running' && runtime?.dynamicState ? (
        <div className="bg-indigo-950/50 rounded-lg p-2 border border-indigo-500/50 mb-2 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono text-indigo-200">
            <span className="font-semibold flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
              <span>
                {runtime.dynamicState.message ||
                  `Item ${runtime.dynamicState.currentIteration || 1}${
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
        summary && (
          <div className="bg-[#161a24] rounded-md px-2 py-1 text-[11px] text-gray-400 font-mono truncate border border-[#1c2230] mb-2">
            {summary}
          </div>
        )
      )}

      {/* Iterator variable badge */}
      <div className="flex items-center gap-1.5 mb-2.5 px-1 text-[10px] text-indigo-300 font-mono bg-indigo-950/40 border border-indigo-800/40 rounded py-0.5">
        <Repeat className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
        <span className="truncate">
          item: &#123;&#123;{itemVar}&#125;&#125;
          {isScrapeCardNode && data.properties?.itemExtractField && data.properties.itemExtractField !== 'all'
            ? ` (${data.properties.itemExtractField})`
            : ''}
        </span>
      </div>

      {/* Execution timing / Success message badge */}
      {status === 'success' && (
        <div className="mb-2 text-[10px] text-emerald-400/80 font-mono flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="truncate">
            {runtime?.dynamicState?.message || (runtime?.durationMs !== undefined ? `completed in ${runtime.durationMs}ms` : 'completed')}
          </span>
        </div>
      )}

      {runtime?.error && status === 'error' && (
        <div className="mb-2 text-[10px] text-rose-400 font-mono truncate" title={runtime.error}>
          ! {runtime.error}
        </div>
      )}

      {/* Table Output & Table Export Button for Extracted Cards */}
      {items.length > 0 && (
        <div className="pt-2 border-t border-[#232a3b] space-y-1.5 mb-2">
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowTablePreview(!showTablePreview);
              }}
              className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
              title="Toggle Table Output Preview"
            >
              <TableIcon className="w-3 h-3" />
              <span>Table Output ({items.length})</span>
              {showTablePreview ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>

            {/* Table Export Button with Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowExportMenu(!showExportMenu);
                }}
                className="px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-[10px] font-semibold flex items-center gap-1 transition-colors shadow-sm"
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
                    onClick={(e) => {
                      e.stopPropagation();
                      exportAndDownloadDataset(items, 'csv', `${data.properties?.outputVariable || 'scraped_products'}`);
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-2 py-1 text-gray-200 hover:bg-white/10 rounded flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3 h-3 text-orange-400" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      exportAndDownloadDataset(items, 'xlsx', `${data.properties?.outputVariable || 'scraped_products'}`);
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-2 py-1 text-gray-200 hover:bg-white/10 rounded flex items-center gap-1.5 transition-colors"
                  >
                    <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                    <span>Export Excel</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      exportAndDownloadDataset(items, 'json', `${data.properties?.outputVariable || 'scraped_products'}`);
                      setShowExportMenu(false);
                    }}
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
                      className="w-full text-left px-2 py-1 text-indigo-400 hover:bg-white/10 rounded flex items-center gap-1.5 font-medium transition-colors"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>View Full Table</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Inline Mini-Table Preview */}
          {showTablePreview && (
            <div className="rounded border border-[#232a3b] bg-[#0c0e14] overflow-hidden text-[9px] mt-1">
              <div className="overflow-x-auto max-h-32">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#181d2a] text-indigo-300 border-b border-[#232a3b]">
                      {headers.map((h) => (
                        <th key={h} className="py-0.5 px-1 text-left truncate max-w-[80px] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2433]">
                    {items.slice(0, 6).map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-white/5">
                        {headers.map((h) => (
                          <td key={h} className="py-0.5 px-1 truncate max-w-[80px] text-gray-300">
                            {String(row[h] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-1 bg-[#141824] border-t border-[#232a3b] flex items-center justify-between text-[8px] text-gray-400">
                <span>Showing {Math.min(items.length, 6)} of {items.length} cards</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsTableModalOpen(true);
                  }}
                  className="text-indigo-400 hover:text-indigo-300 underline font-medium"
                >
                  View all
                </button>
              </div>
            </div>
          )}
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

      {/* Full Screen Table Modal */}
      {isTableModalOpen && (
        <TableModal
          isOpen={isTableModalOpen}
          onClose={() => setIsTableModalOpen(false)}
          title={`${data.label || 'Extracted Cards'} Table Output`}
          data={items}
          defaultFilename={data.properties?.outputVariable || 'scraped_products'}
        />
      )}
    </div>
  );
});
