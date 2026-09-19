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
  Plus,
  Bookmark,
  Image as ImageIcon,
  Key,
  Copy,
  ClipboardCopy,
  Layers,
  Download,
  Bell,
  Calculator,
} from 'lucide-react';
import { fetchAvailableModels } from '../../ai/aiService';
import { ModelOption, AiProvider } from '../../ai/types';
import { BotCredentialsModal } from '../modals/BotCredentialsModal';
import {
  getCredentialsByPlatform,
  saveCredential,
  BotCredential,
  MessagingPlatform,
} from '../../storage/credentialStore';

const getImagePreviews = (output: any): string[] => {
  if (!output) return [];
  if (typeof output === 'string' && (output.startsWith('data:image/') || output.startsWith('http://') || output.startsWith('https://') || output.startsWith('blob:'))) {
    return [output];
  }
  if (typeof output === 'object') {
    if (Array.isArray(output)) {
      const urls: string[] = [];
      for (const item of output) {
        if (typeof item === 'string' && (item.startsWith('data:image/') || item.startsWith('http://') || item.startsWith('https://'))) {
          urls.push(item);
        } else if (item && typeof item === 'object' && (item.dataUrl || item.url)) {
          urls.push(item.dataUrl || item.url);
        }
      }
      return urls;
    }
    if (output.dataUrl || output.url) {
      return [output.dataUrl || output.url];
    }
  }
  return [];
};

interface PropertiesPanelProps {
  selectedNode: WorkflowNode | null;
  selectedNodes?: WorkflowNode[];
  runtimeState?: NodeRuntimeState;
  variables: Record<string, any>;
  onUpdateProperties: (nodeId: string, properties: Record<string, any>) => void;
  onUpdateLabel: (nodeId: string, label: string) => void;
  onToggleDisable: (nodeId: string) => void;
  onToggleDisableNodes?: (nodeIds: string[]) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteNodes?: (nodeIds: string[]) => void;
  onCopyNode?: (node: WorkflowNode) => void;
  onCopyNodes?: (nodes: WorkflowNode[]) => void;
  onDuplicateNodes?: (nodes: WorkflowNode[]) => void;
  onRunSingleNode: (node: WorkflowNode) => void;
  onStartElementPicker: () => void;
  isPickingElement: boolean;
  onClose: () => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedNode,
  selectedNodes,
  runtimeState,
  variables,
  onUpdateProperties,
  onUpdateLabel,
  onToggleDisable,
  onToggleDisableNodes,
  onDeleteNode,
  onDeleteNodes,
  onCopyNode,
  onCopyNodes,
  onDuplicateNodes,
  onRunSingleNode,
  onStartElementPicker,
  isPickingElement,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'config' | 'strategies'>('config');
  const [aiAgentModels, setAiAgentModels] = useState<ModelOption[]>([]);
  const [isLoadingAiModels, setIsLoadingAiModels] = useState(false);
  const [customAiModelMode, setCustomAiModelMode] = useState(false);

  // Saved Bot Credentials State
  const [savedTelegramCreds, setSavedTelegramCreds] = useState<BotCredential[]>([]);
  const [savedDiscordCreds, setSavedDiscordCreds] = useState<BotCredential[]>([]);
  const [savedSlackCreds, setSavedSlackCreds] = useState<BotCredential[]>([]);
  const [isCredModalOpen, setIsCredModalOpen] = useState(false);
  const [credModalPlatform, setCredModalPlatform] = useState<MessagingPlatform>('telegram');

  const loadBotCredentials = async () => {
    try {
      const [tg, dc, sl] = await Promise.all([
        getCredentialsByPlatform('telegram'),
        getCredentialsByPlatform('discord'),
        getCredentialsByPlatform('slack'),
      ]);
      setSavedTelegramCreds(tg);
      setSavedDiscordCreds(dc);
      setSavedSlackCreds(sl);
    } catch (err) {
      console.warn('Failed to load bot credentials in panel:', err);
    }
  };

  useEffect(() => {
    if (['telegram_message', 'discord_message', 'slack_message'].includes(selectedNode?.data.type || '')) {
      loadBotCredentials();
    }
  }, [selectedNode?.id, selectedNode?.data.type]);

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

  const [showRawOutput, setShowRawOutput] = useState(false);
  const [copiedBase64, setCopiedBase64] = useState(false);

