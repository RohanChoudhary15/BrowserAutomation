import React, { useState } from 'react';
import { Table as TableIcon, Download, FileSpreadsheet, FileText, Maximize2, Copy, Check } from 'lucide-react';
import { exportAndDownloadDataset, jsonToCsv } from '../../../utils/documentExporter';
import { TableModal } from '../TableModal';

export interface TableExportSectionProps {
  items?: any[];
  outputVariable: string;
  exportFormat?: string;
  exportFilename?: string;
  onPropChange: (key: string, value: any) => void;
  accentColor?: string; // e.g. 'text-orange-400', 'border-orange-500'
  title?: string;
}

export const TableExportSection: React.FC<TableExportSectionProps> = ({
  items = [],
  outputVariable,
  exportFormat = 'none',
  exportFilename,
  onPropChange,
  accentColor = 'orange',
  title = 'Table Output & Direct Export',
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasItems = Array.isArray(items) && items.length > 0;
  const headers = hasItems && typeof items[0] === 'object' && items[0] !== null
    ? Object.keys(items[0]).slice(0, 6)
    : [];

  const filename = exportFilename || `${outputVariable}_table`;

  const handleQuickDownload = (fmt: 'csv' | 'xlsx' | 'json') => {
    if (!hasItems) return;
    exportAndDownloadDataset(items, fmt, filename);
  };

  const handleCopyTsv = async () => {
    if (!hasItems) return;
    try {
      const tsv = jsonToCsv(items, { delimiter: '\t' });
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="pt-3 border-t border-[#1c2230] space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-200">
          <TableIcon className="w-3.5 h-3.5 text-orange-400" />
          <span>{title}</span>
        </span>
        {hasItems && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {items.length} {items.length === 1 ? 'row' : 'rows'}
          </span>
        )}
      </div>

      {/* Mini Table Preview */}
      {hasItems ? (
        <div className="rounded-lg bg-[#11141c] border border-[#1c2230] p-2 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>Table Preview:</span>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="text-orange-400 hover:text-orange-300 flex items-center gap-1 font-medium transition-colors text-[10px]"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Full Table</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded border border-[#1f2637]">
            <table className="w-full text-[10px] font-mono border-collapse">
              <thead>
                <tr className="bg-[#181d2a] text-gray-300 border-b border-[#283247]">
                  {headers.map((h) => (
                    <th key={h} className="py-1 px-1.5 text-left truncate max-w-[90px] text-orange-400/90 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c2230]">
                {items.slice(0, 3).map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/5">
                    {headers.map((h) => (
                      <td key={h} className="py-1 px-1.5 text-gray-300 truncate max-w-[90px]" title={String(row[h] ?? '')}>
                        {typeof row[h] === 'object' ? JSON.stringify(row[h]) : String(row[h] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {items.length > 3 && (
            <div className="text-[10px] text-gray-500 text-center italic">
              + {items.length - 3} more rows in dataset
            </div>
          )}

          {/* Quick 1-click Download Action Buttons */}
          <div className="pt-1.5 border-t border-[#1c2230] flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleQuickDownload('csv')}
              className="flex-1 py-1 px-2 rounded bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 border border-orange-500/30 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
              title="Download CSV immediately"
            >
              <Download className="w-3 h-3" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDownload('xlsx')}
              className="flex-1 py-1 px-2 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
              title="Download Excel XLSX immediately"
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDownload('json')}
              className="flex-1 py-1 px-2 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
              title="Download JSON immediately"
            >
              <FileText className="w-3 h-3" />
              <span>JSON</span>
            </button>

            <button
              type="button"
              onClick={handleCopyTsv}
              className="py-1 px-2 rounded bg-[#1c2230] hover:bg-[#283247] text-gray-300 text-[10px] flex items-center justify-center gap-1 transition-colors"
              title="Copy Table to Clipboard (TSV format)"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-2.5 rounded-lg bg-[#11141c] border border-dashed border-[#232a3b] text-center text-[11px] text-gray-500 space-y-1">
          <p>No table data yet. Run scraper to preview and export table.</p>
        </div>
      )}

      {/* Auto-Export File Setting */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-medium text-gray-400">
          Auto-Export On Complete
        </label>
        <div className="grid grid-cols-4 gap-1 bg-[#11141c] p-1 rounded-lg border border-[#1c2230]">
          {['none', 'csv', 'excel', 'json'].map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => onPropChange('exportFormat', fmt)}
              className={`py-1 text-[10px] font-medium rounded uppercase transition-colors ${
                (exportFormat || 'none') === fmt
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {exportFormat !== 'none' && (
        <div>
          <label className="block text-[10px] font-medium text-gray-400 mb-1">Export Filename</label>
          <input
            type="text"
            value={exportFilename || `${outputVariable}_data`}
            onChange={(e) => onPropChange('exportFilename', e.target.value)}
            placeholder="scraped_data"
            className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none text-xs font-mono"
          />
        </div>
      )}

      {/* Full Table Modal */}
      {isModalOpen && (
        <TableModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={`${outputVariable} Data Table`}
          data={items}
          defaultFilename={filename}
        />
      )}
    </div>
  );
};
