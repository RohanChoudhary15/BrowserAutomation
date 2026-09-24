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
  FileText,
  FileSpreadsheet,
  Table,
  FileDown,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { fetchAvailableModels } from '../../ai/aiService';
import { formatRuleDescription, ConditionRule, ConditionType } from '../../runtime/evaluator';
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
  onStartElementPicker: (mode?: 'single' | 'pattern_2click') => void;
  isPickingElement: boolean;
  onClose: () => void;
  allNodes?: WorkflowNode[];
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
  allNodes = [],
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
  const [copiedNodeError, setCopiedNodeError] = useState(false);

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

  // Inspect panel width resizing state (persisted to localStorage)
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('autoflow_inspect_panel_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 260 && parsed <= 1400) {
          return parsed;
        }
      }
    } catch {}
    return 320;
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelWidthRef = React.useRef(panelWidth);
  panelWidthRef.current = panelWidth;

  // Open tabs list state for switch_tab and close_tab
  const [openTabs, setOpenTabs] = useState<Array<{ id: number; title: string; url: string; index: number; active: boolean }>>([]);
  const [isLoadingTabs, setIsLoadingTabs] = useState(false);

  const refreshOpenTabs = React.useCallback(async () => {
    setIsLoadingTabs(true);
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const res = await chrome.runtime.sendMessage({ type: 'LIST_TABS' });
        if (res?.success && Array.isArray(res.tabs)) {
          setOpenTabs(res.tabs);
        }
      }
    } catch (err) {
      console.warn('[AutoFlow] Failed to query open tabs:', err);
    } finally {
      setIsLoadingTabs(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedNode && ['switch_tab', 'close_tab'].includes(selectedNode.data.type)) {
      refreshOpenTabs();
    }
  }, [selectedNode?.id, selectedNode?.data?.type, refreshOpenTabs]);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = panelWidthRef.current;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const maxWidth = Math.max(450, Math.floor(window.innerWidth * 0.75));
      const newWidth = Math.min(Math.max(startWidth + delta, 280), maxWidth);
      setPanelWidth(newWidth);
      panelWidthRef.current = newWidth;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      try {
        localStorage.setItem('autoflow_inspect_panel_width', String(panelWidthRef.current));
      } catch {}
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Multi-node selection batch overview
  if (selectedNodes && selectedNodes.length > 1) {
    return (
      <aside
        style={{ width: `${panelWidth}px` }}
        className="max-w-full absolute sm:relative right-0 top-0 bottom-0 border-l border-[#1c2230] bg-[#0c0e14] flex flex-col select-none z-20 sm:z-10 shadow-2xl sm:shadow-none shrink-0"
      >
        {/* Drag-to-resize handle on left edge */}
        <div
          onMouseDown={handleMouseDownResize}
          onDoubleClick={() => {
            setPanelWidth(320);
            try { localStorage.setItem('autoflow_inspect_panel_width', '320'); } catch {}
          }}
          className={`absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 group flex items-center justify-center hover:bg-indigo-500/20 transition-colors ${
            isResizing ? 'bg-indigo-500/30' : ''
          }`}
          title="Drag left edge to resize inspect panel (Double-click to reset to 320px)"
        >
          <div
            className={`w-0.5 h-16 rounded-full transition-colors ${
              isResizing ? 'bg-indigo-400' : 'bg-transparent group-hover:bg-indigo-400/80'
            }`}
          />
        </div>

        {/* Header */}
        <div className="p-3 border-b border-[#1c2230] flex items-center justify-between bg-[#11141c]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-xs text-white">{selectedNodes.length} Nodes Selected</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const nextWidth = panelWidth < 400 ? 480 : (panelWidth < 600 ? 640 : 320);
                setPanelWidth(nextWidth);
                try { localStorage.setItem('autoflow_inspect_panel_width', String(nextWidth)); } catch {}
              }}
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title={`Inspect panel width: ${panelWidth}px (Click to cycle 320px / 480px / 640px, or drag left edge)`}
            >
              {panelWidth >= 500 ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
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
    <aside
      style={{ width: `${panelWidth}px` }}
      className="max-w-full absolute sm:relative right-0 top-0 bottom-0 border-l border-[#1c2230] bg-[#0c0e14] flex flex-col select-none z-20 sm:z-10 shadow-2xl sm:shadow-none shrink-0"
    >
      {/* Drag-to-resize handle on left edge */}
      <div
        onMouseDown={handleMouseDownResize}
        onDoubleClick={() => {
          setPanelWidth(320);
          try { localStorage.setItem('autoflow_inspect_panel_width', '320'); } catch {}
        }}
        className={`absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 group flex items-center justify-center hover:bg-indigo-500/20 transition-colors ${
          isResizing ? 'bg-indigo-500/30' : ''
        }`}
        title="Drag left edge to resize inspect panel (Double-click to reset to 320px)"
      >
        <div
          className={`w-0.5 h-16 rounded-full transition-colors ${
            isResizing ? 'bg-indigo-400' : 'bg-transparent group-hover:bg-indigo-400/80'
          }`}
        />
      </div>

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

          {/* Width Resize Toggle Button */}
          <button
            type="button"
            onClick={() => {
              const nextWidth = panelWidth < 400 ? 480 : (panelWidth < 600 ? 640 : 320);
              setPanelWidth(nextWidth);
              try { localStorage.setItem('autoflow_inspect_panel_width', String(nextWidth)); } catch {}
            }}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#161a24] transition-colors"
            title={`Inspect panel width: ${panelWidth}px (Click to cycle 320px / 480px / 640px, or drag left edge)`}
          >
            {panelWidth >= 500 ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
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

        {/* Navigate: Open in New Tab */}
        {selectedNode.data.type === 'navigate' && (
          <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={!!props.openInNewTab}
              onChange={(e) => handlePropChange('openInNewTab', e.target.checked)}
              className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
            />
            <span className="text-[11px]">Open in new tab</span>
          </label>
        )}

        {/* Switch Tab */}
        {selectedNode.data.type === 'switch_tab' && (
          <div className="space-y-3 pt-2 border-t border-[#1c2230]">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-medium text-gray-400">Target Tab to Switch</label>
              <button
                type="button"
                onClick={refreshOpenTabs}
                disabled={isLoadingTabs}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                title="Refresh open browser tabs list"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingTabs ? 'animate-spin' : ''}`} />
                <span>Refresh Tabs</span>
              </button>
            </div>

            <div>
              <select
                value={
                  props.tabTarget === 'by_id' && props.tabId
                    ? `id_${props.tabId}`
                    : (props.tabTarget || 'next')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith('id_')) {
                    const id = Number(val.replace('id_', ''));
                    const matchedTab = openTabs.find((t) => t.id === id);
                    onUpdateProperties(selectedNode.id, {
                      ...props,
                      tabTarget: 'by_id',
                      tabId: id,
                      tabTitle: matchedTab?.title || '',
                      tabUrl: matchedTab?.url || '',
                    });
                  } else {
                    onUpdateProperties(selectedNode.id, {
                      ...props,
                      tabTarget: val,
                      tabId: undefined,
                    });
                  }
                }}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                {openTabs.length > 0 && (
                  <optgroup label="Open Browser Tabs">
                    {openTabs.map((t) => {
                      let host = '';
                      try { host = new URL(t.url).hostname; } catch {}
                      const displayTitle = (t.title || 'Untitled').slice(0, 32);
                      return (
                        <option key={t.id} value={`id_${t.id}`}>
                          Tab #{t.index + 1}: {displayTitle} {host ? `(${host})` : ''} {t.active ? '[Active]' : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                <optgroup label="Relative Navigation">
                  <option value="next">Next Tab (Right)</option>
                  <option value="previous">Previous Tab (Left)</option>
                  <option value="first">First Tab (Index 0)</option>
                  <option value="last">Last Tab</option>
                </optgroup>
                <optgroup label="Match Criteria">
                  <option value="by_index">By Tab Index (0, 1, 2...)</option>
                  <option value="by_pattern">By URL or Title Pattern...</option>
                </optgroup>
              </select>
            </div>

            {props.tabTarget === 'by_id' && (props.tabTitle || props.tabUrl) && (
              <div className="p-2 rounded bg-[#161a24] border border-[#232a3b] text-[11px] text-gray-300 space-y-0.5">
                <div className="text-[10px] text-gray-500 font-mono">Selected Tab Target:</div>
                {props.tabTitle && <div className="font-semibold text-white truncate">{props.tabTitle}</div>}
                {props.tabUrl && <div className="text-[10px] text-indigo-400 truncate">{props.tabUrl}</div>}
              </div>
            )}

            {props.tabTarget === 'by_index' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Tab Index (0-based)</label>
                <input
                  type="number"
                  value={props.tabIndex ?? 0}
                  onChange={(e) => handlePropChange('tabIndex', Number(e.target.value))}
                  min={0}
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            )}

            {props.tabTarget === 'by_pattern' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">URL Pattern (contains or regex)</label>
                  <input
                    type="text"
                    value={props.urlPattern || ''}
                    onChange={(e) => handlePropChange('urlPattern', e.target.value)}
                    placeholder="e.g. amazon.com or .*checkout.*"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Title Pattern (optional)</label>
                  <input
                    type="text"
                    value={props.titlePattern || ''}
                    onChange={(e) => handlePropChange('titlePattern', e.target.value)}
                    placeholder="e.g. Shopping Cart"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Close Tab */}
        {selectedNode.data.type === 'close_tab' && (
          <div className="space-y-3 pt-2 border-t border-[#1c2230]">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-medium text-gray-400">Target Tab to Close</label>
              <button
                type="button"
                onClick={refreshOpenTabs}
                disabled={isLoadingTabs}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                title="Refresh open browser tabs list"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingTabs ? 'animate-spin' : ''}`} />
                <span>Refresh Tabs</span>
              </button>
            </div>

            <div>
              <select
                value={
                  props.closeTarget === 'specific' && props.tabId
                    ? `id_${props.tabId}`
                    : (props.closeTarget || 'current')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith('id_')) {
                    const id = Number(val.replace('id_', ''));
                    const matchedTab = openTabs.find((t) => t.id === id);
                    onUpdateProperties(selectedNode.id, {
                      ...props,
                      closeTarget: 'specific',
                      tabId: id,
                      tabTitle: matchedTab?.title || '',
                      tabUrl: matchedTab?.url || '',
                    });
                  } else {
                    onUpdateProperties(selectedNode.id, {
                      ...props,
                      closeTarget: val,
                      tabId: undefined,
                    });
                  }
                }}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="current">Current Active Tab</option>
                {openTabs.length > 0 && (
                  <optgroup label="Open Browser Tabs">
                    {openTabs.map((t) => {
                      let host = '';
                      try { host = new URL(t.url).hostname; } catch {}
                      const displayTitle = (t.title || 'Untitled').slice(0, 32);
                      return (
                        <option key={t.id} value={`id_${t.id}`}>
                          Tab #{t.index + 1}: {displayTitle} {host ? `(${host})` : ''} {t.active ? '[Active]' : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                <optgroup label="Custom">
                  <option value="by_index">By Tab Index (0, 1, 2...)</option>
                  <option value="by_pattern">By URL Pattern...</option>
                </optgroup>
              </select>
            </div>

            {props.closeTarget === 'specific' && (props.tabTitle || props.tabUrl) && (
              <div className="p-2 rounded bg-[#161a24] border border-[#232a3b] text-[11px] text-gray-300 space-y-0.5">
                <div className="text-[10px] text-gray-500 font-mono">Will Close Tab:</div>
                {props.tabTitle && <div className="font-semibold text-white truncate">{props.tabTitle}</div>}
                {props.tabUrl && <div className="text-[10px] text-indigo-400 truncate">{props.tabUrl}</div>}
              </div>
            )}

            {props.closeTarget === 'by_index' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Tab Index (0-based)</label>
                <input
                  type="number"
                  value={props.tabIndex ?? 0}
                  onChange={(e) => handlePropChange('tabIndex', Number(e.target.value))}
                  min={0}
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            )}

            {props.closeTarget === 'by_pattern' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">URL Pattern (contains)</label>
                <input
                  type="text"
                  value={props.urlPattern || ''}
                  onChange={(e) => handlePropChange('urlPattern', e.target.value)}
                  placeholder="e.g. ad.doubleclick.net or popup"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            )}
          </div>
        )}

        {/* Element Selector with Picker Button (Click, Type, Extract, Hover, etc.) */}
        {['click', 'type_text', 'clear_input', 'hover', 'wait_for_element', 'wait_for_text', 'extract_text', 'extract_attribute', 'extract_html', 'extract_table', 'extract_multiple', 'crawl_pagination', 'extract_links', 'extract_image', 'contains', 'contains_text'].includes(selectedNode.data.type) && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-400">
                {['contains_text', 'wait_for_text'].includes(selectedNode.data.type)
                  ? 'Container Element (optional)'
                  : ['extract_multiple', 'crawl_pagination'].includes(selectedNode.data.type)
                  ? 'Repeating List / Items Selector'
                  : 'Element Selector'}
              </label>

              {['extract_multiple', 'crawl_pagination'].includes(selectedNode.data.type) ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onStartElementPicker('pattern_2click')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold transition-all shadow-sm ${
                      isPickingElement
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600 hover:text-white border border-emerald-500/40'
                    }`}
                    title="Click Item 1 and Item 2 on the webpage, and AutoFlow automatically discovers the repeating list pattern across the whole page"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>2-Click Pattern</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartElementPicker('single')}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#161a24] text-gray-400 hover:text-white hover:bg-[#1c2230] border border-[#232a3b] transition-colors"
                    title="Pick single element"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>Single</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onStartElementPicker('single')}
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
              )}
            </div>

            <input
              type="text"
              value={props.itemSelector || props.selector || ''}
              onChange={(e) => {
                handlePropChange('selector', e.target.value);
                if (selectedNode.data.type === 'crawl_pagination') {
                  handlePropChange('itemSelector', e.target.value);
                }
              }}
              placeholder={
                ['contains_text', 'wait_for_text'].includes(selectedNode.data.type)
                  ? 'Leave empty to search entire page, or #container'
                  : "#button, [data-testid='...'], //button"
              }
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-[11px]"
            />

            {/* Visual 2-Click Pattern Results Card */}
            {['extract_multiple', 'crawl_pagination'].includes(selectedNode.data.type) && props.patternMatchCount !== undefined && (
              <div className="mt-2 p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-800/40 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-300">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>2-Click Pattern Discovered</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-200 text-[10px] font-mono border border-emerald-700/50">
                    {props.patternMatchCount} items found
                  </span>
                </div>
                {props.item1Selector && (
                  <div className="text-[10px] text-gray-400 font-mono truncate">
                    Item #1: <span className="text-gray-300">{props.item1Selector}</span>
                  </div>
                )}
                {props.item2Selector && (
                  <div className="text-[10px] text-gray-400 font-mono truncate">
                    Item #2: <span className="text-gray-300">{props.item2Selector}</span>
                  </div>
                )}
                {Array.isArray(props.patternSampleTexts) && props.patternSampleTexts.length > 0 && (
                  <div className="pt-1 border-t border-emerald-900/30">
                    <div className="text-[9px] uppercase tracking-wider text-emerald-500 font-bold mb-1">
                      Sample Matches:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {props.patternSampleTexts.slice(0, 3).map((txt: string, idx: number) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-[#11141c] text-gray-300 px-1.5 py-0.5 rounded border border-[#222a3a] truncate max-w-[190px]"
                          title={txt}
                        >
                          {txt}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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
              <div className="space-y-2">
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

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePropChange('textMatchMode', 'partial')}
                    className={`py-1 px-2 rounded-md text-[11px] font-medium border transition-colors ${
                      (props.textMatchMode || 'partial') === 'partial'
                        ? 'bg-purple-600/25 text-purple-300 border-purple-500/60 font-semibold'
                        : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                    }`}
                  >
                    Partial Match
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePropChange('textMatchMode', 'exact')}
                    className={`py-1 px-2 rounded-md text-[11px] font-medium border transition-colors ${
                      props.textMatchMode === 'exact'
                        ? 'bg-purple-600/25 text-purple-300 border-purple-500/60 font-semibold'
                        : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                    }`}
                  >
                    Exact Match
                  </button>
                </div>

                <label className="flex items-center gap-2 text-gray-300 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={props.caseSensitive === true}
                    onChange={(e) => handlePropChange('caseSensitive', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                  />
                  <span className="text-[11px]">Respect Casing (Case-sensitive)</span>
                </label>
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

        {/* Contains Text Node (dedicated text presence check) */}
        {selectedNode.data.type === 'contains_text' && (
          <div className="space-y-3 pt-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Text to Search For</label>
                {availableVars.length > 0 && (
                  <span className="text-[10px] text-gray-500">Supports &#123;&#123;var&#125;&#125;</span>
                )}
              </div>
              <textarea
                rows={2}
                value={props.text || ''}
                onChange={(e) => handlePropChange('text', e.target.value)}
                placeholder="e.g. Order Placed, Submit Successful..."
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Match Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePropChange('matchMode', 'partial')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                    (props.matchMode || 'partial') === 'partial'
                      ? 'bg-purple-600/25 text-purple-300 border-purple-500/60 font-semibold'
                      : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                  }`}
                >
                  Partial Match
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange('matchMode', 'exact')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                    props.matchMode === 'exact'
                      ? 'bg-purple-600/25 text-purple-300 border-purple-500/60 font-semibold'
                      : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                  }`}
                >
                  Exact Match
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer pt-0.5">
              <input
                type="checkbox"
                checked={props.caseSensitive === true}
                onChange={(e) => handlePropChange('caseSensitive', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">Respect Casing (Case-sensitive)</span>
            </label>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable (boolean)</label>
              <input
                type="text"
                value={props.outputVariable || 'containsText'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="containsText"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            <p className="text-[10px] text-gray-500 leading-relaxed bg-[#161a24] p-2 rounded-lg border border-[#1c2230]">
              Branches to <span className="text-emerald-400 font-semibold">TRUE</span> if text appears anywhere on the page (or container), otherwise branches to <span className="text-rose-400 font-semibold">FALSE</span> without failing or stopping the workflow.
            </p>
          </div>
        )}

        {/* Wait For Element Options */}
        {selectedNode.data.type === 'wait_for_element' && (
          <div className="space-y-2 pt-2 border-t border-[#1c2230]">
            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={props.visible !== false}
                onChange={(e) => handlePropChange('visible', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">Require element to be visible</span>
            </label>
            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={props.enabled === true}
                onChange={(e) => handlePropChange('enabled', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">Wait until element is enabled (not disabled)</span>
            </label>
          </div>
        )}

        {/* Text Field (Type Text, Wait For Text) */}
        {['type_text', 'wait_for_text'].includes(selectedNode.data.type) && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-400">
                {selectedNode.data.type === 'wait_for_text' ? 'Text to Wait For' : 'Text'}
              </label>
              {availableVars.length > 0 && (
                <span className="text-[10px] text-gray-500">Supports &#123;&#123;var&#125;&#125;</span>
              )}
            </div>
            <textarea
              rows={3}
              value={props.text || ''}
              onChange={(e) => handlePropChange('text', e.target.value)}
              placeholder={selectedNode.data.type === 'wait_for_text' ? 'Wait for this text to appear...' : 'Text to type...'}
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs"
            />
          </div>
        )}

        {/* Wait For Text Options */}
        {selectedNode.data.type === 'wait_for_text' && (
          <div className="space-y-2.5 pt-2 border-t border-[#1c2230]">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Match Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePropChange('matchMode', 'partial')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                    (props.matchMode || 'partial') === 'partial'
                      ? 'bg-purple-600/25 text-purple-300 border-purple-500/60 font-semibold'
                      : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                  }`}
                >
                  Partial Match
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange('matchMode', 'exact')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                    props.matchMode === 'exact'
                      ? 'bg-purple-600/25 text-purple-300 border-purple-500/60 font-semibold'
                      : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                  }`}
                >
                  Exact Match
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer pt-0.5">
              <input
                type="checkbox"
                checked={props.caseSensitive === true}
                onChange={(e) => handlePropChange('caseSensitive', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">Respect Casing (Case-sensitive)</span>
            </label>
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
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Wait Duration / Timeout (ms)</label>
              <input
                type="number"
                value={props.duration || props.timeout || 1000}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  handlePropChange('duration', val);
                  handlePropChange('timeout', val);
                }}
                min={50}
                step={100}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              />
              <div className="flex items-center gap-1.5 mt-2">
                {[500, 1000, 2000, 5000, 10000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      handlePropChange('duration', preset);
                      handlePropChange('timeout', preset);
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                      (props.duration || props.timeout || 1000) === preset
                        ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                        : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                    }`}
                  >
                    {preset >= 1000 ? `${preset / 1000}s` : `${preset}ms`}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Timer Identifier for command targeting */}
            <div className="pt-2 border-t border-[#1c2230]">
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Timer Name / ID (optional)
              </label>
              <input
                type="text"
                value={props.timerName || ''}
                onChange={(e) => handlePropChange('timerName', e.target.value)}
                placeholder="e.g. loginWait, myTimer (for targeting with Stop Timer)"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Allows other nodes (like Stop Timer or Reset Timer) to specifically stop this timer by name.
              </p>
            </div>

            {/* Early Stop Condition Card */}
            <div className="p-3 rounded-xl bg-[#131722] border border-[#232a3b] space-y-2.5">
              <label className="flex items-center gap-2 text-gray-200 cursor-pointer font-medium text-xs">
                <input
                  type="checkbox"
                  checked={props.stopCondition?.enabled === true}
                  onChange={(e) => {
                    const current = props.stopCondition || {};
                    handlePropChange('stopCondition', { ...current, enabled: e.target.checked });
                  }}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span>Stop wait timer early if condition matches</span>
              </label>

              {props.stopCondition?.enabled && (
                <div className="space-y-2.5 pt-2 border-t border-[#1c2230]">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-400 mb-1">Condition Type</label>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { id: 'text', label: 'Text Exists' },
                        { id: 'element', label: 'Element Exists' },
                        { id: 'variable', label: 'Variable Check' },
                      ].map((typeOption) => (
                        <button
                          key={typeOption.id}
                          type="button"
                          onClick={() => {
                            const current = props.stopCondition || {};
                            handlePropChange('stopCondition', { ...current, type: typeOption.id });
                          }}
                          className={`py-1 px-1.5 rounded text-[10px] font-medium border transition-colors ${
                            (props.stopCondition?.type || 'text') === typeOption.id
                              ? 'bg-purple-600/30 text-purple-300 border-purple-500/50 font-semibold'
                              : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                          }`}
                        >
                          {typeOption.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Text Exists Stop Condition */}
                  {(props.stopCondition?.type || 'text') === 'text' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Text to Watch For</label>
                        <input
                          type="text"
                          value={props.stopCondition?.text || ''}
                          onChange={(e) => {
                            const current = props.stopCondition || {};
                            handlePropChange('stopCondition', { ...current, text: e.target.value });
                          }}
                          placeholder="e.g. Order Confirmed, Submit Successful..."
                          className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const current = props.stopCondition || {};
                            handlePropChange('stopCondition', { ...current, matchMode: 'partial' });
                          }}
                          className={`py-1 px-2 rounded text-[10px] border transition-colors ${
                            (props.stopCondition?.matchMode || 'partial') === 'partial'
                              ? 'bg-purple-600/30 text-purple-300 border-purple-500/50 font-semibold'
                              : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                          }`}
                        >
                          Partial Match
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const current = props.stopCondition || {};
                            handlePropChange('stopCondition', { ...current, matchMode: 'exact' });
                          }}
                          className={`py-1 px-2 rounded text-[10px] border transition-colors ${
                            props.stopCondition?.matchMode === 'exact'
                              ? 'bg-purple-600/30 text-purple-300 border-purple-500/50 font-semibold'
                              : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                          }`}
                        >
                          Exact Match
                        </button>
                      </div>

                      <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={props.stopCondition?.caseSensitive === true}
                          onChange={(e) => {
                            const current = props.stopCondition || {};
                            handlePropChange('stopCondition', { ...current, caseSensitive: e.target.checked });
                          }}
                          className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                        />
                        <span className="text-[10px]">Respect Casing (Case-sensitive)</span>
                      </label>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-gray-400">Container Element (optional)</label>
                          <button
                            type="button"
                            onClick={() => onStartElementPicker('single')}
                            className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-white"
                          >
                            <Crosshair className="w-3 h-3" />
                            <span>Pick Element</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          value={props.stopCondition?.selector || ''}
                          onChange={(e) => {
                            const current = props.stopCondition || {};
                            handlePropChange('stopCondition', { ...current, selector: e.target.value });
                          }}
                          placeholder="Leave empty for whole page, or #container"
                          className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* Element Exists Stop Condition */}
                  {props.stopCondition?.type === 'element' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-gray-400">Element to Watch For</label>
                        <button
                          type="button"
                          onClick={() => onStartElementPicker('single')}
                          className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-white"
                        >
                          <Crosshair className="w-3 h-3" />
                          <span>Pick Element</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={props.stopCondition?.selector || ''}
                        onChange={(e) => {
                          const current = props.stopCondition || {};
                          handlePropChange('stopCondition', { ...current, selector: e.target.value });
                        }}
                        placeholder="#target, .modal-success, button[disabled]"
                        className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                      />
                    </div>
                  )}

                  {/* Variable Check Stop Condition */}
                  {props.stopCondition?.type === 'variable' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Left Variable / Value</label>
                        <input
                          type="text"
                          value={props.stopCondition?.leftValue || ''}
                          onChange={(e) => {
                            const current = props.stopCondition || {};
                            handlePropChange('stopCondition', { ...current, leftValue: e.target.value });
                          }}
                          placeholder="{{status}}, {{isReady}}"
                          className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-1">Operator</label>
                          <select
                            value={props.stopCondition?.operator || 'equals'}
                            onChange={(e) => {
                              const current = props.stopCondition || {};
                              handlePropChange('stopCondition', { ...current, operator: e.target.value });
                            }}
                            className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                          >
                            <option value="equals">equals (==)</option>
                            <option value="not_equals">not equals (!=)</option>
                            <option value="contains">contains</option>
                            <option value="exists">exists</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-1">Right Value</label>
                          <input
                            type="text"
                            value={props.stopCondition?.rightValue || ''}
                            onChange={(e) => {
                              const current = props.stopCondition || {};
                              handlePropChange('stopCondition', { ...current, rightValue: e.target.value });
                            }}
                            placeholder="true, done, success"
                            className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-emerald-400/90 leading-tight">
                    If this condition becomes true while waiting, the timer immediately finishes early and proceeds downstream!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Output Variable (Extract Text, Attribute, Table, Screenshot, JS, Data, Storage, AI, Image, New Nodes) */}
        {['extract_text', 'extract_attribute', 'extract_html', 'extract_table', 'extract_multiple', 'crawl_pagination', 'extract_links', 'extract_image', 'extract_all_images', 'scrape_elements', 'screenshot', 'execute_javascript', 'http_request', 'transform', 'regex', 'json_parse', 'generate_data', 'storage_manage', 'ai_agent', 'smart_scroll', 'download_file', 'show_notification', 'math_calculate', 'export_data'].includes(
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
        {/* Collection Iterator: Item Variable Name */}
        {['extract_image', 'extract_all_images', 'extract_multiple', 'crawl_pagination', 'scrape_elements'].includes(selectedNode.data.type) && (
          <div className="pt-2 border-t border-[#1c2230] space-y-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Loop Body Item Variable Name
              </label>
              <input
                type="text"
                value={props.itemVariable || (['extract_image', 'extract_all_images'].includes(selectedNode.data.type) ? 'currentImage' : (selectedNode.data.type === 'scrape_elements' ? 'currentProduct' : (selectedNode.data.type === 'crawl_pagination' ? 'crawledItem' : 'currentElement')))}
                onChange={(e) => handlePropChange('itemVariable', e.target.value)}
                placeholder={['extract_image', 'extract_all_images'].includes(selectedNode.data.type) ? 'currentImage' : (selectedNode.data.type === 'scrape_elements' ? 'currentProduct' : (selectedNode.data.type === 'crawl_pagination' ? 'crawledItem' : 'currentElement'))}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-[11px]"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                When lines are connected to the "For Each" handle, each item is exposed as &#123;&#123;{props.itemVariable || (['extract_image', 'extract_all_images'].includes(selectedNode.data.type) ? 'currentImage' : (selectedNode.data.type === 'scrape_elements' ? 'currentProduct' : (selectedNode.data.type === 'crawl_pagination' ? 'crawledItem' : 'currentElement')))}&#125;&#125;
              </p>
            </div>

            {/* Field Extraction / Item Extract Mode for Scrape Elements */}
            {selectedNode.data.type === 'scrape_elements' && (
              <div className="p-2.5 rounded-lg bg-[#141924] border border-[#202738] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-gray-300">
                    Expose / Extract Item Part
                  </label>
                  <span className="text-[10px] text-indigo-400 font-mono">
                    &#123;&#123;{props.itemVariable || 'currentProduct'}&#125;&#125;
                  </span>
                </div>
                <select
                  value={props.itemExtractField || 'all'}
                  onChange={(e) => handlePropChange('itemExtractField', e.target.value)}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] text-xs outline-none"
                >
                  <option value="all">Full Product Object (JSON string or object)</option>
                  {(Array.isArray(props.fields) && props.fields.length > 0 ? props.fields : [
                    { name: 'link' }, { name: 'title' }, { name: 'price' }, { name: 'image' }, { name: 'description' }
                  ]).map((f: any) => (
                    <option key={f.name} value={f.name}>
                      Extract "{f.name}" only (string value)
                    </option>
                  ))}
                  <option value="custom">Custom property...</option>
                </select>

                {props.itemExtractField === 'custom' && (
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Custom Property Path</label>
                    <input
                      type="text"
                      value={props.itemExtractCustomField || ''}
                      onChange={(e) => handlePropChange('itemExtractCustomField', e.target.value)}
                      placeholder="e.g. link, title, nested.prop"
                      className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs font-mono outline-none"
                    />
                  </div>
                )}

                <div className="text-[10px] text-gray-400 space-y-1 pt-1 border-t border-[#1e2433]">
                  <p className="font-medium text-gray-300">Loop variables available inside loop body:</p>
                  <div className="flex flex-wrap gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-black/40 border border-gray-700 font-mono text-[9px] text-amber-300" title="Primary loop variable">
                      &#123;&#123;{props.itemVariable || 'currentProduct'}&#125;&#125;
                    </span>
                    {(Array.isArray(props.fields) ? props.fields : []).map((f: any) => (
                      <span key={f.name} className="px-1.5 py-0.5 rounded bg-black/40 border border-gray-700 font-mono text-[9px] text-cyan-300" title={`Direct field shortcut: {{${f.name}}} or dot notation: {{${props.itemVariable || 'currentProduct'}.${f.name}}}`}>
                        &#123;&#123;{f.name}&#125;&#125;
                      </span>
                    ))}
                    <span className="px-1.5 py-0.5 rounded bg-black/40 border border-gray-700 font-mono text-[9px] text-emerald-300" title="Full object backup if extracting single field">
                      &#123;&#123;{props.itemVariable || 'currentProduct'}_object&#125;&#125;
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Crawl Pagination Node Settings */}
        {selectedNode.data.type === 'crawl_pagination' && (
          <div className="space-y-3 pt-2 border-t border-[#1c2230]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                Pagination Crawl Mode
              </label>
              <span className="text-[10px] text-indigo-400 font-mono font-bold">Auto-Crawler</span>
            </div>

            {/* Mode selection buttons */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433]">
              <button
                type="button"
                onClick={() => handlePropChange('mode', 'auto_detect')}
                className={`py-1.5 px-2 text-center rounded-lg text-[11px] font-medium transition-all ${
                  (props.mode || 'auto_detect') === 'auto_detect'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                }`}
                title="Automatically discovers next page buttons via rel=next, aria-label, classes, or Next text"
              >
                Auto-Detect
              </button>
              <button
                type="button"
                onClick={() => handlePropChange('mode', 'next_button')}
                className={`py-1.5 px-2 text-center rounded-lg text-[11px] font-medium transition-all ${
                  props.mode === 'next_button'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                }`}
                title="Clicks a specified Next Page button on each iteration"
              >
                Next Button
              </button>
              <button
                type="button"
                onClick={() => handlePropChange('mode', 'infinite_scroll')}
                className={`py-1.5 px-2 text-center rounded-lg text-[11px] font-medium transition-all ${
                  props.mode === 'infinite_scroll'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                }`}
                title="Scrolls down to trigger infinite feed loading"
              >
                Infinite Scroll
              </button>
            </div>

            {/* Next Button Selector (if mode !== 'infinite_scroll') */}
            {props.mode !== 'infinite_scroll' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-400">
                    Next Page Button Selector {props.mode === 'auto_detect' && '(optional override)'}
                  </label>
                  <button
                    type="button"
                    onClick={() => onStartElementPicker('single')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      isPickingElement
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30'
                    }`}
                    title="Select the next page button or link"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>Pick Button</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={props.nextButtonSelector || ''}
                  onChange={(e) => handlePropChange('nextButtonSelector', e.target.value)}
                  placeholder={props.mode === 'auto_detect' ? 'Auto-detected (or e.g. a.next, button:has-text("Next"))' : 'e.g. .pagination-next, a[rel="next"], button:has-text("Next")'}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-[11px]"
                />
              </div>
            )}

            {/* Max Pages and Delay Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Pages to Crawl</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={props.maxPages ?? 5}
                  onChange={(e) => handlePropChange('maxPages', Math.max(1, Number(e.target.value)))}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Page Load Delay (ms)</label>
                <input
                  type="number"
                  min={300}
                  step={200}
                  value={props.pageDelay ?? 1500}
                  onChange={(e) => handlePropChange('pageDelay', Math.max(300, Number(e.target.value)))}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
                />
              </div>
            </div>

            {/* Checkboxes: Deduplicate and Stop on No New Items */}
            <div className="space-y-1.5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.deduplicate !== false}
                  onChange={(e) => handlePropChange('deduplicate', e.target.checked)}
                  className="rounded border-[#232a3b] text-indigo-600 focus:ring-0 bg-[#0e1118]"
                />
                <span className="text-[11px] text-gray-300">Deduplicate repeating items across pages</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.stopOnNoNewItems !== false}
                  onChange={(e) => handlePropChange('stopOnNoNewItems', e.target.checked)}
                  className="rounded border-[#232a3b] text-indigo-600 focus:ring-0 bg-[#0e1118]"
                />
                <span className="text-[11px] text-gray-300">Stop crawling when no new items appear</span>
              </label>
            </div>
          </div>
        )}

        {/* Extract Multiple Direct File Export */}
        {selectedNode.data.type === 'extract_multiple' && (
          <div className="space-y-2.5 pt-2 border-t border-[#1c2230]">
            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!props.exportToFile}
                onChange={(e) => handlePropChange('exportToFile', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px] font-medium text-indigo-300">
                Direct Export Items to File (CSV / XLSX / JSON)
              </span>
            </label>

            {props.exportToFile && (
              <div className="space-y-2 p-2 rounded-lg bg-[#0e121a] border border-[#1e2433]">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Format</label>
                    <select
                      value={props.exportFormat || 'csv'}
                      onChange={(e) => handlePropChange('exportFormat', e.target.value)}
                      className="w-full bg-[#11141c] text-white p-1 rounded border border-[#1c2230] text-xs"
                    >
                      <option value="csv">CSV Spreadsheet (.csv)</option>
                      <option value="xlsx">Excel (.xlsx)</option>
                      <option value="json">JSON (.json)</option>
                      <option value="tsv">TSV (.tsv)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Filename</label>
                    <input
                      type="text"
                      value={props.exportFilename || 'extracted_items'}
                      onChange={(e) => handlePropChange('exportFilename', e.target.value)}
                      placeholder="extracted_items"
                      className="w-full bg-[#11141c] text-white p-1 rounded border border-[#1c2230] text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Crawl Pagination Direct File Export */}
        {selectedNode.data.type === 'crawl_pagination' && (
          <div className="space-y-2.5 pt-2 border-t border-[#1c2230]">
            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={!!props.exportToFile}
                onChange={(e) => handlePropChange('exportToFile', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px] font-medium text-indigo-300">
                Direct Export Crawled Dataset (CSV / XLSX / JSON)
              </span>
            </label>

            {props.exportToFile && (
              <div className="space-y-2 p-2 rounded-lg bg-[#0e121a] border border-[#1e2433]">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Format</label>
                    <select
                      value={props.exportFormat || 'csv'}
                      onChange={(e) => handlePropChange('exportFormat', e.target.value)}
                      className="w-full bg-[#11141c] text-white p-1 rounded border border-[#1c2230] text-xs"
                    >
                      <option value="csv">CSV Spreadsheet (.csv)</option>
                      <option value="xlsx">Excel (.xlsx)</option>
                      <option value="json">JSON (.json)</option>
                      <option value="tsv">TSV (.tsv)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Filename</label>
                    <input
                      type="text"
                      value={props.exportFilename || 'crawled_dataset'}
                      onChange={(e) => handlePropChange('exportFilename', e.target.value)}
                      placeholder="crawled_dataset"
                      className="w-full bg-[#11141c] text-white p-1 rounded border border-[#1c2230] text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scrape Elements (Product Cards / Multi-Field) Node */}
        {selectedNode.data.type === 'scrape_elements' && (
          <div className="space-y-3.5 pt-2 border-t border-[#1c2230]">
            {/* Card Container Selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-gray-300">
                  Card Container Selector
                </label>
                <button
                  type="button"
                  onClick={() => onStartElementPicker('single')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    isPickingElement
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30'
                  }`}
                  title="Pick container card element from page"
                >
                  <Crosshair className="w-3 h-3" />
                  <span>{isPickingElement ? 'Picking...' : 'Pick Container'}</span>
                </button>
              </div>
              <input
                type="text"
                value={props.containerSelector || ''}
                onChange={(e) => handlePropChange('containerSelector', e.target.value)}
                placeholder=".product-card, .listing-item, article, div.item"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                CSS selector that identifies each repeating item/card container on the page.
              </p>
            </div>

            {/* Quick Schema Presets */}
            <div>
              <span className="text-[10px] font-medium text-gray-400 block mb-1">
                Quick Schema Presets:
              </span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    handlePropChange('fields', [
                      { name: 'title', selector: 'h2, h3, h4, .title, [class*="title"]', attribute: 'text' },
                      { name: 'price', selector: '.price, [class*="price"]', attribute: 'text' },
                      { name: 'image', selector: 'img', attribute: 'src' },
                      { name: 'link', selector: 'a', attribute: 'href' },
                      { name: 'description', selector: 'p', attribute: 'paragraphs' },
                    ]);
                  }}
                  className="px-2 py-1 bg-[#141924] hover:bg-[#1e2536] border border-[#202738] rounded text-[10px] text-gray-300 hover:text-white transition-colors"
                >
                  E-Commerce
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handlePropChange('fields', [
                      { name: 'headline', selector: 'h2, h3, h4, a', attribute: 'text' },
                      { name: 'author', selector: '.author, [rel="author"]', attribute: 'text' },
                      { name: 'date', selector: 'time, .date', attribute: 'text' },
                      { name: 'paragraphs', selector: 'p', attribute: 'paragraphs' },
                      { name: 'image', selector: 'img', attribute: 'src' },
                      { name: 'url', selector: 'a', attribute: 'href' },
                    ]);
                  }}
                  className="px-2 py-1 bg-[#141924] hover:bg-[#1e2536] border border-[#202738] rounded text-[10px] text-gray-300 hover:text-white transition-colors"
                >
                  Articles
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handlePropChange('fields', [
                      { name: 'name', selector: 'h3, h4, .name, strong', attribute: 'text' },
                      { name: 'role', selector: '.role, .title', attribute: 'text' },
                      { name: 'company', selector: '.company', attribute: 'text' },
                      { name: 'email', selector: 'a[href^="mailto:"]', attribute: 'href' },
                      { name: 'link', selector: 'a', attribute: 'href' },
                    ]);
                  }}
                  className="px-2 py-1 bg-[#141924] hover:bg-[#1e2536] border border-[#202738] rounded text-[10px] text-gray-300 hover:text-white transition-colors"
                >
                  Leads
                </button>
              </div>
            </div>

            {/* Fields List */}
            <div className="space-y-2 p-2.5 rounded-xl bg-[#0e121a] border border-[#1e2433]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-300">
                  Card Fields to Extract ({(props.fields || []).length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const current = Array.isArray(props.fields) ? props.fields : [];
                    handlePropChange('fields', [
                      ...current,
                      { name: `field_${current.length + 1}`, selector: '', attribute: 'text' },
                    ]);
                  }}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3 h-3" /> Add Field
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {(Array.isArray(props.fields) && props.fields.length > 0 ? props.fields : [
                  { name: 'title', selector: 'h2', attribute: 'text' },
                  { name: 'price', selector: '.price', attribute: 'text' },
                  { name: 'image', selector: 'img', attribute: 'src' },
                  { name: 'link', selector: 'a', attribute: 'href' },
                ]).map((field: any, idx: number) => (
                  <div key={idx} className="bg-[#141924] p-2 rounded-lg border border-[#202738] space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={field.name}
                        onChange={(e) => {
                          const updated = [...(props.fields || [])];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          handlePropChange('fields', updated);
                        }}
                        placeholder="Field name"
                        className="w-1/3 bg-[#0d1017] text-white px-2 py-1 rounded border border-[#202738] outline-none text-[11px]"
                      />
                      <input
                        type="text"
                        value={field.selector}
                        onChange={(e) => {
                          const updated = [...(props.fields || [])];
                          updated[idx] = { ...updated[idx], selector: e.target.value };
                          handlePropChange('fields', updated);
                        }}
                        placeholder="Selector inside card (e.g. h2, img, a)"
                        className="flex-1 bg-[#0d1017] text-white px-2 py-1 rounded border border-[#202738] outline-none text-[11px] font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (props.fields || []).filter((_: any, i: number) => i !== idx);
                          handlePropChange('fields', updated);
                        }}
                        className="text-gray-500 hover:text-red-400 p-1"
                        title="Delete field"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-500 shrink-0">Extract:</span>
                      <select
                        value={field.attribute || 'text'}
                        onChange={(e) => {
                          const updated = [...(props.fields || [])];
                          updated[idx] = { ...updated[idx], attribute: e.target.value };
                          handlePropChange('fields', updated);
                        }}
                        className="flex-1 bg-[#0d1017] text-white px-2 py-1 rounded border border-[#202738] outline-none text-[10px]"
                      >
                        <option value="text">Text Content</option>
                        <option value="src">Image URL (src / lazy data-src / srcset)</option>
                        <option value="href">Link URL (href - absolute URL)</option>
                        <option value="paragraphs">Paragraphs (all &lt;p&gt; aggregated)</option>
                        <option value="value">Form Input Value</option>
                        <option value="innerHTML">innerHTML</option>
                        <option value="outerHTML">outerHTML</option>
                        <option value="data-id">data-id / custom attribute</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Direct Export to File Checkbox & Settings */}
            <div className="space-y-2.5 pt-2 border-t border-[#1c2230]">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!props.exportToFile}
                  onChange={(e) => handlePropChange('exportToFile', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px] font-medium text-indigo-300">
                  Direct Export Scraped Cards to File (CSV / XLSX / JSON / TSV)
                </span>
              </label>

              {props.exportToFile && (
                <div className="space-y-2 p-2.5 rounded-lg bg-[#0e121a] border border-[#1e2433]">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Format</label>
                      <select
                        value={props.exportFormat || 'csv'}
                        onChange={(e) => handlePropChange('exportFormat', e.target.value)}
                        className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs"
                      >
                        <option value="csv">CSV Spreadsheet (.csv)</option>
                        <option value="xlsx">Excel Spreadsheet (.xlsx)</option>
                        <option value="json">JSON (.json)</option>
                        <option value="tsv">TSV (.tsv)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Filename</label>
                      <input
                        type="text"
                        value={props.exportFilename || 'scraped_products'}
                        onChange={(e) => handlePropChange('exportFilename', e.target.value)}
                        placeholder="scraped_products"
                        className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Exclude Empty Entries Filter */}
            <div className="space-y-2 pt-2 border-t border-[#1c2230]">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!props.excludeEmpty}
                  onChange={(e) => handlePropChange('excludeEmpty', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px] font-medium text-amber-300 flex items-center gap-1.5">
                  <span>Exclude:</span> Exclude entries with empty fields
                </span>
              </label>

              {props.excludeEmpty && (
                <div className="pl-5 space-y-1.5">
                  <label className="block text-[10px] text-gray-400">Exclusion Rule</label>
                  <select
                    value={props.filterEmptyMode || 'any'}
                    onChange={(e) => handlePropChange('filterEmptyMode', e.target.value)}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs outline-none"
                  >
                    <option value="any">Strict: Exclude card if ANY field is empty</option>
                    <option value="all">Lenient: Exclude card only if ALL fields are empty</option>
                  </select>
                  <p className="text-[10px] text-gray-500">
                    Drops scraped cards that have missing or blank values before saving to variables or exporting.
                  </p>
                </div>
              )}
            </div>

            {/* Data Post-Processing & Filtering */}
            <div className="pt-3 border-t border-[#1c2230] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <span>Data Post-Processing &amp; Filtering</span>
                </label>
                <span className="text-[10px] text-teal-400 font-mono">Clean &amp; Filter</span>
              </div>

              {/* 1. URL & Link Normalization */}
              <div className="p-2.5 rounded-lg bg-[#0e121a] border border-[#1e2433] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-300">URL &amp; Link Processor</span>
                  <span className="text-[10px] text-gray-500">Auto-fixes incomplete links</span>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">
                    Base URL Prefix (e.g. for /product or relative paths)
                  </label>
                  <input
                    type="text"
                    value={props.urlBasePrefix || ''}
                    onChange={(e) => handlePropChange('urlBasePrefix', e.target.value)}
                    placeholder="e.g. https://www.amazon.in"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs font-mono outline-none"
                  />
                  <p className="text-[9px] text-gray-500 mt-1">
                    Prepends this domain if an extracted link is relative like <code className="text-gray-400 font-mono">/dp/B08XYZ</code> (also strips leading <code className="text-gray-400 font-mono">./</code>).
                  </p>
                </div>

                {/* Selectable Target Fields for URL Formatting */}
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-semibold text-gray-300">
                      Apply URL Formatting To Fields:
                    </label>
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <button
                        type="button"
                        onClick={() => {
                          const allNames = Array.isArray(props.fields)
                            ? props.fields.map((f: any) => f.name).filter(Boolean)
                            : ['link', 'image'];
                          handlePropChange('urlTargetFields', allNames);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 underline"
                      >
                        Select All
                      </button>
                      <span className="text-gray-600">|</span>
                      <button
                        type="button"
                        onClick={() => handlePropChange('urlTargetFields', ['link'])}
                        className="text-gray-400 hover:text-gray-300 underline"
                      >
                        Link Only
                      </button>
                    </div>
                  </div>

                  {/* Multiple Selectable Field Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const definedFields: string[] = Array.isArray(props.fields)
                        ? props.fields.map((f: any) => f.name || '').filter(Boolean)
                        : [];
                      const candidateFields = Array.from(new Set([...definedFields, 'link', 'image']));
                      const currentSelected: string[] = Array.isArray(props.urlTargetFields)
                        ? props.urlTargetFields
                        : (Array.isArray(props.urlFields) ? props.urlFields : ['link']);

                      return candidateFields.map((field) => {
                        const isSelected = currentSelected.includes(field);
                        return (
                          <button
                            key={field}
                            type="button"
                            onClick={() => {
                              const updated = isSelected
                                ? currentSelected.filter((f) => f !== field)
                                : [...currentSelected, field];
                              handlePropChange('urlTargetFields', updated);
                            }}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
                              isSelected
                                ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 shadow-sm'
                                : 'bg-[#11141c] text-gray-400 border-[#1c2230] hover:text-gray-200 hover:border-[#2b3548]'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-indigo-400' : 'bg-gray-600'}`} />
                            <span>{field}</span>
                            {isSelected && <Check className="w-2.5 h-2.5 text-indigo-400" />}
                          </button>
                        );
                      });
                    })()}
                  </div>
                  <p className="text-[9px] text-gray-500 mt-1">
                    Select multiple fields to clean <code className="text-gray-400 font-mono">./</code> and prepend base URL (e.g. <code className="text-gray-400 font-mono">link</code>, <code className="text-gray-400 font-mono">image</code>).
                  </p>
                </div>
                <div className="space-y-1.5 pt-1">
                  <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!props.stripUrlQueryParams}
                      onChange={(e) => handlePropChange('stripUrlQueryParams', e.target.checked)}
                      className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                    />
                    <span className="text-[10px]">
                      Strip marketing tracking parameters (<code className="text-indigo-300 font-mono">?ref=...</code>, <code className="text-indigo-300 font-mono">utm_*</code>, <code className="text-indigo-300 font-mono">qid</code>)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!props.stripAllQueryParams}
                      onChange={(e) => handlePropChange('stripAllQueryParams', e.target.checked)}
                      className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                    />
                    <span className="text-[10px]">
                      Strip all query parameters completely (clean canonical path only)
                    </span>
                  </label>
                </div>
              </div>

              {/* 2. Price & Number Cleaner */}
              <div className="p-2.5 rounded-lg bg-[#0e121a] border border-[#1e2433] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!props.cleanPrice}
                      onChange={(e) => handlePropChange('cleanPrice', e.target.checked)}
                      className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                    />
                    <span className="text-[11px] font-medium text-gray-200">Price &amp; Number Cleaner</span>
                  </label>
                  {props.cleanPrice && <span className="text-[10px] text-emerald-400 font-mono">Active</span>}
                </div>

                {props.cleanPrice && (
                  <div className="space-y-2 pt-1 border-t border-[#1c2230]/60">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Price Cleaning Mode</label>
                      <select
                        value={props.priceMode || 'number_only'}
                        onChange={(e) => handlePropChange('priceMode', e.target.value)}
                        className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs outline-none"
                      >
                        <option value="number_only">Number Only (e.g. "$1,299.99" or "₹1,299" &#8594; "1299.99")</option>
                        <option value="strip_symbols">Strip Currency Symbols (e.g. "$1,299.99" &#8594; "1,299.99")</option>
                      </select>
                      <p className="text-[9px] text-gray-500 mt-1">
                        Extracts pure numbers and cleans thousand-separators or currencies (₹, $, €, £, etc.).
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Date & Time Formatter */}
              <div className="p-2.5 rounded-lg bg-[#0e121a] border border-[#1e2433] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!props.formatDate}
                      onChange={(e) => handlePropChange('formatDate', e.target.checked)}
                      className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                    />
                    <span className="text-[11px] font-medium text-gray-200">Date &amp; Time Formatter</span>
                  </label>
                  {props.formatDate && <span className="text-[10px] text-teal-400 font-mono">Active</span>}
                </div>

                {props.formatDate && (
                  <div className="space-y-2 pt-1 border-t border-[#1c2230]/60">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Date Format Mode</label>
                      <select
                        value={props.dateMode || 'iso_date'}
                        onChange={(e) => handlePropChange('dateMode', e.target.value)}
                        className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs outline-none"
                      >
                        <option value="iso_date">ISO Date (YYYY-MM-DD)</option>
                        <option value="iso_datetime">Full ISO DateTime (YYYY-MM-DDTHH:mm:ssZ)</option>
                        <option value="timestamp">Unix Millisecond Timestamp</option>
                      </select>
                      <p className="text-[9px] text-gray-500 mt-1">
                        Converts relative dates (e.g. "2 hours ago", "yesterday") and dates into standardized ISO strings.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Pattern Condition Filter ("if url in this pattern then only") */}
              <div className="p-2.5 rounded-lg bg-[#0e121a] border border-[#1e2433] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!props.patternFilterEnabled}
                      onChange={(e) => handlePropChange('patternFilterEnabled', e.target.checked)}
                      className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                    />
                    <span className="text-[11px] font-medium text-gray-200">Pattern Condition Filter</span>
                  </label>
                  {props.patternFilterEnabled && (
                    <span className="text-[10px] text-amber-400 font-mono">Filtering Rows</span>
                  )}
                </div>

                {props.patternFilterEnabled && (
                  <div className="space-y-2.5 pt-1 border-t border-[#1c2230]/60">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Target Field</label>
                        <select
                          value={props.patternFilterField || 'link'}
                          onChange={(e) => handlePropChange('patternFilterField', e.target.value)}
                          className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs outline-none font-mono"
                        >
                          <option value="link">link / URL</option>
                          <option value="title">title</option>
                          <option value="price">price</option>
                          <option value="image">image</option>
                          {(Array.isArray(props.fields) ? props.fields : []).map((f: any) => (
                            <option key={f.name} value={f.name}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Rule Action</label>
                        <select
                          value={props.patternFilterAction || 'include_only'}
                          onChange={(e) => handlePropChange('patternFilterAction', e.target.value)}
                          className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs outline-none"
                        >
                          <option value="include_only">Only include if matches</option>
                          <option value="exclude_matching">Exclude if matches</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="block text-[10px] text-gray-400 mb-1">Match Mode</label>
                        <select
                          value={props.patternFilterMode || 'contains'}
                          onChange={(e) => handlePropChange('patternFilterMode', e.target.value)}
                          className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs outline-none"
                        >
                          <option value="contains">Contains (*)</option>
                          <option value="starts_with">Starts With</option>
                          <option value="ends_with">Ends With</option>
                          <option value="regex">Regex</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] text-gray-400 mb-1">Pattern Value</label>
                        <input
                          type="text"
                          value={props.patternFilterValue || ''}
                          onChange={(e) => handlePropChange('patternFilterValue', e.target.value)}
                          placeholder="e.g. /product/, /dp/, *electronics*"
                          className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs font-mono outline-none"
                        />
                      </div>
                    </div>
                    <p className="text-[9px] text-gray-500">
                      Discards incoming scraped rows that do not satisfy this pattern condition before feeding downstream loop bodies or exports.
                    </p>
                  </div>
                )}
              </div>
            </div>
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

        {/* Extract Text: Optional Regex Filter */}
        {selectedNode.data.type === 'extract_text' && (
          <div className="space-y-2 pt-2 border-t border-[#1c2230]">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Regex Filter / Extraction Pattern (optional)
              </label>
              <input
                type="text"
                value={props.regexPattern || ''}
                onChange={(e) => handlePropChange('regexPattern', e.target.value)}
                placeholder="e.g. \\$([0-9,.]+) or ID-\\d+"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-[11px]"
              />
              <p className="text-[10px] text-gray-500 mt-0.5">
                Leave blank to extract full text, or specify a regex pattern to extract only the matching part.
              </p>
            </div>
            {props.regexPattern && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Flags</label>
                  <input
                    type="text"
                    value={props.regexFlags || 'g'}
                    onChange={(e) => handlePropChange('regexFlags', e.target.value)}
                    placeholder="g, gi, etc."
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Extract Group</label>
                  <select
                    value={props.extractGroup ?? 'full'}
                    onChange={(e) => handlePropChange('extractGroup', e.target.value)}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs"
                  >
                    <option value="full">Full Match</option>
                    <option value="1">Group 1</option>
                    <option value="2">Group 2</option>
                    <option value="3">Group 3</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Attribute Name (Extract Attribute / Extract Multiple / Crawl Pagination) */}
        {['extract_attribute', 'extract_multiple', 'crawl_pagination'].includes(selectedNode.data.type) && (
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-gray-400">
              Attribute Name {['extract_multiple', 'crawl_pagination'].includes(selectedNode.data.type) && '(optional, leave blank for text)'}
            </label>
            <input
              type="text"
              value={props.attribute || ''}
              onChange={(e) => handlePropChange('attribute', e.target.value)}
              placeholder="text, src, href, paragraphs, value, data-id..."
              className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
            />
            <div className="flex flex-wrap gap-1 pt-0.5">
              {[
                { label: 'text', value: 'text', desc: 'Inner text' },
                { label: 'src (image)', value: 'src', desc: 'Image URL' },
                { label: 'href (link)', value: 'href', desc: 'Link URL' },
                { label: 'paragraphs', value: 'paragraphs', desc: 'All <p> paragraphs' },
                { label: 'value', value: 'value', desc: 'Input Value' },
                { label: 'innerHTML', value: 'innerHTML', desc: 'Inner HTML' },
              ].map((attr) => (
                <button
                  key={attr.value}
                  type="button"
                  onClick={() => handlePropChange('attribute', attr.value)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    (props.attribute || '') === attr.value
                      ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 font-semibold'
                      : 'bg-[#141924] text-gray-400 border-[#202738] hover:text-white'
                  }`}
                  title={attr.desc}
                >
                  {attr.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500">
              Tip: <span className="text-indigo-400 font-mono">src</span> auto-resolves lazy images (<code>data-src</code>, <code>srcset</code>, background-image); <span className="text-indigo-400 font-mono">href</span> returns full absolute URLs.
            </p>
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

            {/* Scrolling Speed Selector */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Scrolling Speed</label>
              <div className="grid grid-cols-4 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433]">
                {[
                  { id: 'slow', label: 'Slow', delay: 1500, desc: '1.5s delay, smooth' },
                  { id: 'normal', label: 'Normal', delay: 800, desc: '800ms delay, smooth' },
                  { id: 'fast', label: 'Fast', delay: 300, desc: '300ms delay, smooth' },
                  { id: 'instant', label: 'Instant', delay: 50, desc: '50ms jump, immediate' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onUpdateProperties(selectedNode.id, {
                        ...props,
                        scrollSpeed: s.id,
                        scrollDelay: s.delay,
                        smooth: s.id !== 'instant',
                      });
                    }}
                    className={`py-1 px-1.5 text-center rounded-lg text-[11px] font-medium transition-all ${
                      (props.scrollSpeed || 'normal') === s.id
                        ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                    }`}
                    title={s.desc}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
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
                  value={props.scrollDelay ?? 800}
                  onChange={(e) => {
                    handlePropChange('scrollDelay', Number(e.target.value));
                    handlePropChange('scrollSpeed', 'custom');
                  }}
                  min={20}
                  step={50}
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

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer pt-0.5">
              <input
                type="checkbox"
                checked={props.smooth !== false && props.scrollSpeed !== 'instant'}
                onChange={(e) => handlePropChange('smooth', e.target.checked)}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">Smooth scroll animation</span>
            </label>
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

        {/* Export Data Node (CSV, XLSX, JSON, TSV, HTML) */}
        {selectedNode.data.type === 'export_data' && (
          <div className="space-y-4 pt-2 border-t border-[#1c2230]">
            {/* Format Picker */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-2">
                Export File Format
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433]">
                {[
                  { id: 'csv', label: 'CSV', ext: '.csv', icon: '' },
                  { id: 'xlsx', label: 'Excel', ext: '.xlsx', icon: '' },
                  { id: 'json', label: 'JSON', ext: '.json', icon: '' },
                  { id: 'tsv', label: 'TSV', ext: '.tsv', icon: '' },
                  { id: 'html_table', label: 'HTML', ext: '.html', icon: '' },
                ].map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => handlePropChange('format', fmt.id)}
                    className={`py-2 px-2 text-center rounded-lg text-[11px] font-medium transition-all flex flex-col items-center gap-0.5 ${
                      (props.format || 'csv') === fmt.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                    }`}
                  >
                    <span>{fmt.icon} {fmt.label}</span>
                    <span className="text-[9px] opacity-75 font-mono">{fmt.ext}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Source Mode Segmented Tabs */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Data Source Mode
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433] text-[10px]">
                <button
                  type="button"
                  onClick={() => handlePropChange('sourceMode', 'variable')}
                  className={`py-1.5 px-1.5 text-center rounded-lg font-medium transition-all ${
                    (props.sourceMode || 'variable') === 'variable'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                  }`}
                >
                  From Variable
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange('sourceMode', 'multiple_variables')}
                  className={`py-1.5 px-1.5 text-center rounded-lg font-medium transition-all ${
                    props.sourceMode === 'multiple_variables'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                  }`}
                >
                  Zip Columns
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange('sourceMode', 'dom_elements')}
                  className={`py-1.5 px-1.5 text-center rounded-lg font-medium transition-all ${
                    props.sourceMode === 'dom_elements'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                  }`}
                >
                  DOM Elements
                </button>
              </div>
            </div>

            {/* Mode 1: Single Variable / Dataset */}
            {(props.sourceMode || 'variable') === 'variable' && (
              <div className="space-y-2 p-2.5 rounded-xl bg-[#0e121a] border border-[#1e2433]">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-300">Dataset Variable Name</label>
                  <span className="text-[10px] text-purple-400 font-mono">&#123;&#123;var&#125;&#125;</span>
                </div>
                <input
                  type="text"
                  value={props.datasetVariable || 'extractedList'}
                  onChange={(e) => handlePropChange('datasetVariable', e.target.value)}
                  placeholder="e.g. extractedList, crawledDataset, tableData"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
                />
                <p className="text-[10px] text-gray-400">
                  Export from any array or object variable collected by previous nodes (e.g. Extract Multiple, Auto-Crawler, Extract Table).
                </p>
              </div>
            )}

            {/* Mode 2: Multiple Variables as Zipped Columns */}
            {props.sourceMode === 'multiple_variables' && (
              <div className="space-y-2.5 p-2.5 rounded-xl bg-[#0e121a] border border-[#1e2433]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-300">Columns Mapping (Zipped by Row)</span>
                  <button
                    type="button"
                    onClick={() => {
                      const current = Array.isArray(props.columns) ? props.columns : [];
                      handlePropChange('columns', [...current, { header: `Column ${current.length + 1}`, value: '' }]);
                    }}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                  >
                    <Plus className="w-3 h-3" /> Add Column
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(Array.isArray(props.columns) && props.columns.length > 0 ? props.columns : [
                    { header: 'Title', value: '{{titles}}' },
                    { header: 'Price', value: '{{prices}}' },
                  ]).map((col: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-[#141924] p-2 rounded-lg border border-[#202738]">
                      <input
                        type="text"
                        value={col.header}
                        onChange={(e) => {
                          const updated = [...(props.columns || [])];
                          updated[idx] = { ...updated[idx], header: e.target.value };
                          handlePropChange('columns', updated);
                        }}
                        placeholder="Header"
                        className="w-1/3 bg-[#0d1017] text-white px-2 py-1 rounded border border-[#202738] outline-none text-[11px]"
                      />
                      <input
                        type="text"
                        value={col.value}
                        onChange={(e) => {
                          const updated = [...(props.columns || [])];
                          updated[idx] = { ...updated[idx], value: e.target.value };
                          handlePropChange('columns', updated);
                        }}
                        placeholder="{{variableList}}"
                        className="flex-1 bg-[#0d1017] text-white px-2 py-1 rounded border border-[#202738] outline-none text-[11px] font-mono text-purple-300"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (props.columns || []).filter((_: any, i: number) => i !== idx);
                          handlePropChange('columns', updated);
                        }}
                        className="text-gray-500 hover:text-red-400 p-1"
                        title="Delete column"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400">
                  Multiple array variables are aligned into rows automatically by row index.
                </p>
              </div>
            )}

            {/* Mode 3: Direct from Webpage DOM Elements */}
            {props.sourceMode === 'dom_elements' && (
              <div className="space-y-2.5 p-2.5 rounded-xl bg-[#0e121a] border border-[#1e2433]">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-gray-300">Container Selector (Optional)</label>
                    <span className="text-[10px] text-gray-500">e.g. .card, tr</span>
                  </div>
                  <input
                    type="text"
                    value={props.domContainerSelector || ''}
                    onChange={(e) => handlePropChange('domContainerSelector', e.target.value)}
                    placeholder="e.g. .product-item, .card, tr.row"
                    className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none font-mono text-xs"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-gray-300">Fields to Extract</span>
                  <button
                    type="button"
                    onClick={() => {
                      const current = Array.isArray(props.domFields) ? props.domFields : [];
                      handlePropChange('domFields', [...current, { name: `field_${current.length + 1}`, selector: '', attribute: '' }]);
                    }}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                  >
                    <Plus className="w-3 h-3" /> Add Field
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(Array.isArray(props.domFields) && props.domFields.length > 0 ? props.domFields : [
                    { name: 'title', selector: '.title', attribute: '' },
                    { name: 'url', selector: 'a', attribute: 'href' },
                  ]).map((field: any, idx: number) => (
                    <div key={idx} className="bg-[#141924] p-2 rounded-lg border border-[#202738] space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => {
                            const updated = [...(props.domFields || [])];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            handlePropChange('domFields', updated);
                          }}
                          placeholder="Field name"
                          className="w-1/3 bg-[#0d1017] text-white px-2 py-1 rounded border border-[#202738] outline-none text-[11px]"
                        />
                        <input
                          type="text"
                          value={field.selector}
                          onChange={(e) => {
                            const updated = [...(props.domFields || [])];
                            updated[idx] = { ...updated[idx], selector: e.target.value };
                            handlePropChange('domFields', updated);
                          }}
                          placeholder="CSS selector"
                          className="flex-1 bg-[#0d1017] text-white px-2 py-1 rounded border border-[#202738] outline-none text-[11px] font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (props.domFields || []).filter((_: any, i: number) => i !== idx);
                            handlePropChange('domFields', updated);
                          }}
                          className="text-gray-500 hover:text-red-400 p-1"
                          title="Delete field"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">Attribute:</span>
                        <select
                          value={field.attribute || ''}
                          onChange={(e) => {
                            const updated = [...(props.domFields || [])];
                            updated[idx] = { ...updated[idx], attribute: e.target.value };
                            handlePropChange('domFields', updated);
                          }}
                          className="flex-1 bg-[#0d1017] text-white px-2 py-1 rounded border border-[#202738] outline-none text-[10px]"
                        >
                          <option value="">Text Content (inner text)</option>
                          <option value="href">href (Link URL)</option>
                          <option value="src">src (Image/Media)</option>
                          <option value="value">value (Form input)</option>
                          <option value="title">title</option>
                          <option value="alt">alt</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filename & Output Settings */}
            <div className="space-y-3 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-400">Save Filename</label>
                  <span className="text-[10px] text-indigo-400 font-mono">
                    {(props.filename || 'collected_data').replace(/\.[a-zA-Z0-9]+$/, '')}.{props.format === 'xlsx' ? 'xlsx' : props.format === 'json' ? 'json' : props.format === 'tsv' ? 'tsv' : props.format === 'html_table' ? 'html' : 'csv'}
                  </span>
                </div>
                <input
                  type="text"
                  value={props.filename || 'collected_data'}
                  onChange={(e) => handlePropChange('filename', e.target.value)}
                  placeholder="e.g. scraped_leads_{{date}}"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>

              {/* CSV Delimiter (only for CSV) */}
              {(props.format === 'csv' || !props.format) && (
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">CSV Delimiter</label>
                  <select
                    value={props.csvDelimiter || ','}
                    onChange={(e) => handlePropChange('csvDelimiter', e.target.value)}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                  >
                    <option value=",">Comma (,) - Standard</option>
                    <option value=";">Semicolon (;) - European Excel</option>
                    <option value="&#9;">Tab (\t) - TSV</option>
                    <option value="|">Pipe (|)</option>
                  </select>
                </div>
              )}

              {/* Toggles */}
              <div className="space-y-2 pt-1 border-t border-[#1c2230]">
                <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={props.autoDownload !== false}
                    onChange={(e) => handlePropChange('autoDownload', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                  />
                  <span className="text-[11px]">Auto-download file to computer</span>
                </label>

                {props.autoDownload !== false && (
                  <label className="flex items-center gap-2 text-gray-400 cursor-pointer pl-5 text-[10px]">
                    <input
                      type="checkbox"
                      checked={!!props.saveAs}
                      onChange={(e) => handlePropChange('saveAs', e.target.checked)}
                      className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                    />
                    <span>Prompt for download location (Save As)</span>
                  </label>
                )}

                <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!props.copyToClipboard}
                    onChange={(e) => handlePropChange('copyToClipboard', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                  />
                  <span className="text-[11px]">Copy exported content to system clipboard</span>
                </label>

                {/* Exclude Empty Entries Toggle */}
                <div className="pt-2 border-t border-[#1c2230] space-y-1.5">
                  <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!props.excludeEmpty}
                      onChange={(e) => handlePropChange('excludeEmpty', e.target.checked)}
                      className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                    />
                    <span className="text-[11px] font-medium text-amber-300 flex items-center gap-1.5">
                      <span>Exclude:</span> Exclude entries with empty fields
                    </span>
                  </label>

                  {props.excludeEmpty && (
                    <div className="pl-5 space-y-1">
                      <select
                        value={props.filterEmptyMode || 'any'}
                        onChange={(e) => handlePropChange('filterEmptyMode', e.target.value)}
                        className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs outline-none"
                      >
                        <option value="any">Strict: Exclude row if ANY field is empty</option>
                        <option value="all">Lenient: Exclude row only if ALL fields are empty</option>
                      </select>
                      <p className="text-[10px] text-gray-500">
                        Filters out incomplete rows before generating CSV, Excel (.xlsx), JSON, or TSV.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
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

            {selectedNode.data.type === 'ai_agent' && (
              <>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Document Format</label>
                  <select
                    value={props.outputFormat || (props.jsonMode ? 'json' : 'text')}
                    onChange={(e) => {
                      const fmt = e.target.value;
                      handlePropChange('outputFormat', fmt);
                      if (fmt === 'json') {
                        handlePropChange('jsonMode', true);
                      }
                    }}
                    className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
                  >
                    <option value="normal">Normal Response (Raw Text Variable)</option>
                    <option value="text">Plain Text File (.txt)</option>
                    <option value="json">Structured JSON (.json)</option>
                    <option value="csv">CSV Spreadsheet (.csv)</option>
                    <option value="xlsx">Microsoft Excel (.xlsx)</option>
                    <option value="pdf">PDF Document (.pdf)</option>
                  </select>
                </div>

                {props.outputFormat && !['text', 'normal'].includes(props.outputFormat) && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-gray-400">Download Filename</label>
                      <span className="text-[10px] text-purple-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                    </div>
                    <input
                      type="text"
                      value={props.downloadFilename || 'ai_report'}
                      onChange={(e) => handlePropChange('downloadFilename', e.target.value)}
                      placeholder="e.g. ai_report_{{timestamp}}"
                      className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                    />
                  </div>
                )}

                <label className="flex items-center gap-2 text-gray-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={!!props.autoDownload}
                    onChange={(e) => handlePropChange('autoDownload', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                  />
                  <span className="text-[11px] flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-indigo-400" />
                    Auto-download file on completion
                  </span>
                </label>
              </>
            )}

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={!!props.jsonMode}
                onChange={(e) => {
                  handlePropChange('jsonMode', e.target.checked);
                  if (e.target.checked && (!props.outputFormat || props.outputFormat === 'text')) {
                    handlePropChange('outputFormat', 'json');
                  }
                }}
                className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
              />
              <span className="text-[11px]">JSON Mode (parse response into structured object)</span>
            </label>
          </div>
        )}

        {/* Condition Node (Clean single-comparison) */}
        {selectedNode.data.type === 'condition' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Left Value / Variable
              </label>
              <input
                type="text"
                value={props.leftValue || ''}
                onChange={(e) => handlePropChange('leftValue', e.target.value)}
                placeholder="{{price}}, {{status}}, or value"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Comparison Operator
              </label>
              <select
                value={props.operator || 'equals'}
                onChange={(e) => handlePropChange('operator', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="equals">equals (==)</option>
                <option value="not_equals">not equals (!=)</option>
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
                <option value="regex_matches">regex matches</option>
              </select>
            </div>

            {!['exists', 'does_not_exist', 'is_empty', 'is_not_empty'].includes(props.operator || '') && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Right Value
                </label>
                <input
                  type="text"
                  value={props.rightValue || ''}
                  onChange={(e) => handlePropChange('rightValue', e.target.value)}
                  placeholder="100, true, in stock..."
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            )}

            {['equals', 'not_equals', 'contains', 'does_not_contain'].includes(props.operator || 'equals') && (
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={props.caseSensitive === true}
                  onChange={(e) => handlePropChange('caseSensitive', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px]">Respect Casing (Case-sensitive)</span>
              </label>
            )}

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Output Variable (optional)
              </label>
              <input
                type="text"
                value={props.outputVariable || 'conditionResult'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="conditionResult"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* Logic Gate Nodes (AND, OR, NAND, NOR) */}
        {['and', 'or', 'nand', 'nor', 'logic_and', 'logic_or', 'logic_nand', 'logic_nor'].includes(selectedNode.data.type) && (() => {
          const rawType = String(selectedNode.data.type || '').toLowerCase();
          let currentGate = String(props.gate || '').toUpperCase();
          if (!currentGate) {
            if (rawType.includes('and') && !rawType.includes('nand')) currentGate = 'AND';
            else if (rawType.includes('nand')) currentGate = 'NAND';
            else if (rawType.includes('nor')) currentGate = 'NOR';
            else currentGate = 'OR';
          }

          const gateMeta: Record<string, { label: string; desc: string; color: string; badge: string }> = {
            AND: {
              label: 'AND Logic Gate',
              desc: 'Combines multiple incoming branches into 1 branch. Requires ALL connected branches to evaluate to TRUE / complete before proceeding.',
              color: 'text-emerald-300 border-emerald-500/50 bg-emerald-500/10',
              badge: 'bg-emerald-600',
            },
            OR: {
              label: 'OR Logic Gate',
              desc: 'Combines multiple incoming branches into 1 branch. Continues as soon as ANY connected branch is TRUE / completes (race condition / fallback).',
              color: 'text-purple-300 border-purple-500/50 bg-purple-500/10',
              badge: 'bg-purple-600',
            },
            NAND: {
              label: 'NAND Logic Gate',
              desc: 'Negated AND: Combines multiple incoming branches into 1 branch. Continues unless ALL connected branches are TRUE.',
              color: 'text-rose-300 border-rose-500/50 bg-rose-500/10',
              badge: 'bg-rose-600',
            },
            NOR: {
              label: 'NOR Logic Gate',
              desc: 'Negated OR: Combines multiple incoming branches into 1 branch. Continues only when ALL connected branches are FALSE.',
              color: 'text-amber-300 border-amber-500/50 bg-amber-500/10',
              badge: 'bg-amber-600',
            },
          };

          const meta = gateMeta[currentGate] || gateMeta.AND;

          return (
            <div className="space-y-4">
              {/* Gate Switcher */}
              <div>
                <label className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider block mb-1.5">
                  Logic Gate Type
                </label>
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433]">
                  {(['AND', 'OR', 'NAND', 'NOR'] as const).map((g) => {
                    const isSel = currentGate === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          handlePropChange('gate', g);
                          handlePropChange('outputVariable', `${g.toLowerCase()}Result`);
                        }}
                        className={`py-1.5 text-center rounded-lg text-xs font-mono font-bold transition-all border ${
                          isSel
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                            : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-[#151a26]'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Combining Explanation Banner */}
              <div className={`p-3 rounded-xl border ${meta.color} space-y-1.5`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${meta.badge} animate-pulse`} />
                  <span className="font-bold text-xs text-white">{meta.label}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-gray-300">
                  {meta.desc}
                </p>
              </div>

              {/* Visual Branch Combiner Diagram */}
              <div className="p-3 bg-[#0e1118] rounded-xl border border-[#1c2230] space-y-2">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
                  Branch Combining Mode
                </label>
                <div className="flex items-center justify-between text-[11px] bg-[#141824] p-2.5 rounded-lg border border-[#232b40]">
                  <span className="text-gray-300 font-mono">Multiple Branches In</span>
                  <span className="text-indigo-400 font-bold font-mono">&#8594; 1 Combined Out</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-normal">
                  Connect multiple nodes (Wait, Webpage checks, Conditions) to the top handle of this node. Their branches will be merged according to {currentGate} logic into a single combined outgoing branch.
                </p>
              </div>

              {/* Output Variable */}
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Output Variable (stores TRUE / FALSE)
                </label>
                <input
                  type="text"
                  value={props.outputVariable || `${currentGate.toLowerCase()}Result`}
                  onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                  placeholder={`${currentGate.toLowerCase()}Result`}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            </div>
          );
        })()}

        {/* Stop Timer Command Node */}
        {selectedNode.data.type === 'stop_timer' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Stop Timer Command</span>
              </label>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono">
                Active Wait Killer
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Target Wait Timer</label>
              <select
                value={props.targetTimer || 'all'}
                onChange={(e) => handlePropChange('targetTimer', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="all">All Active Wait Timers</option>
                {(allNodes || [])
                  .filter((n) => n && n.data && n.data.type === 'wait' && n.id !== selectedNode.id)
                  .map((n) => (
                    <option key={n.id} value={n.data.properties?.timerName || n.id}>
                      ⏳ {n.data.label || 'Wait'} {n.data.properties?.timerName ? `[${n.data.properties.timerName}]` : `(${(n.id || '').slice(0, 8)})`}
                    </option>
                  ))}
              </select>
            </div>

            {props.targetTimer !== 'all' && (
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">Or Custom Timer Name</label>
                <input
                  type="text"
                  value={props.targetTimer || ''}
                  onChange={(e) => handlePropChange('targetTimer', e.target.value)}
                  placeholder="e.g. loginWait, myTimer"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Action on Target Timer</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePropChange('action', 'complete_early')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border text-left transition-colors ${
                    (props.action || 'complete_early') === 'complete_early'
                      ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50 font-semibold'
                      : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                  }`}
                >
                  <div className="font-semibold text-[11px]">Finish Early</div>
                  <div className="text-[9px] text-gray-400">Proceeds downstream</div>
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange('action', 'cancel')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border text-left transition-colors ${
                    props.action === 'cancel'
                      ? 'bg-rose-600/20 text-rose-300 border-rose-500/50 font-semibold'
                      : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                  }`}
                >
                  <div className="font-semibold text-[11px]">Cancel Branch</div>
                  <div className="text-[9px] text-gray-400">Stops waiting branch</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Reason / Note (for logs)</label>
              <input
                type="text"
                value={props.reason || ''}
                onChange={(e) => handlePropChange('reason', e.target.value)}
                placeholder="Condition matched, stopping wait"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable (boolean)</label>
              <input
                type="text"
                value={props.outputVariable || 'timerStopped'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="timerStopped"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* Reset Timer Command Node */}
        {selectedNode.data.type === 'reset_timer' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Reset Timer Command</span>
              </label>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                Timer Controller
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Target Wait Timer</label>
              <select
                value={props.targetTimer || 'all'}
                onChange={(e) => handlePropChange('targetTimer', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="all">All Active Wait Timers</option>
                {(allNodes || [])
                  .filter((n) => n && n.data && n.data.type === 'wait' && n.id !== selectedNode.id)
                  .map((n) => (
                    <option key={n.id} value={n.data.properties?.timerName || n.id}>
                      ⏳ {n.data.label || 'Wait'} {n.data.properties?.timerName ? `[${n.data.properties.timerName}]` : `(${(n.id || '').slice(0, 8)})`}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Reset Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePropChange('mode', 'restart')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border text-center transition-colors ${
                    (props.mode || 'restart') === 'restart'
                      ? 'bg-amber-600/20 text-amber-300 border-amber-500/50 font-semibold'
                      : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                  }`}
                >
                  Restart from 0s
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange('mode', 'extend')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border text-center transition-colors ${
                    props.mode === 'extend'
                      ? 'bg-amber-600/20 text-amber-300 border-amber-500/50 font-semibold'
                      : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                  }`}
                >
                  Extend Duration
                </button>
              </div>
            </div>

            {props.mode === 'extend' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Extend By (ms)</label>
                <input
                  type="number"
                  value={props.extendMs || 5000}
                  onChange={(e) => handlePropChange('extendMs', Number(e.target.value))}
                  min={500}
                  step={500}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
                />
              </div>
            )}
          </div>
        )}

        {/* Stop Workflow Command Node */}
        {selectedNode.data.type === 'stop_workflow' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
                Exit Workflow Command
              </label>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono">
                Clean Exit
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Exit Status</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePropChange('exitStatus', 'completed')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                    (props.exitStatus || 'completed') === 'completed'
                      ? 'bg-emerald-600/25 text-emerald-300 border-emerald-500/50 font-semibold'
                      : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                  }`}
                >
                  Completed (Success)
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange('exitStatus', 'stopped')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                    props.exitStatus === 'stopped'
                      ? 'bg-rose-600/25 text-rose-300 border-rose-500/50 font-semibold'
                      : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                  }`}
                >
                  Stopped (Early Exit)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Exit Message</label>
              <input
                type="text"
                value={props.exitMessage || ''}
                onChange={(e) => handlePropChange('exitMessage', e.target.value)}
                placeholder="Workflow ended early (e.g. item already booked)"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              />
            </div>
          </div>
        )}

        {/* Pause Workflow Command Node */}
        {selectedNode.data.type === 'pause_workflow' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-yellow-400 uppercase tracking-wider">
                Pause Workflow Command
              </label>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-mono">
                Human Checkpoint
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Pause Prompt Message</label>
              <textarea
                rows={2}
                value={props.message || ''}
                onChange={(e) => handlePropChange('message', e.target.value)}
                placeholder="Workflow paused. Solve captcha or review page, then click Resume."
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Auto-Resume Timeout (optional, ms)</label>
              <input
                type="number"
                value={props.autoResumeMs || 0}
                onChange={(e) => handlePropChange('autoResumeMs', Number(e.target.value))}
                min={0}
                step={1000}
                placeholder="0 = wait indefinitely until user resumes"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              />
              <p className="text-[10px] text-gray-500 mt-1">Leave 0 to wait until user clicks Resume button.</p>
            </div>
          </div>
        )}

        {/* Skip to Node Command Node */}
        {selectedNode.data.type === 'skip_to' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
                Skip to Node Command
              </label>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                Jump Execution
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Target Node to Jump To</label>
              <select
                value={props.targetNodeId || ''}
                onChange={(e) => handlePropChange('targetNodeId', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="">Select target node...</option>
                {(allNodes || [])
                  .filter((n) => n && n.id && n.id !== selectedNode.id)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.data?.label || 'Node'} ({n.data?.type || 'custom'} - {(n.id || '').slice(0, 8)})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Reason / Note (optional)</label>
              <input
                type="text"
                value={props.reason || ''}
                onChange={(e) => handlePropChange('reason', e.target.value)}
                placeholder="Skipping checkout since user not logged in"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              />
            </div>
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

        {/* Regex Node */}
        {selectedNode.data.type === 'regex' && (
          <div className="space-y-3 pt-2 border-t border-[#1c2230]">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Input Text / Variable</label>
              <input
                type="text"
                value={props.text || ''}
                onChange={(e) => handlePropChange('text', e.target.value)}
                placeholder="{{extractedText}} or raw text"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-[11px]"
              />
              <p className="text-[10px] text-gray-500 mt-0.5">
                Text to run the regex against. Supports &#123;&#123;variable&#125;&#125; interpolation.
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Regex Pattern</label>
              <input
                type="text"
                value={props.pattern || ''}
                onChange={(e) => handlePropChange('pattern', e.target.value)}
                placeholder="e.g. \\d+\\.\\d{2} or (https?://[^\\s]+)"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-[11px]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Flags</label>
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'g', label: 'g (global)' },
                  { id: 'gi', label: 'gi (global, case-insensitive)' },
                  { id: 'gm', label: 'gm (global, multiline)' },
                  { id: 'gmi', label: 'gmi (all)' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handlePropChange('flags', f.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all ${
                      (props.flags || 'g') === f.id
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'bg-[#11141c] text-gray-400 hover:text-gray-200 border border-[#1c2230]'
                    }`}
                  >
                    {f.id}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Extract</label>
              <select
                value={props.extractGroup ?? 'full'}
                onChange={(e) => handlePropChange('extractGroup', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="full">Full Match (match[0])</option>
                <option value="1">Capture Group 1 (match[1])</option>
                <option value="2">Capture Group 2 (match[2])</option>
                <option value="3">Capture Group 3 (match[3])</option>
              </select>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Use capture groups with parentheses in your pattern, e.g. <code className="text-indigo-400">(\d+)</code>
              </p>
            </div>
          </div>
        )}

        {/* Transform Node */}
        {selectedNode.data.type === 'transform' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Input Text or Object</label>
              <input
                type="text"
                value={props.input || ''}
                onChange={(e) => handlePropChange('input', e.target.value)}
                placeholder="e.g. {{currentProduct}}, {{title}}, {{scrapedProducts}}"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Operation</label>
              <select
                value={props.operation || 'trim'}
                onChange={(e) => handlePropChange('operation', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="extractField">Extract Property / Field (e.g. link, title, price)</option>
                <option value="normalizeUrl">Normalize URL (Prepend Base / Strip Tracking)</option>
                <option value="cleanPrice">Clean Price / Extract Number</option>
                <option value="formatDate">Format Date / Relative Time</option>
                <option value="trim">Trim Whitespace</option>
                <option value="lowercase">To Lowercase</option>
                <option value="uppercase">To Uppercase</option>
                <option value="replace">Replace Text</option>
                <option value="substring">Substring (Slice)</option>
                <option value="split">Split to Array</option>
                <option value="join">Join Array to String</option>
                <option value="parseNumber">Extract / Parse Number</option>
                <option value="parseJSON">Parse JSON String</option>
              </select>
            </div>
            {props.operation === 'extractField' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Field / Property Name</label>
                <input
                  type="text"
                  value={props.field || ''}
                  onChange={(e) => handlePropChange('field', e.target.value)}
                  placeholder="e.g. link, title, price, image"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Extracts a specific property from an object or JSON string (e.g. from &#123;&#123;currentProduct&#125;&#125;).
                </p>
              </div>
            )}
            {props.operation === 'normalizeUrl' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Base URL Prefix</label>
                  <input
                    type="text"
                    value={props.basePrefix || ''}
                    onChange={(e) => handlePropChange('basePrefix', e.target.value)}
                    placeholder="e.g. https://www.amazon.in"
                    className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
                <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={props.stripQueryParams !== false}
                    onChange={(e) => handlePropChange('stripQueryParams', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                  />
                  <span className="text-[10px]">Strip tracking query parameters (?ref=..., utm_*)</span>
                </label>
              </div>
            )}
            {props.operation === 'cleanPrice' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Price Mode</label>
                <select
                  value={props.priceMode || 'number_only'}
                  onChange={(e) => handlePropChange('priceMode', e.target.value)}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
                >
                  <option value="number_only">Number only (e.g. "$1,299.99" &#8594; "1299.99")</option>
                  <option value="strip_symbols">Strip currency symbols (e.g. "$1,299.99" &#8594; "1,299.99")</option>
                </select>
              </div>
            )}
            {props.operation === 'formatDate' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Date Format Mode</label>
                <select
                  value={props.dateMode || 'iso_date'}
                  onChange={(e) => handlePropChange('dateMode', e.target.value)}
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
                >
                  <option value="iso_date">ISO Date (YYYY-MM-DD)</option>
                  <option value="iso_datetime">ISO DateTime (YYYY-MM-DDTHH:mm:ssZ)</option>
                  <option value="timestamp">Timestamp (ms)</option>
                </select>
              </div>
            )}
            {props.operation === 'replace' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Search</label>
                  <input
                    type="text"
                    value={props.search || ''}
                    onChange={(e) => handlePropChange('search', e.target.value)}
                    placeholder="Search string"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Replace With</label>
                  <input
                    type="text"
                    value={props.replaceWith || ''}
                    onChange={(e) => handlePropChange('replaceWith', e.target.value)}
                    placeholder="Replacement"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
              </div>
            )}
            {props.operation === 'substring' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Start Index</label>
                  <input
                    type="number"
                    value={props.start ?? 0}
                    onChange={(e) => handlePropChange('start', Number(e.target.value))}
                    min={0}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Length</label>
                  <input
                    type="number"
                    value={props.length ?? ''}
                    onChange={(e) => handlePropChange('length', e.target.value === '' ? undefined : Number(e.target.value))}
                    min={1}
                    placeholder="all"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
              </div>
            )}
            {(props.operation === 'split' || props.operation === 'join') && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Delimiter</label>
                <input
                  type="text"
                  value={props.delimiter ?? (props.operation === 'split' ? ',' : ', ')}
                  onChange={(e) => handlePropChange('delimiter', e.target.value)}
                  placeholder="Delimiter string"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            )}
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
                    ? 'Captured page screenshot: {{pageTitle}}'
                    : 'Alert: New item found!&#10;Title: {{extractedTitle}}&#10;Link: {{pageUrl}}'
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
                  placeholder="AutoFlow Job Notification"
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
        {['navigate', 'click', 'type_text', 'wait_for_element', 'wait_for_text', 'wait_for_navigation', 'extract_text', 'contains', 'contains_text'].includes(selectedNode.data.type) && (
          <div className="pt-2 border-t border-[#1c2230]">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-400">Timeout (ms)</label>
              <span className="text-[10px] text-gray-500">Max wait limit</span>
            </div>
            <input
              type="number"
              value={props.timeout ?? (selectedNode.data.type === 'contains_text' ? 3000 : 10000)}
              onChange={(e) => handlePropChange('timeout', Number(e.target.value))}
              min={500}
              step={1000}
              className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
            />
            <div className="flex items-center gap-1.5 mt-2">
              {[2000, 5000, 10000, 15000, 30000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePropChange('timeout', preset)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    (props.timeout ?? (selectedNode.data.type === 'contains_text' ? 3000 : 10000)) === preset
                      ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                      : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                  }`}
                >
                  {preset / 1000}s
                </button>
              ))}
            </div>
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
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-rose-400 font-semibold">Error:</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(runtimeState.error || '');
                      setCopiedNodeError(true);
                      setTimeout(() => setCopiedNodeError(false), 2000);
                    }}
                    className="flex items-center gap-1 text-[10px] text-rose-300 hover:text-rose-100 bg-rose-950/40 hover:bg-rose-900/50 px-1.5 py-0.5 rounded border border-rose-800/40 transition-colors"
                  >
                    {copiedNodeError ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedNodeError ? 'Copied!' : 'Copy Error'}</span>
                  </button>
                </div>
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
