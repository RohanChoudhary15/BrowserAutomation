import React, { useState } from 'react';
import { WorkflowNode } from '../../../types/workflow';
import {
  GitFork,
  RefreshCw,
  RotateCcw,
  Gauge,
  UserCheck,
  Plus,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  CheckSquare,
  Square,
  Search,
  Check,
  Layers,
  Info,
} from 'lucide-react';

export interface ControlFlowPropertiesProps {
  selectedNode: WorkflowNode;
  onPropChange: (key: string, value: any) => void;
  allNodes?: WorkflowNode[];
}

export const ControlFlowProperties: React.FC<ControlFlowPropertiesProps> = ({
  selectedNode,
  onPropChange,
  allNodes = [],
}) => {
  const [nodeSearch, setNodeSearch] = useState('');
  const props = selectedNode.data.properties || {};
  const nodeType = selectedNode.data.type;

  switch (nodeType) {
    case 'switch_case':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-purple-500/10 via-violet-500/5 to-transparent border border-purple-500/20">
            <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs mb-1">
              <GitFork className="w-4 h-4" />
              <span>Multi-Way Branching (Switch Case)</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Evaluates an expression and routes execution to the matching case branch handle, or falls back to Default.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Expression to Evaluate</label>
            <input
              type="text"
              value={props.expression || '{{status}}'}
              onChange={(e) => onPropChange('expression', e.target.value)}
              placeholder="{{status}}"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-purple-500 outline-none font-mono text-xs font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Match Mode</label>
              <select
                value={props.matchMode || 'equals'}
                onChange={(e) => onPropChange('matchMode', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-purple-500 outline-none text-xs"
              >
                <option value="equals">Equals (Exact)</option>
                <option value="contains">Contains</option>
                <option value="starts_with">Starts With</option>
                <option value="ends_with">Ends With</option>
                <option value="regex">Regex</option>
              </select>
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!props.caseSensitive}
                  onChange={(e) => onPropChange('caseSensitive', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-purple-600 focus:ring-0"
                />
                <span className="text-[11px]">Case Sensitive</span>
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Cases</label>
              <button
                type="button"
                onClick={() => {
                  const cases = Array.isArray(props.cases) ? [...props.cases] : [];
                  const nextIdx = cases.length;
                  cases.push({ id: `case_${nextIdx}`, value: `val_${nextIdx + 1}`, label: `Case ${nextIdx + 1}` });
                  onPropChange('cases', cases);
                }}
                className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>Add Case</span>
              </button>
            </div>

            <div className="space-y-2">
              {(Array.isArray(props.cases) ? props.cases : []).map((c: any, idx: number) => (
                <div key={c.id || idx} className="flex items-center gap-2 p-2 rounded-lg bg-[#0b0e14] border border-[#1e2433]">
                  <span className="text-[10px] text-purple-400 font-mono font-bold w-12">{c.id || `case_${idx}`}</span>
                  <input
                    type="text"
                    value={c.value ?? ''}
                    onChange={(e) => {
                      const cases = [...props.cases];
                      cases[idx] = { ...cases[idx], value: e.target.value };
                      onPropChange('cases', cases);
                    }}
                    placeholder="Match value"
                    className="flex-1 bg-[#11141c] text-white px-2 py-1 rounded border border-[#1c2230] text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={c.label ?? ''}
                    onChange={(e) => {
                      const cases = [...props.cases];
                      cases[idx] = { ...cases[idx], label: e.target.value };
                      onPropChange('cases', cases);
                    }}
                    placeholder="Label"
                    className="w-20 bg-[#11141c] text-gray-300 px-2 py-1 rounded border border-[#1c2230] text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cases = props.cases.filter((_: any, i: number) => i !== idx);
                      onPropChange('cases', cases);
                    }}
                    className="p-1 text-gray-500 hover:text-rose-400 transition-colors"
                    title="Delete case"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'matchedCase'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="matchedCase"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-purple-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'while_loop':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-blue-500/10 via-cyan-500/5 to-transparent border border-blue-500/20">
            <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs mb-1">
              <RefreshCw className="w-4 h-4" />
              <span>Condition-Driven While Loop</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Repeats connected loop body nodes while condition is true. Connect downstream nodes to &quot;loop_body&quot; and exit nodes to &quot;loop_done&quot;.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Left Value / Variable</label>
            <input
              type="text"
              value={props.leftValue ?? ''}
              onChange={(e) => onPropChange('leftValue', e.target.value)}
              placeholder="e.g. {{itemCount}}"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-blue-500 outline-none font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Operator</label>
              <select
                value={props.operator || 'equals'}
                onChange={(e) => onPropChange('operator', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-blue-500 outline-none text-xs"
              >
                <option value="equals">Equals (==)</option>
                <option value="not_equals">Not Equals (!=)</option>
                <option value="contains">Contains</option>
                <option value="starts_with">Starts With</option>
                <option value="ends_with">Ends With</option>
                <option value="greater_than">Greater Than (&gt;)</option>
                <option value="less_than">Less Than (&lt;)</option>
                <option value="exists">Exists</option>
                <option value="does_not_exist">Does Not Exist</option>
                <option value="is_empty">Is Empty</option>
                <option value="is_not_empty">Is Not Empty</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Right Value</label>
              <input
                type="text"
                value={props.rightValue ?? ''}
                onChange={(e) => onPropChange('rightValue', e.target.value)}
                placeholder="e.g. 50"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-blue-500 outline-none font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Iterations (Safety Guard)</label>
              <input
                type="number"
                value={props.maxIterations ?? 50}
                onChange={(e) => onPropChange('maxIterations', Number(e.target.value))}
                min={1}
                max={2000}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-blue-500 outline-none text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Delay Between Iterations (ms)</label>
              <input
                type="number"
                value={props.delayBetweenMs ?? 500}
                onChange={(e) => onPropChange('delayBetweenMs', Number(e.target.value))}
                step={100}
                min={0}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-blue-500 outline-none text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Iteration Counter Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'whileIteration'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="whileIteration"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-blue-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'retry_block':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent border border-amber-500/20">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-1">
              <RotateCcw className="w-4 h-4" />
              <span>Resilience Retry Block</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Retries operations with automatic backoff delays to survive temporary network blips or page load lags.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Retries</label>
              <input
                type="number"
                value={props.maxRetries ?? 3}
                onChange={(e) => onPropChange('maxRetries', Number(e.target.value))}
                min={1}
                max={10}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Backoff Mode</label>
              <select
                value={props.backoffMode || 'exponential'}
                onChange={(e) => onPropChange('backoffMode', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none text-xs"
              >
                <option value="exponential">Exponential (1s, 2s, 4s...)</option>
                <option value="linear">Linear (1s, 2s, 3s...)</option>
                <option value="fixed">Fixed Delay</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Base Retry Delay (ms)</label>
            <input
              type="number"
              value={props.retryDelayMs ?? 1000}
              onChange={(e) => onPropChange('retryDelayMs', Number(e.target.value))}
              step={500}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'retryInfo'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="retryInfo"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'rate_limiter':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs mb-1">
              <Gauge className="w-4 h-4" />
              <span>Anti-Ban Rate Limiter & Throttler</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Injects randomized jitter delays or enforces strict requests-per-minute pacing to prevent anti-bot detection and 429 errors.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Pacing Mode</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433] text-[10px]">
              {[
                { id: 'jitter_range', label: 'JITTER' },
                { id: 'requests_per_minute', label: 'RPM' },
                { id: 'fixed_delay', label: 'FIXED' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPropChange('mode', m.id)}
                  className={`py-1.5 px-1 text-center rounded-lg font-bold transition-all ${
                    (props.mode || 'jitter_range') === m.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {props.mode === 'fixed_delay' ? (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Delay (ms)</label>
              <input
                type="number"
                value={props.fixedDelayMs ?? 1500}
                onChange={(e) => onPropChange('fixedDelayMs', Number(e.target.value))}
                step={500}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none text-xs"
              />
            </div>
          ) : props.mode === 'requests_per_minute' ? (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Requests Per Minute</label>
              <input
                type="number"
                value={props.requestsPerMinute ?? 30}
                onChange={(e) => onPropChange('requestsPerMinute', Number(e.target.value))}
                min={1}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none text-xs"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Min Jitter (ms)</label>
                <input
                  type="number"
                  value={props.minJitterMs ?? 1000}
                  onChange={(e) => onPropChange('minJitterMs', Number(e.target.value))}
                  step={250}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Jitter (ms)</label>
                <input
                  type="number"
                  value={props.maxJitterMs ?? 3000}
                  onChange={(e) => onPropChange('maxJitterMs', Number(e.target.value))}
                  step={250}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none text-xs"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'throttledMs'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="throttledMs"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'manual_approval':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-rose-500/10 via-pink-500/5 to-transparent border border-rose-500/20">
            <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs mb-1">
              <UserCheck className="w-4 h-4" />
              <span>Human-In-The-Loop Approval</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Pauses workflow execution and displays an interactive modal for user review, 2FA code entry, or CAPTCHA solving before continuing.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Prompt Message</label>
            <textarea
              rows={3}
              value={props.promptMessage ?? 'Please inspect the page or solve CAPTCHA, then click Resume.'}
              onChange={(e) => onPropChange('promptMessage', e.target.value)}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-rose-500 outline-none text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Input Type</label>
              <select
                value={props.inputType || 'confirm'}
                onChange={(e) => onPropChange('inputType', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-rose-500 outline-none text-xs"
              >
                <option value="confirm">Confirm Only (Continue / Cancel)</option>
                <option value="text">Text Input (e.g. 2FA Code)</option>
                <option value="select">Dropdown Choice</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Timeout (Seconds)</label>
              <input
                type="number"
                value={props.timeoutSeconds ?? 0}
                onChange={(e) => onPropChange('timeoutSeconds', Number(e.target.value))}
                placeholder="0 for indefinite"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-rose-500 outline-none text-xs"
              />
            </div>
          </div>

          {props.inputType === 'select' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Select Options (Comma-separated)</label>
              <input
                type="text"
                value={props.selectOptions || 'Approve, Reject'}
                onChange={(e) => onPropChange('selectOptions', e.target.value)}
                placeholder="Option 1, Option 2, Option 3"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-rose-500 outline-none text-xs"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'approvalResponse'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="approvalResponse"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-rose-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'error_handler':
    case 'try_catch': {
      const watchMode = props.watchMode || 'chosen';
      const watchedIds: string[] = Array.isArray(props.watchedNodeIds) ? props.watchedNodeIds : [];

      // Other workflow nodes that can be monitored (excluding this error handler itself)
      const otherNodes = allNodes.filter((n) => n.id !== selectedNode.id);
      const filteredNodes = otherNodes.filter((n) => {
        if (!nodeSearch.trim()) return true;
        const q = nodeSearch.toLowerCase();
        return (
          (n.data?.label || '').toLowerCase().includes(q) ||
          (n.data?.type || '').toLowerCase().includes(q)
        );
      });

      const handleToggleNode = (nodeId: string) => {
        let next: string[];
        if (watchedIds.includes(nodeId)) {
          next = watchedIds.filter((id) => id !== nodeId);
        } else {
          next = [...watchedIds, nodeId];
        }
        onPropChange('watchedNodeIds', next);
      };

      const handleSelectAll = () => {
        onPropChange('watchedNodeIds', otherNodes.map((n) => n.id));
      };

      const handleClearAll = () => {
        onPropChange('watchedNodeIds', []);
      };

      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          {/* Header Banner */}
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/20 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                <ShieldAlert className="w-4 h-4" />
                <span>Error Handler (Non-Stop Workflow)</span>
              </div>
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 font-mono border border-amber-500/30">
                Safe Mode
              </span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Catches errors from chosen nodes without terminating the workflow. Populates <code className="text-amber-300">&#123;&#123;lastError&#125;&#125;</code> and branches to the Error/Catch handle.
            </p>
          </div>

          {/* Watch Mode Selector */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1.5">Error Interception Mode</label>
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 'chosen', label: 'Chosen Nodes', desc: 'Watch selected nodes' },
                { id: 'all', label: 'All Nodes', desc: 'Global safety net' },
                { id: 'try_branch', label: 'Try Branch', desc: 'Nested try-catch flow' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPropChange('watchMode', m.id)}
                  className={`py-1.5 px-2 rounded-lg border text-left transition-colors flex flex-col justify-between ${
                    watchMode === m.id
                      ? 'bg-amber-600/20 border-amber-500/50 text-amber-300 font-medium'
                      : 'bg-[#11141c] border-[#1c2230] text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-[11px] font-medium">{m.label}</span>
                  <span className="text-[9px] opacity-75">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chosen Nodes Checklist */}
          {watchMode === 'chosen' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-gray-300 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                  <span>Choose Nodes to Protect ({watchedIds.length} of {otherNodes.length})</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors px-1.5 py-0.5 rounded hover:bg-amber-950/40"
                  >
                    Select All
                  </button>
                  <span className="text-gray-600">|</span>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[10px] text-gray-400 hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-gray-800/40"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Node Search Filter */}
              {otherNodes.length > 4 && (
                <div className="relative">
                  <Search className="w-3 h-3 text-gray-500 absolute left-2 top-2" />
                  <input
                    type="text"
                    value={nodeSearch}
                    onChange={(e) => setNodeSearch(e.target.value)}
                    placeholder="Search workflow nodes..."
                    className="w-full bg-[#0b0e14] text-white pl-7 pr-2 py-1 rounded border border-[#1f2738] focus:border-amber-500 outline-none text-xs"
                  />
                </div>
              )}

              {/* Node List Checkbox Group */}
              <div className="max-h-48 overflow-y-auto space-y-1 p-1 bg-[#0b0e14] rounded-lg border border-[#1f2738]">
                {otherNodes.length === 0 ? (
                  <div className="p-3 text-center text-[11px] text-gray-500">
                    No other nodes found on the canvas yet. Add other nodes to protect them.
                  </div>
                ) : filteredNodes.length === 0 ? (
                  <div className="p-2 text-center text-[10px] text-gray-500">
                    No nodes match "{nodeSearch}"
                  </div>
                ) : (
                  filteredNodes.map((n) => {
                    const isChecked = watchedIds.includes(n.id);
                    return (
                      <label
                        key={n.id}
                        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors text-xs ${
                          isChecked
                            ? 'bg-amber-950/40 text-amber-200 border border-amber-500/30'
                            : 'hover:bg-[#151a24] text-gray-300 border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleNode(n.id)}
                          className="rounded bg-[#161a24] border-[#232a3b] text-amber-600 focus:ring-0"
                        />
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                          <span className="truncate font-medium text-[11px]">
                            {n.data?.label || n.data?.type || n.id}
                          </span>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/40 text-gray-400 shrink-0">
                            {n.data?.type}
                          </span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Action on Error */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">When Error Occurs</label>
            <select
              value={props.action || 'catch_and_continue'}
              onChange={(e) => onPropChange('action', e.target.value)}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none text-xs"
            >
              <option value="catch_and_continue">
                Execute Error Branch + Continue Rest of Workflow
              </option>
              <option value="skip_node">
                Skip Failing Node & Continue Next Node Directly
              </option>
              <option value="stop">
                Execute Error Branch and Stop Execution
              </option>
            </select>
          </div>

          {/* Continue Workflow Checkbox */}
          <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={props.continueWorkflow !== false}
              onChange={(e) => onPropChange('continueWorkflow', e.target.checked)}
              className="rounded bg-[#161a24] border-[#232a3b] text-amber-600 focus:ring-0"
            />
            <span className="text-[11px]">
              Keep workflow running (never stop execution on caught error)
            </span>
          </label>

          {/* Output Variable */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Error Information Variable</label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={props.outputVariable || 'lastError'}
                onChange={(e) => onPropChange('outputVariable', e.target.value)}
                placeholder="lastError"
                className="flex-1 bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none font-mono text-xs"
              />
              <span className="px-2 py-1 rounded bg-amber-950/60 border border-amber-700/40 text-amber-300 text-[10px] font-mono shrink-0 select-all">
                &#123;&#123;{props.outputVariable || 'lastError'}&#125;&#125;
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="text-[10px] text-gray-500 py-0.5">Available in expressions:</span>
              {[
                `{{${props.outputVariable || 'lastError'}}}`,
                `{{${props.outputVariable || 'lastError'}.message}}`,
                `{{${props.outputVariable || 'lastError'}.nodeName}}`,
                '{{lastErrorMessage}}',
                '{{hasError}}',
              ].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(v)}
                  className="px-1.5 py-0.5 rounded bg-[#1c2230] text-amber-300 border border-amber-500/20 text-[10px] font-mono hover:bg-amber-950/40 transition-colors"
                  title={`Click to copy ${v}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    default:
      return null;
  }
};
