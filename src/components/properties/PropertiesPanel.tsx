import React, { useState, useEffect } from 'react';
import { WorkflowNode } from '../../types/workflow';
import { NodeRuntimeState } from '../../types/execution';
import { Icon } from '../common/Icon';
import { NODE_REGISTRY } from '../../nodes/registry';
import {
  Play,
  Trash2,
  EyeOff,
  Eye,
  Crosshair,
  ChevronRight,
  Sparkles,
  Check,
  AlertCircle,
  Clock,
  Code,
  RefreshCw,
} from 'lucide-react';
import { fetchAvailableModels } from '../../ai/aiService';
import { ModelOption, AiProvider } from '../../ai/types';

interface PropertiesPanelProps {
  selectedNode: WorkflowNode | null;
  runtimeState?: NodeRuntimeState;
  variables: Record<string, any>;
  onUpdateProperties: (nodeId: string, properties: Record<string, any>) => void;
  onUpdateLabel: (nodeId: string, label: string) => void;
  onToggleDisable: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onRunSingleNode: (node: WorkflowNode) => void;
  onStartElementPicker: () => void;
  isPickingElement: boolean;
  onClose: () => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedNode,
  runtimeState,
  variables,
  onUpdateProperties,
  onUpdateLabel,
  onToggleDisable,
  onDeleteNode,
  onRunSingleNode,
  onStartElementPicker,
  isPickingElement,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'config' | 'strategies'>('config');
  const [aiAgentModels, setAiAgentModels] = useState<ModelOption[]>([]);
  const [isLoadingAiModels, setIsLoadingAiModels] = useState(false);
  const [customAiModelMode, setCustomAiModelMode] = useState(false);

  const loadAiModels = async (provider?: AiProvider, openaiBaseUrl?: string) => {
    setIsLoadingAiModels(true);
    try {
      const list = await fetchAvailableModels({
        ...(provider ? { provider } : {}),
        ...(openaiBaseUrl ? { openaiBaseUrl } : {}),
      });
      setAiAgentModels(list);
    } catch (err) {
      console.warn('Failed to load models:', err);
    } finally {
      setIsLoadingAiModels(false);
    }
  };

  useEffect(() => {
    if (selectedNode?.data.type === 'ai_agent' || selectedNode?.data.type === 'autonomous_agent') {
      loadAiModels(selectedNode.data.properties?.provider, selectedNode.data.properties?.openaiBaseUrl);
    }
  }, [
    selectedNode?.id,
    selectedNode?.data.type,
    selectedNode?.data.properties?.provider,
    selectedNode?.data.properties?.openaiBaseUrl,
  ]);

  if (!selectedNode) {
    return null;
  }

  const def = NODE_REGISTRY[selectedNode.data.type] || {
    label: selectedNode.data.label,
    icon: 'Box',
    category: 'browser',
    description: '',
  };

  const props = selectedNode.data.properties || {};

  const handlePropChange = (key: string, value: any) => {
    onUpdateProperties(selectedNode.id, {
      ...props,
      [key]: value,
    });
  };

  const availableVars = Object.keys(variables);

