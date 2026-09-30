import React from 'react';
import { WorkflowNode } from '../../../types/workflow';
import {
  Compass,
  Link2,
  Calendar,
  Cookie,
  ListOrdered,
  FileCode,
  Braces,
} from 'lucide-react';

export interface DataNodesPropertiesProps {
  selectedNode: WorkflowNode;
  onPropChange: (key: string, value: any) => void;
}

export const DataNodesProperties: React.FC<DataNodesPropertiesProps> = ({
  selectedNode,
  onPropChange,
}) => {
  const props = selectedNode.data.properties || {};
  const nodeType = selectedNode.data.type;

  switch (nodeType) {
    case 'get_page_info':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20">
            <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs mb-1">
              <Compass className="w-4 h-4" />
              <span>Page Context & Metadata</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Captures the active tab's full URL, page title, domain, origin, canonical link, OpenGraph image, and meta description without DOM scraping.
            </p>
          </div>

          <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={props.unpackVariables !== false}
              onChange={(e) => onPropChange('unpackVariables', e.target.checked)}
              className="rounded bg-[#161a24] border-[#232a3b] text-blue-600 focus:ring-0"
            />
            <span className="text-[11px]">Auto-export &#123;&#123;currentUrl&#125;&#125;, &#123;&#123;pageTitle&#125;&#125;, &#123;&#123;currentDomain&#125;&#125;</span>
          </label>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'pageInfo'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="pageInfo"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-blue-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'get_url_details':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-500/10 via-sky-500/5 to-transparent border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs mb-1">
              <Link2 className="w-4 h-4" />
              <span>URL Inspector & Parameter Parser</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Dissects URLs into hostname, path, protocol, and query string dictionary.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Source URL</label>
            <input
              type="text"
              value={props.sourceUrl ?? 'current'}
              onChange={(e) => onPropChange('sourceUrl', e.target.value)}
              placeholder="current or {{myUrl}}"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-cyan-500 outline-none font-mono text-xs"
            />
            <p className="text-[10px] text-gray-500 mt-1">Leave as &quot;current&quot; for the active page URL.</p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Extract Specific Query Parameter (Optional)</label>
            <input
              type="text"
              value={props.targetParam ?? ''}
              onChange={(e) => onPropChange('targetParam', e.target.value)}
              placeholder="e.g. id, page, q, utm_source"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-cyan-500 outline-none font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'urlDetails'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="urlDetails"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-cyan-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'date_time':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/20">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-1">
              <Calendar className="w-4 h-4" />
              <span>Date & Time Engine</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Generate timestamps, format dates, calculate date differences, or apply offsets with timezone support.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Mode</label>
            <div className="grid grid-cols-4 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433] text-[10px]">
              {[
                { id: 'current_time', label: 'NOW' },
                { id: 'format_date', label: 'FORMAT' },
                { id: 'add_subtract', label: 'OFFSET' },
                { id: 'date_diff', label: 'DIFF' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPropChange('mode', m.id)}
                  className={`py-1.5 px-1 text-center rounded-lg font-bold transition-all ${
                    (props.mode || 'current_time') === m.id
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {props.mode !== 'current_time' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Base Date / Variable</label>
              <input
                type="text"
                value={props.inputDate ?? ''}
                onChange={(e) => onPropChange('inputDate', e.target.value)}
                placeholder="e.g. {{createdDate}} or 2026-09-25 (defaults to now)"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none font-mono text-xs"
              />
            </div>
          )}

          {props.mode === 'add_subtract' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Offset Amount</label>
                <input
                  type="number"
                  value={props.amount ?? 1}
                  onChange={(e) => onPropChange('amount', Number(e.target.value))}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Unit</label>
                <select
                  value={props.unit || 'days'}
                  onChange={(e) => onPropChange('unit', e.target.value)}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none text-xs"
                >
                  <option value="days">Days</option>
                  <option value="hours">Hours</option>
                  <option value="minutes">Minutes</option>
                  <option value="seconds">Seconds</option>
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </select>
              </div>
            </div>
          )}

          {props.mode === 'date_diff' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Compare Date / Variable</label>
              <input
                type="text"
                value={props.compareDate ?? ''}
                onChange={(e) => onPropChange('compareDate', e.target.value)}
                placeholder="e.g. {{targetDate}} or 2026-01-01"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none font-mono text-xs"
              />
            </div>
          )}

          {props.mode !== 'date_diff' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Format</label>
                <select
                  value={props.format || 'iso'}
                  onChange={(e) => onPropChange('format', e.target.value)}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none text-xs"
                >
                  <option value="iso">ISO 8601</option>
                  <option value="datetime">YYYY-MM-DD HH:mm:ss</option>
                  <option value="date_only">YYYY-MM-DD (Date Only)</option>
                  <option value="time_only">HH:mm:ss (Time Only)</option>
                  <option value="timestamp_ms">Timestamp (ms)</option>
                  <option value="timestamp_s">Timestamp (seconds)</option>
                  <option value="custom">Custom Format Mask</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Timezone</label>
                <input
                  type="text"
                  value={props.timeZone || 'local'}
                  onChange={(e) => onPropChange('timeZone', e.target.value)}
                  placeholder="local, UTC, America/New_York"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none text-xs"
                />
              </div>
            </div>
          )}

          {props.format === 'custom' && props.mode !== 'date_diff' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Custom Mask</label>
              <input
                type="text"
                value={props.customFormat || 'YYYY-MM-DD HH:mm:ss'}
                onChange={(e) => onPropChange('customFormat', e.target.value)}
                placeholder="YYYY-MM-DD HH:mm:ss"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none font-mono text-xs"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'dateTimeResult'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="dateTimeResult"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'cookie_manager':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent border border-orange-500/20">
            <div className="flex items-center gap-2 text-orange-400 font-semibold text-xs mb-1">
              <Cookie className="w-4 h-4" />
              <span>Cookie Manager</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Inspect, retrieve, set, or delete browser cookies for session handling.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Action</label>
            <div className="grid grid-cols-4 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433] text-[10px]">
              {[
                { id: 'get', label: 'GET' },
                { id: 'getAll', label: 'GET ALL' },
                { id: 'set', label: 'SET' },
                { id: 'delete', label: 'DELETE' },
              ].map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => onPropChange('action', act.id)}
                  className={`py-1.5 px-1 text-center rounded-lg font-bold transition-all ${
                    (props.action || 'get') === act.id
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                  }`}
                >
                  {act.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Cookie Name</label>
            <input
              type="text"
              value={props.name ?? ''}
              onChange={(e) => onPropChange('name', e.target.value)}
              placeholder="e.g. session_id, token"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none font-mono text-xs"
            />
          </div>

          {props.action === 'set' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Cookie Value</label>
              <input
                type="text"
                value={props.value ?? ''}
                onChange={(e) => onPropChange('value', e.target.value)}
                placeholder="e.g. {{token}} or myValue"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none font-mono text-xs"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">URL (Optional)</label>
            <input
              type="text"
              value={props.url ?? ''}
              onChange={(e) => onPropChange('url', e.target.value)}
              placeholder="defaults to current active tab"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'cookieResult'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="cookieResult"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'array_operation':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-pink-500/10 via-rose-500/5 to-transparent border border-pink-500/20">
            <div className="flex items-center gap-2 text-pink-400 font-semibold text-xs mb-1">
              <ListOrdered className="w-4 h-4" />
              <span>Array Utilities</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Filter, sort, deduplicate, slice, push, or join arrays visually without writing JavaScript.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Target Array Variable</label>
            <input
              type="text"
              value={props.array || '{{items}}'}
              onChange={(e) => onPropChange('array', e.target.value)}
              placeholder="{{items}}"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none font-mono text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Operation</label>
            <select
              value={props.operation || 'deduplicate'}
              onChange={(e) => onPropChange('operation', e.target.value)}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none text-xs"
            >
              <option value="deduplicate">Deduplicate (Remove duplicates)</option>
              <option value="filter_empty">Filter Empty (Remove null, empty)</option>
              <option value="filter_by_field">Filter By Field Value</option>
              <option value="slice">Slice (Limit / Sub-array)</option>
              <option value="sort">Sort (Ascending / Descending)</option>
              <option value="join">Join to String</option>
              <option value="push">Push (Append item)</option>
              <option value="pop">Pop (Remove last item)</option>
              <option value="shift">Shift (Remove first item)</option>
              <option value="count">Count (Array length)</option>
              <option value="reverse">Reverse</option>
              <option value="flatten">Flatten (1-level)</option>
            </select>
          </div>

          {props.operation === 'push' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Item to Push</label>
              <input
                type="text"
                value={props.item ?? ''}
                onChange={(e) => onPropChange('item', e.target.value)}
                placeholder="e.g. {{newItem}} or value"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none font-mono text-xs"
              />
            </div>
          )}

          {props.operation === 'filter_by_field' && (
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Object Field Name</label>
                <input
                  type="text"
                  value={props.field ?? ''}
                  onChange={(e) => onPropChange('field', e.target.value)}
                  placeholder="e.g. price, status, title"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Filter Operator</label>
                  <select
                    value={props.filterOperator || 'not_empty'}
                    onChange={(e) => onPropChange('filterOperator', e.target.value)}
                    className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none text-xs"
                  >
                    <option value="not_empty">Not Empty</option>
                    <option value="equals">Equals</option>
                    <option value="not_equals">Not Equals</option>
                    <option value="contains">Contains</option>
                    <option value="greater_than">Greater Than (&gt;)</option>
                    <option value="less_than">Less Than (&lt;)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Filter Value</label>
                  <input
                    type="text"
                    value={props.filterValue ?? ''}
                    onChange={(e) => onPropChange('filterValue', e.target.value)}
                    placeholder="e.g. 100 or active"
                    className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {['deduplicate', 'sort'].includes(props.operation) && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Field Name (Optional, for object array)</label>
              <input
                type="text"
                value={props.field ?? ''}
                onChange={(e) => onPropChange('field', e.target.value)}
                placeholder="e.g. id, url, name"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none font-mono text-xs"
              />
            </div>
          )}

          {props.operation === 'sort' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Sort Order</label>
              <select
                value={props.sortOrder || 'asc'}
                onChange={(e) => onPropChange('sortOrder', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none text-xs"
              >
                <option value="asc">Ascending (A-Z, 0-9)</option>
                <option value="desc">Descending (Z-A, 9-0)</option>
              </select>
            </div>
          )}

          {props.operation === 'slice' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Start Index</label>
                <input
                  type="number"
                  value={props.sliceStart ?? 0}
                  onChange={(e) => onPropChange('sliceStart', Number(e.target.value))}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">End Index</label>
                <input
                  type="number"
                  value={props.sliceEnd ?? 10}
                  onChange={(e) => onPropChange('sliceEnd', e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none text-xs"
                />
              </div>
            </div>
          )}

          {props.operation === 'join' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Delimiter</label>
              <input
                type="text"
                value={props.delimiter ?? ', '}
                onChange={(e) => onPropChange('delimiter', e.target.value)}
                placeholder=", "
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none font-mono text-xs"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'processedArray'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="processedArray"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'string_template':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent border border-teal-500/20">
            <div className="flex items-center gap-2 text-teal-400 font-semibold text-xs mb-1">
              <FileCode className="w-4 h-4" />
              <span>String Template Interpolator</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Build formatted multi-line text, markdown, or messages with variable interpolation.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-400">Template</label>
              <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
            </div>
            <textarea
              rows={5}
              value={props.template ?? 'Hello {{name}},\nYour status is {{status}}.'}
              onChange={(e) => onPropChange('template', e.target.value)}
              placeholder="Type your multi-line template here..."
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-teal-500 outline-none text-xs font-mono leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Casing</label>
              <select
                value={props.casing || 'none'}
                onChange={(e) => onPropChange('casing', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-teal-500 outline-none text-xs"
              >
                <option value="none">Original (None)</option>
                <option value="uppercase">UPPERCASE</option>
                <option value="lowercase">lowercase</option>
                <option value="capitalize">Capitalize first</option>
                <option value="title_case">Title Case</option>
              </select>
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!props.escapeHtml}
                  onChange={(e) => onPropChange('escapeHtml', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-teal-600 focus:ring-0"
                />
                <span className="text-[11px]">Escape HTML</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'renderedTemplate'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="renderedTemplate"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-teal-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'json_query':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-transparent border border-violet-500/20">
            <div className="flex items-center gap-2 text-violet-400 font-semibold text-xs mb-1">
              <Braces className="w-4 h-4" />
              <span>JSON Path Query</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Extract nested values or arrays from JSON objects using dot/bracket path queries (e.g. data.items[0].price or users.*.name).
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">JSON Input / Variable</label>
            <input
              type="text"
              value={props.jsonInput || '{{apiResponse}}'}
              onChange={(e) => onPropChange('jsonInput', e.target.value)}
              placeholder="{{apiResponse}}"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-violet-500 outline-none font-mono text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Query Path</label>
            <input
              type="text"
              value={props.queryPath || 'data.items[0].id'}
              onChange={(e) => onPropChange('queryPath', e.target.value)}
              placeholder="e.g. data.items[0].id or users.*.email"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-violet-500 outline-none font-mono text-xs"
            />
            <p className="text-[10px] text-gray-500 mt-1">Supports dot-notation, array indexes [0], and wildcards [*].</p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Fallback Value (Optional)</label>
            <input
              type="text"
              value={props.fallbackValue ?? ''}
              onChange={(e) => onPropChange('fallbackValue', e.target.value)}
              placeholder="Value if path not found"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-violet-500 outline-none font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
            <input
              type="text"
              value={props.outputVariable || 'jsonQueryResult'}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="jsonQueryResult"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-violet-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    default:
      return null;
  }
};
