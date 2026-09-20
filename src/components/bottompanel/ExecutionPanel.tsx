import React, { useState } from 'react';
import { ExecutionLog } from '../../types/execution';
import { formatDuration, formatTimestamp } from '../../utils/formatters';
import {
  ChevronUp,
  ChevronDown,
  Terminal,
  Layers,
  Image,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Info,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

interface ExecutionPanelProps {
  logs: ExecutionLog[];
  variables: Record<string, any>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClearLogs: () => void;
  onSelectNode?: (nodeId: string) => void;
}

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
  logs,
  variables,
  isCollapsed,
  onToggleCollapse,
  onClearLogs,
  onSelectNode,
}) => {
  const [activeTab, setActiveTab] = useState<'logs' | 'variables' | 'output'>('logs');
  const [copiedErrors, setCopiedErrors] = useState(false);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  // Filter logs with screenshot preview
  const screenshotLogs = logs.filter((l) => l.screenshotUrl);
  const errorLogs = logs.filter((l) => l.level === 'error');

  const copyAllErrors = (e: React.MouseEvent) => {
    e.stopPropagation();
    const errorText = errorLogs
      .map((l) => `[${formatTimestamp(l.timestamp)}] [${l.nodeName || 'Unknown Node'}]: ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(errorText);
    setCopiedErrors(true);
    setTimeout(() => setCopiedErrors(false), 2000);
  };

  return (
    <div className="border-t border-[#1c2230] bg-[#0c0e14] flex flex-col select-none z-20">
      {/* Panel Top Header Bar */}
      <div className="h-9 px-4 border-b border-[#1c2230] bg-[#11141c] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-white transition-colors"
          >
            {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <span>Console & Execution</span>
          </button>

          {!isCollapsed && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  activeTab === 'logs'
                    ? 'bg-[#1c2230] text-indigo-400 font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Logs ({logs.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('variables')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  activeTab === 'variables'
                    ? 'bg-[#1c2230] text-indigo-400 font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Variables ({Object.keys(variables).length})</span>
              </button>

              <button
                onClick={() => setActiveTab('output')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  activeTab === 'output'
                    ? 'bg-[#1c2230] text-indigo-400 font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Image className="w-3.5 h-3.5" />
                <span>Outputs ({screenshotLogs.length})</span>
              </button>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <div className="flex items-center gap-2">
            {errorLogs.length > 0 && (
              <button
                onClick={copyAllErrors}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/40 border border-rose-800/50 text-rose-300 hover:text-rose-100 hover:bg-rose-900/60 transition-colors text-[11px] font-sans"
                title="Copy all error messages"
              >
                {copiedErrors ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedErrors ? 'Copied' : `Copy Error (${errorLogs.length})`}</span>
              </button>
            )}
            <button
              onClick={onClearLogs}
              className="p-1 rounded text-gray-500 hover:text-white hover:bg-[#1c2230] transition-colors"
              title="Clear Logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Expanded Body */}
      {!isCollapsed && (
        <div className="h-48 overflow-y-auto p-3 font-mono text-xs text-gray-300">
          {/* LOGS TAB */}
          {activeTab === 'logs' && (
            <div className="space-y-1.5">
              {logs.length === 0 ? (
                <div className="text-gray-500 text-[11px] p-2">
                  No execution logs yet. Click &quot;▶ Run&quot; to execute your workflow.
                </div>
              ) : (
                logs.map((log) => {
                  let badge = <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
                  if (log.level === 'success') badge = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
                  if (log.level === 'error') badge = <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
                  if (log.level === 'warn') badge = <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;

                  return (
                    <div
                      key={log.id}
                      onClick={() => log.nodeId && onSelectNode?.(log.nodeId)}
                      className={`flex items-start gap-2 p-1.5 rounded hover:bg-[#161a24] cursor-pointer transition-colors ${
                        log.level === 'error' ? 'bg-rose-950/20 border border-rose-900/30' : ''
                      }`}
                    >
                      <span className="text-[10px] text-gray-500 shrink-0">{formatTimestamp(log.timestamp)}</span>
                      {badge}
                      {log.nodeName && (
                        <span className="font-semibold text-gray-200 shrink-0">[{log.nodeName}]:</span>
                      )}
                      <span className="text-gray-300 flex-1">{log.message}</span>
                      {log.durationMs !== undefined && (
                        <span className="text-[10px] text-gray-500 font-mono shrink-0">
                          {formatDuration(log.durationMs)}
                        </span>
                      )}
                      {log.level === 'error' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const textToCopy = `[${log.nodeName || 'Error'}]: ${log.message}`;
                            navigator.clipboard.writeText(textToCopy);
                            setCopiedLogId(log.id);
                            setTimeout(() => setCopiedLogId(null), 2000);
                          }}
                          className="p-1 rounded text-rose-400 hover:text-rose-100 hover:bg-rose-900/40 transition-colors shrink-0"
                          title="Copy error message"
                        >
                          {copiedLogId === log.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* VARIABLES TAB */}
          {activeTab === 'variables' && (
            <div>
              {Object.keys(variables).length === 0 ? (
                <div className="text-gray-500 text-[11px] p-2">
                  No active variables in execution context. Variables set with Set Variable or Extract nodes appear here.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1c2230] text-[10px] text-gray-500 uppercase">
                      <th className="py-1 px-2 font-medium">Variable</th>
                      <th className="py-1 px-2 font-medium">Type</th>
                      <th className="py-1 px-2 font-medium">Current Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(variables).map(([key, val]) => (
                      <tr key={key} className="border-b border-[#161a24] hover:bg-[#11141c]">
                        <td className="py-1.5 px-2 text-indigo-400 font-semibold">{`{{${key}}}`}</td>
                        <td className="py-1.5 px-2 text-gray-500 text-[10px]">{Array.isArray(val) ? 'array' : typeof val}</td>
                        <td className="py-1.5 px-2 text-emerald-400 truncate max-w-md">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* OUTPUT & SCREENSHOTS TAB */}
          {activeTab === 'output' && (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {screenshotLogs.length === 0 ? (
                <div className="text-gray-500 text-[11px] p-2">
                  No screenshots captured. Add a &quot;Screenshot&quot; node to capture page images.
                </div>
              ) : (
                screenshotLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 bg-[#11141c] border border-[#1c2230] rounded-xl shrink-0 w-64 shadow-md"
                  >
                    <div className="text-[10px] text-gray-400 mb-1.5 truncate">
                      {formatTimestamp(log.timestamp)} - {log.nodeName}
                    </div>
                    <img
                      src={log.screenshotUrl}
                      alt="Captured screenshot"
                      className="w-full h-32 object-cover rounded-lg border border-[#232a3b]"
                    />
                    <a
                      href={log.screenshotUrl}
                      download={`screenshot_${log.timestamp}.png`}
                      className="mt-2 block text-center text-[10px] text-indigo-400 hover:underline"
                    >
                      Download Screenshot
                    </a>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