  return (
    <aside className="w-full sm:w-80 max-w-full absolute sm:relative right-0 top-0 bottom-0 border-l border-[#1c2230] bg-[#0c0e14] flex flex-col select-none z-20 sm:z-10 shadow-2xl sm:shadow-none">
      {/* Header */}
      <div className="p-3 border-b border-[#1c2230] flex items-center justify-between bg-[#11141c]">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0">
            <Icon name={def.icon} className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={selectedNode.data.label}
            onChange={(e) => onUpdateLabel(selectedNode.id, e.target.value)}
            className="bg-transparent font-semibold text-xs text-white border-b border-transparent hover:border-[#232a3b] focus:border-indigo-500 outline-none truncate w-36"
            title="Edit node title"
          />
        </div>

        <div className="flex items-center gap-1">
          {/* Run Single Node Debug Button */}
          <button
            onClick={() => onRunSingleNode(selectedNode)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white text-[11px] font-medium transition-colors"
            title="Run this node only (for debugging)"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Run</span>
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-[#161a24] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Node Description */}
      <div className="px-4 py-2 bg-[#11141c]/50 text-[11px] text-gray-400 border-b border-[#1c2230]">
        {def.description}
      </div>

      {/* Form Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* URL Field (Navigate / New Tab) */}
        {['navigate', 'new_tab', 'http_request'].includes(selectedNode.data.type) && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Target URL</label>
            <input
              type="text"
              value={props.url || ''}
              onChange={(e) => handlePropChange('url', e.target.value)}
              placeholder="https://example.com or {{url}}"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-[11px]"
            />
          </div>
        )}

        {/* Element Selector with Picker Button (Click, Type, Extract, Hover, etc.) */}
        {['click', 'type_text', 'clear_input', 'hover', 'wait_for_element', 'extract_text', 'extract_attribute', 'extract_html', 'extract_table', 'extract_multiple', 'extract_links', 'contains'].includes(selectedNode.data.type) && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-400">Element Selector</label>
              <button
                onClick={onStartElementPicker}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  isPickingElement
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30'
                }`}
                title="Select directly from active web page"
              >
                <Crosshair className="w-3 h-3" />
                <span>{isPickingElement ? 'Picking...' : 'Select Element'}</span>
              </button>
            </div>

            <input
              type="text"
              value={props.selector || ''}
              onChange={(e) => handlePropChange('selector', e.target.value)}
              placeholder="#button, [data-testid='...'], //button"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-[11px]"
            />

            {/* Selector Strategies Switcher */}
            {props.strategies && props.strategies.length > 0 && (
              <div className="mt-2 p-2 rounded-lg bg-[#11141c] border border-[#1c2230]">
                <div className="text-[10px] font-semibold text-gray-400 mb-1.5 flex items-center justify-between">
                  <span>Detected Strategies:</span>
                  <span className="text-indigo-400">{props.strategies.length} options</span>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {props.strategies.map((strat: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => handlePropChange('selector', strat.value)}
                      className={`w-full text-left p-1 rounded text-[10px] font-mono truncate transition-colors flex items-center justify-between ${
                        props.selector === strat.value
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'bg-[#161a24] text-gray-400 hover:text-white'
                      }`}
                      title={strat.value}
                    >
                      <span className="truncate">{strat.value}</span>
                      <span className="opacity-60 text-[9px] uppercase shrink-0 ml-1">{strat.type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contains Node (element / text presence check) */}
        {selectedNode.data.type === 'contains' && (
          <div className="space-y-2.5 pt-3 border-t border-[#1c2230]">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Match Mode</label>
              <select
                value={props.matchMode || 'element'}
                onChange={(e) => handlePropChange('matchMode', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="element">Element exists on page</option>
                <option value="text">Element contains text</option>
              </select>
            </div>

            {props.matchMode === 'text' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-400">Text to look for</label>
                  {availableVars.length > 0 && (
                    <span className="text-[10px] text-gray-500">Supports &#123;&#123;var&#125;&#125;</span>
                  )}
                </div>
                <input
                  type="text"
                  value={props.text || ''}
                  onChange={(e) => handlePropChange('text', e.target.value)}
                  placeholder="e.g. Welcome back"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs"
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={props.visibleOnly !== false}
                onChange={(e) => handlePropChange('visibleOnly', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span>Require element to be visible</span>
            </label>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable (boolean)</label>
              <input
                type="text"
                value={props.outputVariable || 'elementPresent'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="elementPresent"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            <p className="text-[10px] text-gray-500 leading-relaxed">
              Continues on the <span className="text-emerald-400 font-semibold">TRUE</span> branch when the element is
              present, otherwise on the <span className="text-rose-400 font-semibold">FALSE</span> branch.
            </p>
          </div>
        )}

        {/* Text Field (Type Text, Wait For Text) */}
        {['type_text', 'wait_for_text'].includes(selectedNode.data.type) && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-400">Text</label>
              {availableVars.length > 0 && (
                <span className="text-[10px] text-gray-500">Supports &#123;&#123;var&#125;&#125;</span>
              )}
            </div>
            <textarea
              rows={3}
              value={props.text || ''}
              onChange={(e) => handlePropChange('text', e.target.value)}
              placeholder="Text to type or wait for..."
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs"
            />
          </div>
        )}

        {/* Type Text Options */}
        {selectedNode.data.type === 'type_text' && (
          <div className="space-y-2 pt-1 border-t border-[#1c2230]">
            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={props.clearExisting !== false}
                onChange={(e) => handlePropChange('clearExisting', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span>Clear existing input text</span>
            </label>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Typing Delay (ms per keystroke)</label>
              <input
                type="number"
                value={props.typingDelay || 0}
                onChange={(e) => handlePropChange('typingDelay', Number(e.target.value))}
                min={0}
                max={1000}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
              />
            </div>
          </div>
        )}

        {/* Click Type (Click) */}
        {selectedNode.data.type === 'click' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Click Type</label>
            <select
              value={props.clickType || 'left'}
              onChange={(e) => handlePropChange('clickType', e.target.value)}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
            >
              <option value="left">Left Click</option>
              <option value="double">Double Click</option>
              <option value="right">Right Click (Context Menu)</option>
            </select>
          </div>
        )}

        {/* Key Press & Shortcuts (Press Key) */}
        {selectedNode.data.type === 'press_key' && (
          <div className="space-y-2.5">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Key or Shortcut (e.g. Ctrl+V)</label>
              <input
                type="text"
                value={props.key || 'Enter'}
                onChange={(e) => handlePropChange('key', e.target.value)}
                placeholder="e.g. Ctrl+V, Ctrl+C, Enter, Tab..."
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Quick Shortcuts:</label>
              <div className="flex flex-wrap gap-1">
                {['Ctrl+V', 'Ctrl+C', 'Ctrl+A', 'Enter', 'Tab', 'Escape', 'Backspace'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handlePropChange('key', k)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                      props.key === k
                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                        : 'bg-[#161a24] border-[#232a3b] text-gray-400 hover:text-white hover:bg-[#1c2230]'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Clipboard Node */}
        {selectedNode.data.type === 'clipboard' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Clipboard Action</label>
              <select
                value={props.action || 'write'}
                onChange={(e) => handlePropChange('action', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="write">Copy Text to Clipboard</option>
                <option value="read">Read Text from Clipboard</option>
              </select>
            </div>

            {props.action === 'read' ? (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable Name</label>
                <input
                  type="text"
                  value={props.outputVariable || 'clipboardText'}
                  onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                  placeholder="clipboardText"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-400">Text to Copy</label>
                  <span className="text-[10px] text-purple-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                </div>
                <textarea
                  rows={3}
                  value={props.text || ''}
                  onChange={(e) => handlePropChange('text', e.target.value)}
                  placeholder="e.g. {{extractedText}} or static text"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
                />
              </div>
            )}
          </div>
        )}

        {/* Duration (Wait) */}
        {selectedNode.data.type === 'wait' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Duration (ms)</label>
            <input
              type="number"
              value={props.duration || 1000}
              onChange={(e) => handlePropChange('duration', Number(e.target.value))}
              min={50}
              step={100}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
            />
          </div>
        )}

        {/* Output Variable (Extract Text, Attribute, Table, Screenshot, JS, Data, Storage, AI) */}
        {['extract_text', 'extract_attribute', 'extract_html', 'extract_table', 'extract_multiple', 'extract_links', 'screenshot', 'execute_javascript', 'http_request', 'transform', 'regex', 'json_parse', 'generate_data', 'storage_manage', 'ai_agent'].includes(
          selectedNode.data.type
        ) && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable Name</label>
            <input
              type="text"
              value={props.outputVariable || ''}
              onChange={(e) => handlePropChange('outputVariable', e.target.value)}
              placeholder="e.g. pageTitle, products, result"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-[11px]"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Downstream nodes can reference this via &#123;&#123;{props.outputVariable || 'name'}&#125;&#125;
            </p>
          </div>
        )}

        {/* Attribute Name (Extract Attribute / Extract Multiple) */}
        {['extract_attribute', 'extract_multiple'].includes(selectedNode.data.type) && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              Attribute Name {selectedNode.data.type === 'extract_multiple' && '(optional, leave blank for text)'}
            </label>
            <input
              type="text"
              value={props.attribute || ''}
              onChange={(e) => handlePropChange('attribute', e.target.value)}
              placeholder="href, src, value, data-id..."
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
            />
          </div>
        )}

        {/* Generate Data Node */}
        {selectedNode.data.type === 'generate_data' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Data Type</label>
            <select
              value={props.dataType || 'email'}
              onChange={(e) => handlePropChange('dataType', e.target.value)}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
            >
              <option value="email">Random Email (e.g. user_8392@example.com)</option>
              <option value="name">Random Full Name (e.g. Alex Mercer)</option>
              <option value="uuid">UUID v4</option>
              <option value="number">Random Number</option>
              <option value="timestamp">Current Unix Timestamp</option>
              <option value="date">Current ISO Date String</option>
            </select>
          </div>
        )}

        {/* Storage Manage Node */}
        {selectedNode.data.type === 'storage_manage' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Storage Type</label>
              <select
                value={props.type || 'local'}
                onChange={(e) => handlePropChange('type', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="local">localStorage</option>
                <option value="session">sessionStorage</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Action</label>
              <select
                value={props.action || 'get'}
                onChange={(e) => handlePropChange('action', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="get">Get Item</option>
                <option value="set">Set Item</option>
                <option value="remove">Remove Item</option>
                <option value="clear">Clear Storage</option>
              </select>
            </div>
            {props.action !== 'clear' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Key Name</label>
                <input
                  type="text"
                  value={props.key || ''}
                  onChange={(e) => handlePropChange('key', e.target.value)}
                  placeholder="token, user_preferences..."
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            )}
            {props.action === 'set' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Value</label>
                <input
                  type="text"
                  value={props.value || ''}
                  onChange={(e) => handlePropChange('value', e.target.value)}
                  placeholder="value to store or &#123;&#123;var&#125;&#125;"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
                />
              </div>
            )}
          </div>
        )}

        {/* Clipboard Node */}
        {selectedNode.data.type === 'clipboard' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Text to Copy</label>
            <textarea
              rows={3}
              value={props.text || ''}
              onChange={(e) => handlePropChange('text', e.target.value)}
              placeholder="Text or &#123;&#123;variable&#125;&#125; to write to clipboard"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
            />
          </div>
        )}

        {/* Wait For Navigation Node */}
        {selectedNode.data.type === 'wait_for_navigation' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              URL Pattern (optional, leave blank for any URL change)
            </label>
            <input
              type="text"
              value={props.urlPattern || ''}
              onChange={(e) => handlePropChange('urlPattern', e.target.value)}
              placeholder="e.g. /dashboard or https://..."
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
            />
          </div>
        )}


        {/* AI Agent & Autonomous Browser Agent Nodes */}
        {(selectedNode.data.type === 'ai_agent' || selectedNode.data.type === 'autonomous_agent') && (
          <div className="space-y-3">
            {selectedNode.data.type === 'autonomous_agent' ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-gray-400">Autonomous Goal / Task</label>
                    <span className="text-[10px] text-purple-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                  </div>
                  <textarea
                    rows={3}
                    value={props.goal || ''}
                    onChange={(e) => handlePropChange('goal', e.target.value)}
                    placeholder="e.g. Find {{searchQuery}} on google, click first organic result, and extract heading"
                    className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Iteration Steps</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={props.maxSteps || 10}
                    onChange={(e) => handlePropChange('maxSteps', Number(e.target.value))}
                    className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
              </>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-400">Prompt / Task</label>
                  <span className="text-[10px] text-purple-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                </div>
                <textarea
                  rows={4}
                  value={props.prompt || ''}
                  onChange={(e) => handlePropChange('prompt', e.target.value)}
                  placeholder="e.g. Analyze {{topStory}}. Decide if this is related to AI or Tech."
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
                />
              </div>
            )}

            {/* Provider Override */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Provider</label>
              <select
                value={props.provider || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  handlePropChange('provider', val || undefined);
                  loadAiModels(val ? (val as AiProvider) : undefined);
                }}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="">Use Global Extension Settings</option>
                <option value="openai">OpenAI</option>
                <option value="mistral">Mistral AI</option>
                <option value="gemini">Google Gemini</option>
                <option value="openrouter">OpenRouter</option>
                <option value="custom">Custom / Local LLM</option>
              </select>
            </div>

            {/* Optional OpenAI Base URL override on node */}
            {(props.provider === 'openai' || !props.provider) && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  OpenAI Base URL (optional override)
                </label>
                <input
                  type="text"
                  value={props.openaiBaseUrl || ''}
                  onChange={(e) => {
                    handlePropChange('openaiBaseUrl', e.target.value);
                    loadAiModels(props.provider, e.target.value);
                  }}
                  placeholder="https://api.experientiallabs.ai"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            )}

            {/* Model Selector from /models */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">
                  Model {aiAgentModels.length > 0 && `(${aiAgentModels.length} from /models)`}
                </label>
                <button
                  type="button"
                  onClick={() => setCustomAiModelMode(!customAiModelMode)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {customAiModelMode ? 'Select from list' : 'Type custom model'}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {customAiModelMode ? (
                  <input
                    type="text"
                    value={props.model || ''}
                    onChange={(e) => handlePropChange('model', e.target.value)}
                    placeholder="e.g. gpt-4o, gemini-1.5-pro..."
                    className="flex-1 bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                  />
                ) : (
                  <select
                    value={props.model || 'gpt-5.6-sol'}
                    onChange={(e) => handlePropChange('model', e.target.value)}
                    className="flex-1 bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs truncate"
                  >
                    {aiAgentModels.length > 0 ? (
                      aiAgentModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="gpt-5.6-sol">gpt-5.6-sol</option>
                        <option value="ministral-8b-latest">ministral-8b-latest</option>
                        <option value="mistral-small-latest">mistral-small-latest</option>
                        <option value="mistral-medium-latest">mistral-medium-latest</option>
                        <option value="codestral-latest">codestral-latest</option>
                        <option value="mistral-large-latest">mistral-large-latest</option>
                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                        <option value="gpt-4o">gpt-4o</option>
                        <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                        <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                        <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
                      </>
                    )}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => loadAiModels(props.provider)}
                  disabled={isLoadingAiModels}
                  className="p-2 bg-[#161a24] hover:bg-[#1c2230] text-gray-300 hover:text-white rounded-lg border border-[#232a3b] transition-colors disabled:opacity-50"
                  title="Query /models endpoint"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAiModels ? 'animate-spin text-indigo-400' : ''}`} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable</label>
              <input
                type="text"
                value={props.outputVariable || 'aiAnalysis'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="aiAnalysis"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={!!props.jsonMode}
                onChange={(e) => handlePropChange('jsonMode', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">JSON Mode (parse response into structured object)</span>
            </label>
          </div>
        )}

        {/* Condition Node Rules */}
        {selectedNode.data.type === 'condition' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Left Value / Variable</label>
              <input
                type="text"
                value={props.leftValue || ''}
                onChange={(e) => handlePropChange('leftValue', e.target.value)}
                placeholder="&#123;&#123;price&#125;&#125; or static value"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Operator</label>
              <select
                value={props.operator || 'equals'}
                onChange={(e) => handlePropChange('operator', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="equals">equals</option>
                <option value="not_equals">not equals</option>
                <option value="contains">contains</option>
                <option value="does_not_contain">does not contain</option>
                <option value="greater_than">greater than (&gt;)</option>
                <option value="less_than">less than (&lt;)</option>
                <option value="greater_equal">greater or equal (&gt;=)</option>
                <option value="less_equal">less or equal (&lt;=)</option>
                <option value="exists">exists (not null/empty)</option>
                <option value="does_not_exist">does not exist</option>
                <option value="is_empty">is empty</option>
                <option value="is_not_empty">is not empty</option>
              </select>
            </div>

            {!['exists', 'does_not_exist', 'is_empty', 'is_not_empty'].includes(props.operator) && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Right Value</label>
                <input
                  type="text"
                  value={props.rightValue || ''}
                  onChange={(e) => handlePropChange('rightValue', e.target.value)}
                  placeholder="100, Example, true..."
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            )}
          </div>
        )}

        {/* Loop Node */}
        {selectedNode.data.type === 'loop' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Iteration Count</label>
            <input
              type="number"
              value={props.count || 3}
              onChange={(e) => handlePropChange('count', Number(e.target.value))}
              min={1}
              max={500}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Loop body provides &#123;&#123;index&#125;&#125; (0, 1, 2...)
            </p>
          </div>
        )}

        {/* For Each Node */}
        {selectedNode.data.type === 'for_each' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Array Variable</label>
            <input
              type="text"
              value={props.array || ''}
              onChange={(e) => handlePropChange('array', e.target.value)}
              placeholder="&#123;&#123;products&#125;&#125;"
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Loop body exposes &#123;&#123;item&#125;&#125; and &#123;&#123;index&#125;&#125;
            </p>
          </div>
        )}