  // Multi-node selection batch overview
  if (selectedNodes && selectedNodes.length > 1) {
    return (
      <aside className="w-full sm:w-80 max-w-full absolute sm:relative right-0 top-0 bottom-0 border-l border-[#1c2230] bg-[#0c0e14] flex flex-col select-none z-20 sm:z-10 shadow-2xl sm:shadow-none">
        {/* Header */}
        <div className="p-3 border-b border-[#1c2230] flex items-center justify-between bg-[#11141c]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-xs text-white">{selectedNodes.length} Nodes Selected</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Selected nodes list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-[11px] text-gray-400 font-medium">Selected Components:</div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {selectedNodes.map((n) => {
              const nDef = NODE_REGISTRY[n.data.type];
              return (
                <div
                  key={n.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#11141c] border border-[#1c2230] text-xs"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Icon name={nDef?.icon || 'Box'} className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-gray-200 truncate">{n.data.label || nDef?.label}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono shrink-0">
                    {n.data.disabled ? 'Disabled' : 'Active'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-[#1c2230] space-y-2">
            <button
              onClick={() => onCopyNodes?.(selectedNodes)}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
            >
              <ClipboardCopy className="w-3.5 h-3.5" />
              <span>Copy Selected (Ctrl+C)</span>
            </button>
            <button
              onClick={() => onDuplicateNodes?.(selectedNodes)}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-lg bg-[#1c2230] hover:bg-[#252c3d] text-gray-200 hover:text-white text-xs font-medium transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate Selected (Ctrl+D)</span>
            </button>
            <button
              onClick={() => onToggleDisableNodes?.(selectedNodes.map((n) => n.id))}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-lg bg-[#161a24] hover:bg-[#232a3b] text-gray-300 hover:text-white text-xs font-medium transition-colors"
            >
              <EyeOff className="w-3.5 h-3.5 text-amber-400" />
              <span>Toggle Enable/Disable</span>
            </button>
            <button
              onClick={() => onDeleteNodes?.(selectedNodes.map((n) => n.id))}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected (Del)</span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

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

  const currentOutput = runtimeState?.output ?? (props.outputVariable ? variables[props.outputVariable] : undefined);
  const imagePreviews = getImagePreviews(currentOutput);

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
        {['click', 'type_text', 'clear_input', 'hover', 'wait_for_element', 'extract_text', 'extract_attribute', 'extract_html', 'extract_table', 'extract_multiple', 'extract_links', 'extract_image', 'contains'].includes(selectedNode.data.type) && (
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

        {/* Output Variable (Extract Text, Attribute, Table, Screenshot, JS, Data, Storage, AI, Image, New Nodes) */}
        {['extract_text', 'extract_attribute', 'extract_html', 'extract_table', 'extract_multiple', 'extract_links', 'extract_image', 'extract_all_images', 'screenshot', 'execute_javascript', 'http_request', 'transform', 'regex', 'json_parse', 'generate_data', 'storage_manage', 'ai_agent', 'smart_scroll', 'download_file', 'show_notification', 'math_calculate'].includes(
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

        {/* Collection Iterator: Item Variable Name */}
        {['extract_image', 'extract_all_images', 'extract_multiple'].includes(selectedNode.data.type) && (
          <div className="pt-2 border-t border-[#1c2230]">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              Loop Body Item Variable Name
            </label>
            <input
              type="text"
              value={props.itemVariable || (['extract_image', 'extract_all_images'].includes(selectedNode.data.type) ? 'currentImage' : 'currentElement')}
              onChange={(e) => handlePropChange('itemVariable', e.target.value)}
              placeholder={['extract_image', 'extract_all_images'].includes(selectedNode.data.type) ? 'currentImage' : 'currentElement'}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-[11px]"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              When lines are connected to the "For Each" handle, each item is exposed as &#123;&#123;{props.itemVariable || (['extract_image', 'extract_all_images'].includes(selectedNode.data.type) ? 'currentImage' : 'currentElement')}&#125;&#125;
            </p>
          </div>
        )}

        {/* Extract Image Node Options */}
        {selectedNode.data.type === 'extract_image' && (
          <div className="space-y-3 pt-2 border-t border-[#1c2230]">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Extraction Mode</label>
              <select
                value={props.mode || 'single'}
                onChange={(e) => handlePropChange('mode', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="single">Single Image (First matching element)</option>
                <option value="multiple">Multiple Images (Array of all matching)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!props.asBase64}
                onChange={(e) => handlePropChange('asBase64', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">Convert to Base64 Data URL (for direct uploads / bots)</span>
            </label>

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={props.includeBackground !== false}
                onChange={(e) => handlePropChange('includeBackground', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">Detect CSS background-image if no &lt;img&gt; src</span>
            </label>

            {/* Base64 Image Preview in Panel */}
            {props.asBase64 && (
              <div className="p-2.5 rounded-xl bg-[#161a24] border border-[#232a3b] space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Base64 Image Preview</span>
                  </span>
                  {imagePreviews.length > 0 && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      {imagePreviews.length} image{imagePreviews.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {imagePreviews.length > 0 ? (
                  <div className="space-y-2">
                    <div className="relative rounded-lg overflow-hidden border border-[#232a3b] bg-black/60 p-1.5 flex items-center justify-center">
                      <img
                        src={imagePreviews[0]}
                        alt="Extracted Preview"
                        className="max-h-36 max-w-full object-contain rounded"
                      />
                    </div>

                    {imagePreviews.length > 1 && (
                      <div className="flex gap-1 overflow-x-auto pb-1 max-h-16">
                        {imagePreviews.slice(0, 8).map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt={`Preview ${i + 1}`}
                            className="w-12 h-12 object-cover rounded border border-[#232a3b] shrink-0"
                          />
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-gray-500 font-mono">
                        {imagePreviews[0].startsWith('data:image/')
                          ? `${Math.round(imagePreviews[0].length / 1024)} KB`
                          : 'URL'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(imagePreviews[0]);
                          setCopiedBase64(true);
                          setTimeout(() => setCopiedBase64(false), 2000);
                        }}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50 transition-colors"
                      >
                        {copiedBase64 ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedBase64 ? 'Copied!' : 'Copy Base64'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 text-center rounded-lg border border-dashed border-[#232a3b] text-gray-500 text-[11px]">
                    <ImageIcon className="w-5 h-5 mx-auto mb-1 text-gray-600" />
                    <span>Run this node to preview extracted Base64 image</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Find All Images Node Options */}
        {selectedNode.data.type === 'extract_all_images' && (
          <div className="space-y-3 pt-2 border-t border-[#1c2230]">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Container Selector (optional, leave blank for whole page)
              </label>
              <input
                type="text"
                value={props.containerSelector || ''}
                onChange={(e) => handlePropChange('containerSelector', e.target.value)}
                placeholder="e.g. #gallery, .product-list, main"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Min Width (px)</label>
                <input
                  type="number"
                  value={props.minWidth ?? 10}
                  onChange={(e) => handlePropChange('minWidth', Number(e.target.value))}
                  min={0}
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Min Height (px)</label>
                <input
                  type="number"
                  value={props.minHeight ?? 10}
                  onChange={(e) => handlePropChange('minHeight', Number(e.target.value))}
                  min={0}
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!props.asBase64}
                onChange={(e) => handlePropChange('asBase64', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">Convert all images to Base64 Data URLs</span>
            </label>

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={props.includeBackground !== false}
                onChange={(e) => handlePropChange('includeBackground', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">Include CSS background-image elements</span>
            </label>

            {/* Base64 gallery preview for extract_all_images */}
            {props.asBase64 && (
              <div className="p-2.5 rounded-xl bg-[#161a24] border border-[#232a3b] space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Base64 Gallery Preview</span>
                  </span>
                  {imagePreviews.length > 0 && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      {imagePreviews.length} found
                    </span>
                  )}
                </div>

                {imagePreviews.length > 0 ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto p-1 bg-black/40 rounded-lg border border-[#232a3b]">
                      {imagePreviews.map((src, i) => (
                        <div key={i} className="relative group/thumb aspect-square bg-[#11141c] rounded overflow-hidden">
                          <img src={src} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 text-center rounded-lg border border-dashed border-[#232a3b] text-gray-500 text-[11px]">
                    <ImageIcon className="w-5 h-5 mx-auto mb-1 text-gray-600" />
                    <span>Run this node to preview found Base64 images</span>
                  </div>
                )}
              </div>
            )}
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

        {/* Smart Scroll Node */}
        {selectedNode.data.type === 'smart_scroll' && (
          <div className="space-y-3 pt-2 border-t border-[#1c2230]">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Scroll Mode</label>
              <select
                value={props.mode || 'to_bottom'}
                onChange={(e) => handlePropChange('mode', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="to_bottom">Scroll to Bottom (Infinite Scroll)</option>
                <option value="distance">Scroll Fixed Distance in Steps</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Passes</label>
                <input
                  type="number"
                  value={props.maxScrolls ?? 5}
                  onChange={(e) => handlePropChange('maxScrolls', Number(e.target.value))}
                  min={1}
                  max={50}
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Delay (ms)</label>
                <input
                  type="number"
                  value={props.scrollDelay ?? 1000}
                  onChange={(e) => handlePropChange('scrollDelay', Number(e.target.value))}
                  min={200}
                  step={100}
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Distance per step (px)</label>
              <input
                type="number"
                value={props.distance ?? 600}
                onChange={(e) => handlePropChange('distance', Number(e.target.value))}
                min={100}
                step={100}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* Math & Counter Node */}
        {selectedNode.data.type === 'math_calculate' && (
          <div className="space-y-3 pt-2 border-t border-[#1c2230]">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Operation</label>
              <select
                value={props.operation || 'add'}
                onChange={(e) => handlePropChange('operation', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="add">Add (+)</option>
                <option value="increment">Increment by value</option>
                <option value="subtract">Subtract (-)</option>
                <option value="decrement">Decrement by value</option>
                <option value="multiply">Multiply (*)</option>
                <option value="divide">Divide (/)</option>
                <option value="formula">Custom Math Formula</option>
              </select>
            </div>
            {props.operation === 'formula' ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-400">Formula Expression</label>
                  <span className="text-[10px] text-purple-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                </div>
                <input
                  type="text"
                  value={props.formula || ''}
                  onChange={(e) => handlePropChange('formula', e.target.value)}
                  placeholder="e.g. {{price}} * 1.08 + 5"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Left Value</label>
                  <input
                    type="text"
                    value={props.leftOperand ?? '{{counter}}'}
                    onChange={(e) => handlePropChange('leftOperand', e.target.value)}
                    placeholder="{{counter}}"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Right Value</label>
                  <input
                    type="text"
                    value={props.rightOperand ?? '1'}
                    onChange={(e) => handlePropChange('rightOperand', e.target.value)}
                    placeholder="1"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Download File Node */}
        {selectedNode.data.type === 'download_file' && (
          <div className="space-y-3 pt-2 border-t border-[#1c2230]">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Source Type</label>
              <select
                value={props.sourceType || 'variable'}
                onChange={(e) => handlePropChange('sourceType', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="variable">URL or Variable (e.g. &#123;&#123;screenshotUrl&#125;&#125;)</option>
                <option value="content">Raw Text or CSV/JSON Content</option>
              </select>
            </div>
            {props.sourceType === 'content' ? (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">File Content</label>
                <textarea
                  rows={3}
                  value={props.content || ''}
                  onChange={(e) => handlePropChange('content', e.target.value)}
                  placeholder="Data text or {{extractedTable}} to save as file"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">File URL / Variable</label>
                <input
                  type="text"
                  value={props.url || '{{screenshotUrl}}'}
                  onChange={(e) => handlePropChange('url', e.target.value)}
                  placeholder="https://... or {{screenshotUrl}}"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            )}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Save Filename</label>
              <input
                type="text"
                value={props.filename || 'downloaded_file.png'}
                onChange={(e) => handlePropChange('filename', e.target.value)}
                placeholder="e.g. screenshot.png, data.csv"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!props.saveAs}
                onChange={(e) => handlePropChange('saveAs', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">Prompt user with "Save As" file dialog</span>
            </label>
          </div>
        )}

        {/* Desktop Notification Node */}
        {selectedNode.data.type === 'show_notification' && (
          <div className="space-y-3 pt-2 border-t border-[#1c2230]">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Notification Title</label>
              <input
                type="text"
                value={props.title || 'AutoFlow Alert'}
                onChange={(e) => handlePropChange('title', e.target.value)}
                placeholder="Alert Title"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Message Body</label>
              <textarea
                rows={2}
                value={props.message || 'Workflow step finished!'}
                onChange={(e) => handlePropChange('message', e.target.value)}
                placeholder="Body text or {{variable}}"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              />
            </div>
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

        {/* Telegram Message Node */}
        {selectedNode.data.type === 'telegram_message' && (
          <div className="space-y-3">
            {/* Account / Credential Selector */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-blue-400" />
                  <span>Telegram Bot Account</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setCredModalPlatform('telegram');
                    setIsCredModalOpen(true);
                  }}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-2.5 h-2.5" /> Manage Accounts
                </button>
              </div>

              <select
                value={props.credentialId || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  handlePropChange('credentialId', val);
                  if (val) {
                    const match = savedTelegramCreds.find((c) => c.id === val);
                    if (match?.botToken) handlePropChange('botToken', match.botToken);
                    if (match?.defaultChatId && !props.chatId) handlePropChange('chatId', match.defaultChatId);
                  }
                }}
                className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
              >
                <option value="">Manual / Custom Credentials</option>
                {savedTelegramCreds.map((cred) => (
                  <option key={cred.id} value={cred.id}>
                    Saved: {cred.name} {cred.defaultChatId ? `(${cred.defaultChatId})` : ''}
                  </option>
                ))}
              </select>

              {(!props.credentialId || props.credentialId === '') && (
                <div className="space-y-2 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-gray-400">Bot Token</label>
                      <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                    </div>
                    <input
                      type="password"
                      value={props.botToken || ''}
                      onChange={(e) => handlePropChange('botToken', e.target.value)}
                      placeholder="123456789:ABCDefGh... or {{telegramToken}}"
                      className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Obtain via <span className="text-gray-300 font-mono">@BotFather</span> on Telegram.
                    </p>
                  </div>

                  {props.botToken && (
                    <button
                      type="button"
                      onClick={async () => {
                        const accountName = prompt('Enter a name for this Telegram account:', 'My Telegram Bot');
                        if (accountName) {
                          const saved = await saveCredential({
                            platform: 'telegram',
                            name: accountName,
                            botToken: props.botToken,
                            defaultChatId: props.chatId,
                          });
                          await loadBotCredentials();
                          handlePropChange('credentialId', saved.id);
                        }
                      }}
                      className="w-full py-1 px-2 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 text-[10px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Bookmark className="w-3 h-3" /> Save this token as a reusable account
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Chat ID */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Chat ID / Channel</label>
                <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>
              <input
                type="text"
                value={props.chatId || ''}
                onChange={(e) => handlePropChange('chatId', e.target.value)}
                placeholder="-100123456789, @mychannel, or {{chatId}}"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
            </div>

            {/* Message Type */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Message Type</label>
              <select
                value={props.messageType || 'text'}
                onChange={(e) => handlePropChange('messageType', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="text">Text Message (sendMessage)</option>
                <option value="photo">Photo / Screenshot (sendPhoto)</option>
                <option value="document">Document / File (sendDocument)</option>
              </select>
            </div>

            {/* Image / Screenshot Source */}
            {(props.messageType === 'photo' || props.messageType === 'document') && (
              <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Image / File Source</span>
                  </label>
                  <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                </div>
                <input
                  type="text"
                  value={props.imageUrl || ''}
                  onChange={(e) => handlePropChange('imageUrl', e.target.value)}
                  placeholder="https://example.com/pic.jpg, {{screenshotUrl}}, or {{extractedImage}}"
                  className="w-full bg-[#161a24] text-white p-2 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                />
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-gray-500">Quick insert:</span>
                  <button
                    type="button"
                    onClick={() => handlePropChange('imageUrl', '{{screenshotUrl}}')}
                    className="px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono hover:bg-indigo-600/30"
                  >
                    &#123;&#123;screenshotUrl&#125;&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePropChange('imageUrl', '{{extractedImage}}')}
                    className="px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono hover:bg-indigo-600/30"
                  >
                    &#123;&#123;extractedImage&#125;&#125;
                  </button>
                </div>
                <p className="text-[10px] text-gray-500">
                  Accepts web URLs (https://...) or base64 Data URLs generated by AutoFlow&apos;s Screenshot or Extract Image nodes.
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">
                  {props.messageType === 'photo' || props.messageType === 'document' ? 'Caption (optional)' : 'Message Content'}
                </label>
                <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>
              <textarea
                rows={props.messageType === 'photo' ? 2 : 4}
                value={props.message || ''}
                onChange={(e) => handlePropChange('message', e.target.value)}
                placeholder={
                  props.messageType === 'photo'
                    ? '📸 Captured page screenshot: {{pageTitle}}'
                    : '🚨 Alert: New item found!&#10;Title: {{extractedTitle}}&#10;Link: {{pageUrl}}'
                }
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Formatting Parse Mode</label>
              <select
                value={props.parseMode || 'HTML'}
                onChange={(e) => handlePropChange('parseMode', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="HTML">HTML (e.g. &lt;b&gt;bold&lt;/b&gt;, &lt;a href="..."&gt;link&lt;/a&gt;)</option>
                <option value="MarkdownV2">MarkdownV2 (*bold*, _italic_, [link](url))</option>
                <option value="Markdown">Markdown (Legacy)</option>
                <option value="None">Plain Text (No formatting)</option>
              </select>
            </div>

            <div className="pt-2 border-t border-[#1c2230] space-y-2">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!props.silent}
                  onChange={(e) => handlePropChange('silent', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px]">Silent Notification (no alert sound for recipient)</span>
              </label>

              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!props.protectContent}
                  onChange={(e) => handlePropChange('protectContent', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px]">Protect Content (disallow forwarding &amp; saving)</span>
              </label>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable Name</label>
              <input
                type="text"
                value={props.outputVariable || 'telegramResponse'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="telegramResponse"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
            </div>
          </div>
        )}

        {/* Discord Message Node */}
        {selectedNode.data.type === 'discord_message' && (
          <div className="space-y-3">
            {/* Account / Credential Selector */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Discord Bot / Webhook Account</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setCredModalPlatform('discord');
                    setIsCredModalOpen(true);
                  }}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-2.5 h-2.5" /> Manage Accounts
                </button>
              </div>

              <select
                value={props.credentialId || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  handlePropChange('credentialId', val);
                  if (val) {
                    const match = savedDiscordCreds.find((c) => c.id === val);
                    if (match) {
                      if (match.mode) handlePropChange('mode', match.mode);
                      if (match.webhookUrl) handlePropChange('webhookUrl', match.webhookUrl);
                      if (match.botToken) handlePropChange('botToken', match.botToken);
                      if (match.channelId) handlePropChange('channelId', match.channelId);
                      if (match.username && !props.username) handlePropChange('username', match.username);
                      if (match.avatarUrl && !props.avatarUrl) handlePropChange('avatarUrl', match.avatarUrl);
                    }
                  }
                }}
                className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
              >
                <option value="">Manual / Custom Settings</option>
                {savedDiscordCreds.map((cred) => (
                  <option key={cred.id} value={cred.id}>
                    Saved: {cred.name} ({cred.mode === 'bot' ? 'Bot Token' : 'Webhook'})
                  </option>
                ))}
              </select>

              {(!props.credentialId || props.credentialId === '') && (
                <div className="space-y-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">Integration Mode</label>
                    <select
                      value={props.mode || 'webhook'}
                      onChange={(e) => handlePropChange('mode', e.target.value)}
                      className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
                    >
                      <option value="webhook">Incoming Webhook (Recommended &amp; easiest)</option>
                      <option value="bot">Discord Bot Token + Channel ID</option>
                    </select>
                  </div>

                  {props.mode === 'bot' ? (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-gray-400">Bot Token</label>
                          <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                        </div>
                        <input
                          type="password"
                          value={props.botToken || ''}
                          onChange={(e) => handlePropChange('botToken', e.target.value)}
                          placeholder="Bot Token (e.g. MTAx...)"
                          className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-gray-400">Channel ID</label>
                          <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                        </div>
                        <input
                          type="text"
                          value={props.channelId || ''}
                          onChange={(e) => handlePropChange('channelId', e.target.value)}
                          placeholder="e.g. 102938475647382910"
                          className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-gray-400">Webhook URL</label>
                          <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                        </div>
                        <input
                          type="text"
                          value={props.webhookUrl || ''}
                          onChange={(e) => handlePropChange('webhookUrl', e.target.value)}
                          placeholder="https://discord.com/api/webhooks/..."
                          className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-400 mb-1">Bot Name (optional)</label>
                          <input
                            type="text"
                            value={props.username || ''}
                            onChange={(e) => handlePropChange('username', e.target.value)}
                            placeholder="AutoFlow Bot"
                            className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-400 mb-1">Avatar URL (optional)</label>
                          <input
                            type="text"
                            value={props.avatarUrl || ''}
                            onChange={(e) => handlePropChange('avatarUrl', e.target.value)}
                            placeholder="https://..."
                            className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs font-mono"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {(props.webhookUrl || props.botToken) && (
                    <button
                      type="button"
                      onClick={async () => {
                        const accountName = prompt('Enter a name for this Discord account:', 'My Discord Server');
                        if (accountName) {
                          const saved = await saveCredential({
                            platform: 'discord',
                            name: accountName,
                            mode: props.mode || 'webhook',
                            webhookUrl: props.webhookUrl,
                            botToken: props.botToken,
                            channelId: props.channelId,
                            username: props.username,
                            avatarUrl: props.avatarUrl,
                          });
                          await loadBotCredentials();
                          handlePropChange('credentialId', saved.id);
                        }
                      }}
                      className="w-full py-1 px-2 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 text-[10px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Bookmark className="w-3 h-3" /> Save this configuration as reusable account
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Message Type */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Message Style</label>
              <select
                value={props.messageType || 'text'}
                onChange={(e) => handlePropChange('messageType', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="text">Plain / Markdown Message</option>
                <option value="embed">Rich Embed Card</option>
                <option value="image">Image / Screenshot Attachment</option>
              </select>
            </div>

            {/* Image / Screenshot URL */}
            {(props.messageType === 'image' || props.messageType === 'embed') && (
              <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Image / Screenshot Source</span>
                  </label>
                  <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                </div>
                <input
                  type="text"
                  value={props.imageUrl || ''}
                  onChange={(e) => handlePropChange('imageUrl', e.target.value)}
                  placeholder="https://example.com/image.png, {{screenshotUrl}}, or {{extractedImage}}"
                  className="w-full bg-[#161a24] text-white p-2 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                />
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-gray-500">Quick insert:</span>
                  <button
                    type="button"
                    onClick={() => handlePropChange('imageUrl', '{{screenshotUrl}}')}
                    className="px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono hover:bg-indigo-600/30"
                  >
                    &#123;&#123;screenshotUrl&#125;&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePropChange('imageUrl', '{{extractedImage}}')}
                    className="px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono hover:bg-indigo-600/30"
                  >
                    &#123;&#123;extractedImage&#125;&#125;
                  </button>
                </div>
                <p className="text-[10px] text-gray-500">
                  Accepts web URLs or base64 screenshots. For base64 screenshots, AutoFlow attaches the file directly to the Discord message.
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Message Content</label>
                <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>
              <textarea
                rows={3}
                value={props.content || ''}
                onChange={(e) => handlePropChange('content', e.target.value)}
                placeholder="Alert: {{extractedTitle}} has been processed!"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            {/* Rich Embed Options */}
            {props.messageType === 'embed' && (
              <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
                <div className="text-[11px] font-semibold text-gray-300">Rich Embed Customization</div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Embed Title</label>
                  <input
                    type="text"
                    value={props.embedTitle || ''}
                    onChange={(e) => handlePropChange('embedTitle', e.target.value)}
                    placeholder="e.g. Scrape Report Complete"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Embed Description</label>
                  <textarea
                    rows={2}
                    value={props.embedDescription || ''}
                    onChange={(e) => handlePropChange('embedDescription', e.target.value)}
                    placeholder="Detailed results: {{extractedData}}"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs font-mono"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-gray-400">Embed Color:</label>
                  <input
                    type="color"
                    value={props.embedColor || '#5865F2'}
                    onChange={(e) => handlePropChange('embedColor', e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                  />
                  <input
                    type="text"
                    value={props.embedColor || '#5865F2'}
                    onChange={(e) => handlePropChange('embedColor', e.target.value)}
                    className="w-24 bg-[#161a24] text-white p-1 rounded border border-[#232a3b] outline-none text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Thumbnail URL (optional)</label>
                  <input
                    type="text"
                    value={props.thumbnailUrl || ''}
                    onChange={(e) => handlePropChange('thumbnailUrl', e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Footer Text (optional)</label>
                  <input
                    type="text"
                    value={props.footerText || ''}
                    onChange={(e) => handlePropChange('footerText', e.target.value)}
                    placeholder="AutoFlow Extension • Today"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable Name</label>
              <input
                type="text"
                value={props.outputVariable || 'discordResponse'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="discordResponse"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
            </div>
          </div>
        )}

        {/* Slack Message Node */}
        {selectedNode.data.type === 'slack_message' && (
          <div className="space-y-3">
            {/* Account / Credential Selector */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Slack Workspace Account</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setCredModalPlatform('slack');
                    setIsCredModalOpen(true);
                  }}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-2.5 h-2.5" /> Manage Accounts
                </button>
              </div>

              <select
                value={props.credentialId || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  handlePropChange('credentialId', val);
                  if (val) {
                    const match = savedSlackCreds.find((c) => c.id === val);
                    if (match) {
                      if (match.mode) handlePropChange('mode', match.mode);
                      if (match.webhookUrl) handlePropChange('webhookUrl', match.webhookUrl);
                      if (match.botToken) handlePropChange('botToken', match.botToken);
                      if (match.channel) handlePropChange('channel', match.channel);
                      if (match.username && !props.username) handlePropChange('username', match.username);
                      if (match.iconEmoji && !props.iconEmoji) handlePropChange('iconEmoji', match.iconEmoji);
                    }
                  }
                }}
                className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
              >
                <option value="">Manual / Custom Settings</option>
                {savedSlackCreds.map((cred) => (
                  <option key={cred.id} value={cred.id}>
                    Saved: {cred.name} ({cred.mode === 'bot' ? 'Bot OAuth Token' : 'Webhook'})
                  </option>
                ))}
              </select>

              {(!props.credentialId || props.credentialId === '') && (
                <div className="space-y-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">Integration Mode</label>
                    <select
                      value={props.mode || 'webhook'}
                      onChange={(e) => handlePropChange('mode', e.target.value)}
                      className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
                    >
                      <option value="webhook">Incoming Webhook (Recommended &amp; easiest)</option>
                      <option value="bot">Slack Bot Token (OAuth / chat.postMessage)</option>
                    </select>
                  </div>

                  {props.mode === 'bot' ? (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-gray-400">Bot User OAuth Token</label>
                          <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                        </div>
                        <input
                          type="password"
                          value={props.botToken || ''}
                          onChange={(e) => handlePropChange('botToken', e.target.value)}
                          placeholder="xoxb-... or {{slackToken}}"
                          className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-gray-400">Target Channel</label>
                          <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                        </div>
                        <input
                          type="text"
                          value={props.channel || ''}
                          onChange={(e) => handlePropChange('channel', e.target.value)}
                          placeholder="#general, C1234567890, or {{channel}}"
                          className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-gray-400">Incoming Webhook URL</label>
                          <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                        </div>
                        <input
                          type="text"
                          value={props.webhookUrl || ''}
                          onChange={(e) => handlePropChange('webhookUrl', e.target.value)}
                          placeholder="https://hooks.slack.com/services/..."
                          className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-400 mb-1">Channel Override (optional)</label>
                        <input
                          type="text"
                          value={props.channel || ''}
                          onChange={(e) => handlePropChange('channel', e.target.value)}
                          placeholder="#alerts or leave blank for webhook default"
                          className="w-full bg-[#161a24] text-white p-1.5 rounded-lg border border-[#232a3b] outline-none text-xs"
                        />
                      </div>
                    </>
                  )}

                  {(props.webhookUrl || props.botToken) && (
                    <button
                      type="button"
                      onClick={async () => {
                        const accountName = prompt('Enter a name for this Slack account:', 'My Slack Workspace');
                        if (accountName) {
                          const saved = await saveCredential({
                            platform: 'slack',
                            name: accountName,
                            mode: props.mode || 'webhook',
                            webhookUrl: props.webhookUrl,
                            botToken: props.botToken,
                            channel: props.channel,
                            username: props.username,
                            iconEmoji: props.iconEmoji,
                          });
                          await loadBotCredentials();
                          handlePropChange('credentialId', saved.id);
                        }
                      }}
                      className="w-full py-1 px-2 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 text-[10px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Bookmark className="w-3 h-3" /> Save this configuration as reusable account
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Message Type */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Message Layout</label>
              <select
                value={props.messageType || 'text'}
                onChange={(e) => handlePropChange('messageType', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="text">Standard Text (mrkdwn)</option>
                <option value="rich">Rich Block Kit Card (Header, Text, Image)</option>
                <option value="image">Image / Screenshot Upload</option>
              </select>
            </div>

            {/* Rich Header */}
            {props.messageType === 'rich' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Card Header Text (optional)</label>
                <input
                  type="text"
                  value={props.headerText || ''}
                  onChange={(e) => handlePropChange('headerText', e.target.value)}
                  placeholder="🚀 AutoFlow Job Notification"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs"
                />
              </div>
            )}

            {/* Image / Screenshot URL */}
            {(props.messageType === 'image' || props.messageType === 'rich') && (
              <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Image / Screenshot Source</span>
                  </label>
                  <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                </div>
                <input
                  type="text"
                  value={props.imageUrl || ''}
                  onChange={(e) => handlePropChange('imageUrl', e.target.value)}
                  placeholder="https://example.com/pic.png, {{screenshotUrl}}, or {{extractedImage}}"
                  className="w-full bg-[#161a24] text-white p-2 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                />
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-gray-500">Quick insert:</span>
                  <button
                    type="button"
                    onClick={() => handlePropChange('imageUrl', '{{screenshotUrl}}')}
                    className="px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono hover:bg-indigo-600/30"
                  >
                    &#123;&#123;screenshotUrl&#125;&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePropChange('imageUrl', '{{extractedImage}}')}
                    className="px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono hover:bg-indigo-600/30"
                  >
                    &#123;&#123;extractedImage&#125;&#125;
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Alt Text for Image</label>
                  <input
                    type="text"
                    value={props.imageAltText || ''}
                    onChange={(e) => handlePropChange('imageAltText', e.target.value)}
                    placeholder="Page screenshot or extracted image"
                    className="w-full bg-[#161a24] text-white p-1 rounded border border-[#232a3b] outline-none text-xs"
                  />
                </div>
                <p className="text-[10px] text-gray-500">
                  Accepts web URLs or base64 screenshots. For base64 screenshots via Bot Token, AutoFlow uploads the image directly to the Slack channel via files.upload API!
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Message Text (mrkdwn)</label>
                <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>
              <textarea
                rows={4}
                value={props.text || ''}
                onChange={(e) => handlePropChange('text', e.target.value)}
                placeholder="AutoFlow Notification:&#10;*Price*: {{extractedPrice}}&#10;*Status*: Success"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Bot Name (optional)</label>
                <input
                  type="text"
                  value={props.username || ''}
                  onChange={(e) => handlePropChange('username', e.target.value)}
                  placeholder="AutoFlow Bot"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Icon Emoji (optional)</label>
                <input
                  type="text"
                  value={props.iconEmoji || ''}
                  onChange={(e) => handlePropChange('iconEmoji', e.target.value)}
                  placeholder=":robot_face:"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable Name</label>
              <input
                type="text"
                value={props.outputVariable || 'slackResponse'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="slackResponse"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
            </div>
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
                {imagePreviews.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="p-1.5 rounded-lg bg-black/60 border border-[#232a3b] flex items-center justify-center">
                      <img
                        src={imagePreviews[0]}
                        alt="Output Preview"
                        className="max-h-32 max-w-full object-contain rounded"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-indigo-400 font-mono">
                        {imagePreviews[0].startsWith('data:image/') ? `Base64 Image (${Math.round(imagePreviews[0].length / 1024)} KB)` : 'Image URL'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowRawOutput(!showRawOutput)}
                        className="text-gray-400 hover:text-white underline cursor-pointer"
                      >
                        {showRawOutput ? 'Hide String' : 'Show Raw String'}
                      </button>
                    </div>
                    {showRawOutput && (
                      <pre className="bg-[#161a24] text-emerald-400 p-2 rounded text-[10px] font-mono overflow-x-auto max-h-24 break-all">
                        {typeof runtimeState.output === 'object'
                          ? JSON.stringify(runtimeState.output, null, 2)
                          : String(runtimeState.output)}
                      </pre>
                    )}
                  </div>
                ) : (
                  <pre className="bg-[#161a24] text-emerald-400 p-2 rounded text-[10px] font-mono overflow-x-auto max-h-24">
                    {typeof runtimeState.output === 'object'
                      ? JSON.stringify(runtimeState.output, null, 2)
                      : String(runtimeState.output)}
                  </pre>
                )}
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

      {/* Footer Controls: Copy, Disable & Delete */}
      <div className="p-3 border-t border-[#1c2230] bg-[#11141c] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onCopyNode?.(selectedNode)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[#161a24] text-gray-400 hover:text-indigo-400 transition-colors text-xs"
            title="Copy node (Ctrl+C)"
          >
            <ClipboardCopy className="w-3.5 h-3.5" />
            <span>Copy</span>
          </button>
          <button
            onClick={() => onToggleDisable(selectedNode.id)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[#161a24] text-gray-400 hover:text-white transition-colors text-xs"
          >
            {selectedNode.data.disabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{selectedNode.data.disabled ? 'Enable' : 'Disable'}</span>
          </button>
        </div>

        <button
          onClick={() => onDeleteNode(selectedNode.id)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-rose-500/10 text-gray-400 hover:text-rose-400 transition-colors text-xs"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>
      </div>

      {/* Bot Credentials Management Modal */}
      <BotCredentialsModal
        isOpen={isCredModalOpen}
        defaultPlatform={credModalPlatform}
        onClose={() => {
          setIsCredModalOpen(false);
          loadBotCredentials();
        }}
        onSelectCredential={(cred) => {
          handlePropChange('credentialId', cred.id);
          if (cred.platform === 'telegram') {
            if (cred.botToken) handlePropChange('botToken', cred.botToken);
            if (cred.defaultChatId) handlePropChange('chatId', cred.defaultChatId);
          } else if (cred.platform === 'discord') {
            if (cred.webhookUrl) {
              handlePropChange('mode', 'webhook');
              handlePropChange('webhookUrl', cred.webhookUrl);
            } else if (cred.botToken) {
              handlePropChange('mode', 'bot');
              handlePropChange('botToken', cred.botToken);
              if (cred.channelId) handlePropChange('channelId', cred.channelId);
            }
          } else if (cred.platform === 'slack') {
            if (cred.botToken) {
              handlePropChange('mode', 'bot');
              handlePropChange('botToken', cred.botToken);
              if (cred.channel) handlePropChange('channel', cred.channel);
            } else if (cred.webhookUrl) {
              handlePropChange('mode', 'webhook');
              handlePropChange('webhookUrl', cred.webhookUrl);
            }
          }
        }}
      />
    </aside>
  );
};
