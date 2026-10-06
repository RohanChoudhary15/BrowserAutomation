import React, { useState, useRef } from 'react';
import { WorkflowNode } from '../../../types/workflow';
import {
  Compass,
  Link2,
  Calendar,
  Cookie,
  ListOrdered,
  FileCode,
  Braces,
  Printer,
  FileSpreadsheet,
  Upload,
  Table as TableIcon,
  X,
  Repeat,
  GripVertical,
  Plus,
  Check,
} from 'lucide-react';
import { importDatasetFile, parseDatasetString } from '../../../utils/datasetImporter';


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

    case 'print':
      return (
        <div className="space-y-4 pt-2 border-t border-[#1c2230]">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20">
            <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs mb-1">
              <Printer className="w-4 h-4" />
              <span>Console & Workflow Print</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Print variables, arrays, objects, or text messages directly to the browser console and workflow execution logs.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-400">Message / Variable</label>
              <span className="text-[10px] text-blue-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
            </div>
            <textarea
              rows={3}
              value={props.message ?? '{{result}}'}
              onChange={(e) => onPropChange('message', e.target.value)}
              placeholder="e.g. {{myArray}} or Result is: {{count}}"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-blue-500 outline-none font-mono text-xs leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Format</label>
              <select
                value={props.format || 'auto'}
                onChange={(e) => onPropChange('format', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-blue-500 outline-none text-xs"
              >
                <option value="auto">Auto-detect</option>
                <option value="table">Table (console.table)</option>
                <option value="json">JSON String</option>
                <option value="text">Plain Text</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Log Level</label>
              <select
                value={props.level || 'info'}
                onChange={(e) => onPropChange('level', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-blue-500 outline-none text-xs"
              >
                <option value="info">Info</option>
                <option value="log">Log</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={props.toConsole !== false}
              onChange={(e) => onPropChange('toConsole', e.target.checked)}
              className="rounded bg-[#161a24] border-[#232a3b] text-blue-600 focus:ring-0"
            />
            <span className="text-[11px]">Print to DevTools Console (F12)</span>
          </label>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable (Optional)</label>
            <input
              type="text"
              value={props.outputVariable ?? ''}
              onChange={(e) => onPropChange('outputVariable', e.target.value)}
              placeholder="e.g. printedValue (optional)"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-blue-500 outline-none font-mono text-xs"
            />
          </div>
        </div>
      );

    case 'dataset_input':
      return <DatasetInputProperties selectedNode={selectedNode} onPropChange={onPropChange} />;

    default:
      return null;
  }
};

interface DatasetInputPropertiesProps {
  selectedNode: WorkflowNode;
  onPropChange: (key: string, value: any) => void;
}

const DatasetInputProperties: React.FC<DatasetInputPropertiesProps> = ({
  selectedNode,
  onPropChange,
}) => {
  const props = selectedNode.data.properties || {};
  const outVar = props.outputVariable || 'dataset';
  const importedItems: Record<string, any>[] = Array.isArray(props.importedItems) ? props.importedItems : [];
  const importedHeaders: string[] = (Array.isArray(props.importedHeaders) && props.importedHeaders.length > 0)
    ? props.importedHeaders
    : (importedItems.length > 0 ? Object.keys(importedItems[0] || {}) : []);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [rawTextInput, setRawTextInput] = useState<string>(props.rawContent || '');
  const [inputMode, setInputMode] = useState<'file' | 'raw_text'>(props.sourceType === 'raw_text' ? 'raw_text' : 'file');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await importDatasetFile(file);
      onPropChange('importedItems', parsed.rows);
      onPropChange('importedHeaders', parsed.headers);
      onPropChange('importedFilename', parsed.filename);
      onPropChange('exposedVariables', parsed.headers);
      onPropChange('sourceType', 'file');
    } catch (err) {
      console.error('File import error:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleParseRawText = () => {
    if (!rawTextInput.trim()) return;
    try {
      const parsed = parseDatasetString(rawTextInput);
      onPropChange('importedItems', parsed.rows);
      onPropChange('importedHeaders', parsed.headers);
      onPropChange('importedFilename', 'raw_input');
      onPropChange('exposedVariables', parsed.headers);
      onPropChange('rawContent', rawTextInput);
      onPropChange('sourceType', 'raw_text');
    } catch (err: any) {
      alert('Could not parse text: ' + (err?.message || err));
    }
  };

  const handleClear = () => {
    onPropChange('importedItems', []);
    onPropChange('importedHeaders', []);
    onPropChange('importedFilename', '');
    onPropChange('exposedVariables', []);
    onPropChange('rawContent', '');
  };

  return (
    <div className="space-y-4 pt-2 border-t border-[#1c2230]">
      {/* Header Banner */}
      <div className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20">
        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs mb-1">
          <FileSpreadsheet className="w-4 h-4" />
          <span>Dataset Input (CSV / TSV / JSON)</span>
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Import tabular or array data from files or text, then expose each column as variables to feed into loops or actions.
        </p>
      </div>

      {/* Mode Switcher */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
          Input Method
        </label>
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433] text-[10px]">
          <button
            type="button"
            onClick={() => {
              setInputMode('file');
              onPropChange('sourceType', 'file');
            }}
            className={`py-1.5 px-2 text-center rounded-lg font-medium transition-all ${
              inputMode === 'file'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
            }`}
          >
            Upload File (CSV / JSON)
          </button>
          <button
            type="button"
            onClick={() => {
              setInputMode('raw_text');
              onPropChange('sourceType', 'raw_text');
            }}
            className={`py-1.5 px-2 text-center rounded-lg font-medium transition-all ${
              inputMode === 'raw_text'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
            }`}
          >
            Paste Raw Text
          </button>
        </div>
      </div>

      {/* File Upload Mode */}
      {inputMode === 'file' && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 px-3 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-dashed border-emerald-500/40 hover:border-emerald-400 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>{importedItems.length > 0 ? 'Replace File (.csv, .tsv, .json)' : 'Upload File (.csv, .tsv, .json)'}</span>
          </button>
        </div>
      )}

      {/* Raw Text Mode */}
      {inputMode === 'raw_text' && (
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              Raw CSV or JSON Text
            </label>
            <textarea
              rows={4}
              value={rawTextInput}
              onChange={(e) => setRawTextInput(e.target.value)}
              placeholder={'name,email,role\nAlice,alice@example.com,Admin\nBob,bob@example.com,User\n\n-- or JSON array --\n[{"name":"Alice","role":"Admin"}]'}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none text-xs font-mono leading-relaxed"
            />
          </div>
          <button
            type="button"
            onClick={handleParseRawText}
            className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm"
          >
            Parse & Load Data
          </button>
        </div>
      )}

      {/* Output Variable */}
      <div>
        <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable Name</label>
        <input
          type="text"
          value={outVar}
          onChange={(e) => onPropChange('outputVariable', e.target.value)}
          placeholder="dataset"
          className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none font-mono text-xs"
        />
        <p className="text-[10px] text-gray-500 mt-1">
          Downstream nodes and loops reference this via &#123;&#123;{outVar}&#125;&#125;
        </p>
      </div>

      {/* Data Loaded Preview & Summary */}
      {importedItems.length > 0 && (
        <div className="rounded-xl bg-[#0e121a] border border-[#1e2433] p-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold truncate max-w-[200px]">
              <TableIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{props.importedFilename || 'Loaded Dataset'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                {importedItems.length} rows / {importedHeaders.length} cols
              </span>
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded hover:bg-rose-950/50 text-gray-500 hover:text-rose-400 transition-colors"
                title="Clear dataset"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Table Preview */}
          <div className="rounded border border-[#1e2330] overflow-hidden max-h-28 overflow-x-auto text-[9px] font-mono">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1b2233] text-gray-300">
                  {importedHeaders.slice(0, 5).map((h) => (
                    <th key={h} className="p-1 px-1.5 border-b border-[#232a3b] truncate max-w-[90px]">
                      {h}
                    </th>
                  ))}
                  {importedHeaders.length > 5 && (
                    <th className="p-1 px-1 border-b border-[#232a3b] text-gray-500">+{importedHeaders.length - 5}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2330]">
                {importedItems.slice(0, 4).map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/5 text-gray-300">
                    {importedHeaders.slice(0, 5).map((h) => (
                      <td key={h} className="p-1 px-1.5 truncate max-w-[90px]">
                        {String(row[h] ?? '')}
                      </td>
                    ))}
                    {importedHeaders.length > 5 && <td className="p-1 text-gray-500">...</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Column Pills */}
          <div>
            <div className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold mb-1 flex items-center justify-between">
              <span>Available Column Variables:</span>
              <span className="text-emerald-400 font-mono text-[9px] lowercase">click to copy</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
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
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 truncate max-w-[110px] ${
                      isCopied
                        ? 'bg-emerald-800 text-emerald-100 border-emerald-400'
                        : 'bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border-emerald-500/30 hover:border-emerald-400'
                    }`}
                    title={`Click to copy {{${v}}}`}
                  >
                    {isCopied ? <Check className="w-2.5 h-2.5 text-emerald-300 shrink-0" /> : null}
                    <span>&#123;&#123;{v}&#125;&#125;</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick For Each Loop Attachment / Drag Card */}
          <div className="pt-2 border-t border-[#1e2330] space-y-2">
            <div className="flex items-center justify-between text-xs text-indigo-300 font-medium">
              <div className="flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5 text-indigo-400" />
                <span>Iterate this Dataset</span>
              </div>
              <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-700/40">
                &#123;&#123;{outVar}&#125;&#125;
              </span>
            </div>
            <div className="flex items-center gap-2">
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
                  e.dataTransfer.setData('application/autoflow-source-node', selectedNode.id);
                  e.dataTransfer.setData('application/autoflow-source-handle', 'done');
                  e.dataTransfer.effectAllowed = 'copyMove';
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-indigo-950/60 border border-indigo-500/40 hover:bg-indigo-900/60 hover:border-indigo-400 cursor-grab active:cursor-grabbing text-indigo-300 text-xs font-medium transition-all shadow-sm select-none"
                title={`Drag onto canvas to add For Each loop for {{${outVar}}}`}
              >
                <GripVertical className="w-3.5 h-3.5 text-indigo-400/80" />
                <Repeat className="w-3.5 h-3.5 text-indigo-400" />
                <span>Drag Loop</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('autoflow:add-for-each-node', {
                      detail: {
                        arrayKey: outVar,
                        sourceNodeId: selectedNode.id,
                      },
                    })
                  );
                }}
                className="py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1 transition-colors shadow-sm"
                title="Add and connect For Each node immediately below this node"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Loop</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