        {/* Set Variable Node */}
        {selectedNode.data.type === 'set_variable' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Variable Name</label>
              <input
                type="text"
                value={props.name || ''}
                onChange={(e) => handlePropChange('name', e.target.value)}
                placeholder="username, totalPrice..."
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Value / Expression</label>
              <input
                type="text"
                value={props.value || ''}
                onChange={(e) => handlePropChange('value', e.target.value)}
                placeholder="admin, 42, &#123;&#123;otherVar&#125;&#125;"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              />
            </div>
          </div>
        )}

        {/* Execute JavaScript Node */}
        {selectedNode.data.type === 'execute_javascript' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-400">JavaScript Code</label>
              <span className="text-[10px] text-amber-400">Page Context</span>
            </div>
            <textarea
              rows={6}
              value={props.code || ''}
              onChange={(e) => handlePropChange('code', e.target.value)}
              placeholder="return document.title;"
              className="w-full bg-[#11141c] text-emerald-400 font-mono text-[11px] p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none"
            />
          </div>
        )}

        {/* HTTP Request Node */}
        {selectedNode.data.type === 'http_request' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">HTTP Method</label>
            <select
              value={props.method || 'GET'}
              onChange={(e) => handlePropChange('method', e.target.value)}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </select>
          </div>
        )}

        {/* General Timeout Property */}
        {['navigate', 'click', 'type_text', 'wait_for_element', 'extract_text', 'contains'].includes(selectedNode.data.type) && (
          <div className="pt-2 border-t border-[#1c2230]">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Timeout (ms)</label>
            <input
              type="number"
              value={props.timeout || 10000}
              onChange={(e) => handlePropChange('timeout', Number(e.target.value))}
              min={1000}
              step={1000}
              className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
            />
          </div>
        )}

        {/* Live Execution Output Inspector for Selected Node */}
        {runtimeState && (
          <div className="p-3 rounded-xl bg-[#11141c] border border-[#1c2230] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-gray-400">Node State</span>
              <span
                className={`uppercase text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  runtimeState.status === 'success'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : runtimeState.status === 'error'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : runtimeState.status === 'running'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-gray-800 text-gray-400'
                }`}
              >
                {runtimeState.status}
              </span>
            </div>

            {runtimeState.durationMs !== undefined && (
              <div className="text-[10px] text-gray-400 font-mono">
                Duration: {runtimeState.durationMs}ms
              </div>
            )}

            {runtimeState.output !== undefined && (
              <div className="mt-1">
                <span className="text-[10px] text-gray-400 block mb-0.5">Output:</span>
                <pre className="bg-[#161a24] text-emerald-400 p-2 rounded text-[10px] font-mono overflow-x-auto max-h-24">
                  {typeof runtimeState.output === 'object'
                    ? JSON.stringify(runtimeState.output, null, 2)
                    : String(runtimeState.output)}
                </pre>
              </div>
            )}

            {runtimeState.error && (
              <div className="mt-1">
                <span className="text-[10px] text-rose-400 block mb-0.5">Error:</span>
                <p className="bg-[#161a24] text-rose-400 p-2 rounded text-[10px] font-mono">
                  {runtimeState.error}
                </p>
                {runtimeState.errorDetails?.suggestions && (
                  <div className="mt-2 space-y-1">
                    <span className="text-[10px] text-gray-400 font-medium">Suggestions:</span>
                    <ul className="list-disc list-inside text-[10px] text-gray-400 space-y-0.5">
                      {runtimeState.errorDetails.suggestions.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Controls: Disable & Delete */}
      <div className="p-3 border-t border-[#1c2230] bg-[#11141c] flex items-center justify-between">
        <button
          onClick={() => onToggleDisable(selectedNode.id)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[#161a24] text-gray-400 hover:text-white transition-colors text-xs"
        >
          {selectedNode.data.disabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{selectedNode.data.disabled ? 'Enable Node' : 'Disable Node'}</span>
        </button>

        <button
          onClick={() => onDeleteNode(selectedNode.id)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-rose-500/10 text-gray-400 hover:text-rose-400 transition-colors text-xs"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>
      </div>
    </aside>
  );
};
