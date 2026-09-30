import React, { useState, useMemo } from 'react';
import { X, Search, Download, Copy, Check, FileSpreadsheet, FileText, Table as TableIcon } from 'lucide-react';
import { exportAndDownloadDataset, jsonToCsv, dataToHtmlTable } from '../../utils/documentExporter';

export interface TableModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: any[];
  defaultFilename?: string;
}

export const TableModal: React.FC<TableModalProps> = ({
  isOpen,
  onClose,
  title,
  data,
  defaultFilename = 'scraped_table',
}) => {
  const [search, setSearch] = useState('');
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  // Derive column headers dynamically
  const headers = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const keysSet = new Set<string>();
    data.forEach((row) => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach((k) => keysSet.add(k));
      }
    });
    return Array.from(keysSet);
  }, [data]);

  // Filter rows based on search
  const filteredRows = useMemo(() => {
    if (!Array.isArray(data)) return [];
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    return data.filter((row) => {
      if (!row || typeof row !== 'object') return String(row).toLowerCase().includes(term);
      return Object.values(row).some((val) =>
        String(val ?? '').toLowerCase().includes(term)
      );
    });
  }, [data, search]);

  if (!isOpen) return null;

  const handleCopy = async (format: 'tsv' | 'markdown' | 'json') => {
    try {
      let text = '';
      if (format === 'tsv') {
        text = jsonToCsv(filteredRows, { delimiter: '\t' });
      } else if (format === 'json') {
        text = JSON.stringify(filteredRows, null, 2);
      } else if (format === 'markdown') {
        if (headers.length > 0) {
          const headerRow = `| ${headers.join(' | ')} |`;
          const divider = `| ${headers.map(() => '---').join(' | ')} |`;
          const rows = filteredRows.map((r) =>
            `| ${headers.map((h) => String(r[h] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`
          );
          text = [headerRow, divider, ...rows].join('\n');
        } else {
          text = JSON.stringify(filteredRows, null, 2);
        }
      }
      await navigator.clipboard.writeText(text);
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2000);
    } catch (err) {
      console.error('Failed to copy table:', err);
    }
  };

  const handleExport = (format: 'csv' | 'xlsx' | 'json') => {
    exportAndDownloadDataset(filteredRows, format, defaultFilename);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-5xl h-[85vh] bg-[#0f1219] border border-[#232a3b] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1c2230] bg-[#141824]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <TableIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
                <span>{title}</span>
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-[#1e2433] border border-[#2a3449] text-gray-300">
                  {filteredRows.length} {filteredRows.length === 1 ? 'row' : 'rows'} &bull; {headers.length} columns
                </span>
              </h2>
              <p className="text-xs text-gray-400">Extracted structured table preview and instant multi-format exporter</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-[#1c2230] bg-[#11141c]">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table rows..."
              className="w-full bg-[#161a24] text-gray-200 pl-9 pr-3 py-1.5 rounded-lg border border-[#232a3b] text-xs focus:border-orange-500 outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* Action Export Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Copy Dropdown / Buttons */}
            <div className="flex items-center bg-[#161a24] border border-[#232a3b] rounded-lg p-0.5 text-xs">
              <button
                onClick={() => handleCopy('tsv')}
                className="px-2.5 py-1 text-gray-300 hover:text-white hover:bg-white/5 rounded transition-colors flex items-center gap-1.5"
                title="Copy TSV (paste into Excel/Sheets)"
              >
                {copiedFormat === 'tsv' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedFormat === 'tsv' ? 'Copied TSV' : 'Copy Table'}</span>
              </button>
              <button
                onClick={() => handleCopy('markdown')}
                className="px-2 py-1 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
                title="Copy as Markdown Table"
              >
                {copiedFormat === 'markdown' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : 'MD'}
              </button>
              <button
                onClick={() => handleCopy('json')}
                className="px-2 py-1 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
                title="Copy formatted JSON"
              >
                {copiedFormat === 'json' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : 'JSON'}
              </button>
            </div>

            {/* Instant Download Export Buttons */}
            <button
              onClick={() => handleExport('csv')}
              className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-colors"
              title="Download as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            <button
              onClick={() => handleExport('xlsx')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-colors"
              title="Download as Excel XLSX spreadsheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              onClick={() => handleExport('json')}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-colors"
              title="Download as JSON file"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {/* Table View Area */}
        <div className="flex-1 overflow-auto bg-[#0b0d13] p-4 font-mono text-xs">
          {filteredRows.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
              <TableIcon className="w-8 h-8 opacity-40" />
              <p>No table rows found {search ? `matching "${search}"` : ''}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#232a3b] shadow-inner">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#181d2a] border-b border-[#283247] sticky top-0 z-10">
                    <th className="py-2.5 px-3 font-semibold text-gray-300 w-12 text-center border-r border-[#232a3b]">#</th>
                    {headers.map((h) => (
                      <th
                        key={h}
                        className="py-2.5 px-3 font-semibold text-orange-400 whitespace-nowrap border-r border-[#232a3b] last:border-r-0"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2230]">
                  {filteredRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-[#161a26] transition-colors odd:bg-[#10131c] even:bg-[#0c0e14]"
                    >
                      <td className="py-2 px-3 text-center text-gray-500 border-r border-[#1c2230] select-none text-[11px]">
                        {idx + 1}
                      </td>
                      {headers.map((h) => {
                        const val = row[h];
                        const isLink = typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'));
                        return (
                          <td
                            key={h}
                            className="py-2 px-3 text-gray-200 border-r border-[#1c2230] last:border-r-0 max-w-xs truncate"
                            title={String(val ?? '')}
                          >
                            {isLink ? (
                              <a
                                href={val}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-400 hover:underline flex items-center gap-1"
                              >
                                <span className="truncate">{val}</span>
                              </a>
                            ) : typeof val === 'boolean' ? (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${val ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-gray-800 text-gray-400'}`}>
                                {String(val)}
                              </span>
                            ) : val === null || val === undefined ? (
                              <span className="text-gray-600 italic">null</span>
                            ) : typeof val === 'object' ? (
                              <span className="text-amber-400/90">{JSON.stringify(val)}</span>
                            ) : (
                              String(val)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer status bar */}
        <div className="px-6 py-2.5 bg-[#141824] border-t border-[#1c2230] flex items-center justify-between text-xs text-gray-400">
          <div>
            Showing {filteredRows.length} of {data.length} records
          </div>
          <div className="flex items-center gap-3">
            <span>Filename: <code className="text-gray-300 font-mono">{defaultFilename}.csv</code></span>
            <button
              onClick={onClose}
              className="px-3 py-1 rounded bg-[#232a3b] hover:bg-[#2e374d] text-gray-200 transition-colors text-xs"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
