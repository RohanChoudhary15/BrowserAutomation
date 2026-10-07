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
  Save,
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
  Flame,
  Loader2,
  Zap,
  Archive,
  Database,
  Filter,
  GitFork,
  Palette,
  HardDrive,
  Compass,
  Link2,
  Calendar,
  Cookie,
  ListOrdered,
  FileCode,
  Braces,
  RotateCcw,
  Gauge,
  UserCheck,
  PlaySquare,
  Camera,
  Briefcase,
  ShoppingCart,
  AtSign,
  Search,
  Upload,
  X,
  ChevronLeft,
  ExternalLink,
  Repeat,
  GripVertical,
  Radio,
  Scissors,
  Type,
  Hash,
  SlidersHorizontal,
  Wand2,
} from 'lucide-react';
import { PDF_THEMES, PdfThemeId } from '../../utils/pdfGenerator';
import { fetchAvailableModels, queryLlm } from '../../ai/aiService';
import { generateSchemaFromElement } from '../../ai/schemaGenerator';
import { formatRuleDescription, ConditionRule, ConditionType } from '../../runtime/evaluator';
import { ModelOption, AiProvider } from '../../ai/types';
import { BotCredentialsModal } from '../modals/BotCredentialsModal';
import {
  getCredentialsByPlatform,
  saveCredential,
  BotCredential,
  MessagingPlatform,
} from '../../storage/credentialStore';
import { ScraperPropertiesPanel } from './scrapers/ScraperPropertiesPanel';
import { DataNodesProperties } from './sections/DataNodesProperties';
import { ControlFlowProperties } from './sections/ControlFlowProperties';
import { TransformProperties } from './sections/TransformProperties';
import { JsonSchemaSection } from './sections/JsonSchemaSection';
import { VideoGeneratorProperties } from './sections/VideoGeneratorProperties';
import { TableModal } from './TableModal';
import {
  getAllCardSchemas,
  saveCardSchema,
  deleteCardSchema,
  exportCardSchemasAsJson,
  importCardSchemasFromJson,
  CardSchemaPreset,
} from '../../storage/cardSchemaStore';
import { exportAndDownloadDataset } from '../../utils/documentExporter';
import { importDatasetFile } from '../../utils/datasetImporter';
import { applyStringOperation } from '../../utils/stringTransform';

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
  onStartElementPicker: (mode?: 'single' | 'pattern_2click', context?: string, fieldIndex?: number) => void;
  onGenerateSchema?: (nodeId: string) => Promise<void>;
  isPickingElement: boolean;
  isGeneratingSchema?: boolean;
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
  onGenerateSchema,
  isPickingElement,
  isGeneratingSchema = false,
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
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState<string | null>(null);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState<number>(0);

  const handleDownloadImage = async (url: string, suggestedFilename?: string) => {
    try {
      const filename = suggestedFilename || 'generated_image.png';
      const finalFilename = filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.webp')
        ? filename
        : `${filename}.png`;

      if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
        await new Promise<number | undefined>((resolve, reject) => {
          chrome.downloads.download(
            {
              url,
              filename: finalFilename,
              saveAs: true,
            },
            (downloadId) => {
              if (chrome.runtime?.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(downloadId);
              }
            }
          );
        });
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = finalFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      console.warn('Download image failed:', err);
    }
  };

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
    if (['telegram_message', 'telegram_watch', 'discord_message', 'discord_watch', 'slack_message', 'slack_watch'].includes(selectedNode?.data.type || '')) {
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
    if (
      selectedNode?.data.type === 'ai_agent' ||
      selectedNode?.data.type === 'autonomous_agent' ||
      selectedNode?.data.type === 'generate_pdf'
    ) {
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
  const [showImageApiKey, setShowImageApiKey] = useState(false);
  const [showFirecrawlApiKey, setShowFirecrawlApiKey] = useState(false);
  const [copiedFirecrawlMarkdown, setCopiedFirecrawlMarkdown] = useState(false);
  const [aiStoragePrompt, setAiStoragePrompt] = useState('');
  const [aiStorageLoading, setAiStorageLoading] = useState(false);
  const [aiStorageError, setAiStorageError] = useState<string | null>(null);

  // Saved Card Schemas State (Product Cards & Parent Div / Container Presets)
  const [cardSchemas, setCardSchemas] = useState<CardSchemaPreset[]>([]);
  const [selectedCardSchemaId, setSelectedCardSchemaId] = useState<string>('');
  const [isSavingCardSchema, setIsSavingCardSchema] = useState(false);
  const [cardSchemaNameInput, setCardSchemaNameInput] = useState('');
  const [cardSchemaSaveFeedback, setCardSchemaSaveFeedback] = useState<string | null>(null);
  const [isScrapeTableModalOpen, setIsScrapeTableModalOpen] = useState(false);
  const [isExportingCards, setIsExportingCards] = useState(false);

  const loadCardSchemasList = async () => {
    try {
      const schemas = await getAllCardSchemas();
      setCardSchemas(schemas);
    } catch (e) {
      console.warn('Failed to load card schemas:', e);
    }
  };

  useEffect(() => {
    if (selectedNode?.data?.type === 'scrape_elements') {
      loadCardSchemasList();
    }
  }, [selectedNode?.id, selectedNode?.data?.type]);

  const extractedCardsData = React.useMemo(() => {
    if (selectedNode?.data?.type !== 'scrape_elements') return [];
    if (Array.isArray(selectedNode?.data?.properties?.importedItems) && selectedNode.data.properties.importedItems.length > 0) {
      return selectedNode.data.properties.importedItems;
    }
    const dynItems = runtimeState?.dynamicState?.items || runtimeState?.dynamicState?.table?.rows;
    if (Array.isArray(dynItems) && dynItems.length > 0) return dynItems;
    if (Array.isArray(runtimeState?.output) && runtimeState.output.length > 0) return runtimeState.output;
    if (runtimeState?.output && Array.isArray(runtimeState.output.items) && runtimeState.output.items.length > 0) {
      return runtimeState.output.items;
    }
    const outVar = selectedNode?.data?.properties?.outputVariable || 'scrapedProducts';
    if (Array.isArray(variables[outVar]) && variables[outVar].length > 0) return variables[outVar];
    if (variables[`${outVar}_table`]?.rows && Array.isArray(variables[`${outVar}_table`].rows)) {
      return variables[`${outVar}_table`].rows;
    }
    return [];
  }, [selectedNode?.data?.type, selectedNode?.data?.properties?.importedItems, selectedNode?.data?.properties?.outputVariable, runtimeState, variables]);

  // Memoized array of images for the currently selected node
  const activeNodeImages = React.useMemo<string[]>(() => {
    if (!selectedNode) return [];
    const nodeStateOutput = runtimeState?.output;
    const nodeDynamic = runtimeState?.dynamicState;
    const isThisNodeSuccess = runtimeState?.status === 'success';
    const nodeProps = selectedNode.data.properties || {};

    if (Array.isArray(nodeStateOutput) && nodeStateOutput.length > 0) {
      const arr = nodeStateOutput.filter((u): u is string => typeof u === 'string' && u.length > 0);
      if (arr.length > 0) return arr;
    }
    if (Array.isArray(nodeDynamic?.images) && nodeDynamic.images.length > 0) {
      const arr = nodeDynamic.images.filter((u): u is string => typeof u === 'string' && u.length > 0);
      if (arr.length > 0) return arr;
    }
    if (typeof nodeStateOutput === 'string' && (nodeStateOutput.startsWith('http') || nodeStateOutput.startsWith('data:image'))) {
      return [nodeStateOutput];
    }
    if (typeof nodeDynamic?.previewUrl === 'string' && (nodeDynamic.previewUrl.startsWith('http') || nodeDynamic.previewUrl.startsWith('data:image'))) {
      return [nodeDynamic.previewUrl];
    }
    if (isThisNodeSuccess && nodeProps.outputVariable) {
      const varImages = variables[`${nodeProps.outputVariable}_images`];
      if (Array.isArray(varImages) && varImages.length > 0) {
        const arr = varImages.filter((u): u is string => typeof u === 'string' && u.length > 0);
        if (arr.length > 0) return arr;
      }
      const singleVar = variables[nodeProps.outputVariable];
      if (typeof singleVar === 'string' && (singleVar.startsWith('http') || singleVar.startsWith('data:image'))) {
        return [singleVar];
      }
    }
    return [];
  }, [selectedNode?.id, runtimeState?.output, runtimeState?.dynamicState, runtimeState?.status, variables]);

  const modalImages = activeNodeImages.length > 0
    ? activeNodeImages
    : (fullScreenImageUrl ? [fullScreenImageUrl] : []);

  const handlePrevFullScreenImage = () => {
    if (modalImages.length <= 1) return;
    const prevIdx = (fullScreenImageIndex - 1 + modalImages.length) % modalImages.length;
    setFullScreenImageIndex(prevIdx);
    setFullScreenImageUrl(modalImages[prevIdx]);
  };

  const handleNextFullScreenImage = () => {
    if (modalImages.length <= 1) return;
    const nextIdx = (fullScreenImageIndex + 1) % modalImages.length;
    setFullScreenImageIndex(nextIdx);
    setFullScreenImageUrl(modalImages[nextIdx]);
  };

  useEffect(() => {
    if (!fullScreenImageUrl) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullScreenImageUrl(null);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (modalImages.length > 1) {
          const prevIdx = (fullScreenImageIndex - 1 + modalImages.length) % modalImages.length;
          setFullScreenImageIndex(prevIdx);
          setFullScreenImageUrl(modalImages[prevIdx]);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (modalImages.length > 1) {
          const nextIdx = (fullScreenImageIndex + 1) % modalImages.length;
          setFullScreenImageIndex(nextIdx);
          setFullScreenImageUrl(modalImages[nextIdx]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullScreenImageUrl, fullScreenImageIndex, modalImages]);

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

  const handlePropsChange = (updates: Record<string, any>) => {
    onUpdateProperties(selectedNode.id, {
      ...props,
      ...updates,
    });
  };

  const handleApplyCardSchema = (schema: CardSchemaPreset) => {
    setSelectedCardSchemaId(schema.id);
    handlePropChange('containerSelector', schema.containerSelector);
    if (Array.isArray(schema.fields) && schema.fields.length > 0) {
      handlePropChange('fields', JSON.parse(JSON.stringify(schema.fields)));
    }
    setCardSchemaSaveFeedback(`Applied "${schema.name}" preset`);
    setTimeout(() => setCardSchemaSaveFeedback(null), 2500);
  };

  const handleSaveCurrentCardSchema = async () => {
    const name = cardSchemaNameInput.trim();
    if (!name) {
      setCardSchemaSaveFeedback('Please enter a schema name');
      setTimeout(() => setCardSchemaSaveFeedback(null), 3000);
      return;
    }
    const container = (props.containerSelector || '').trim();
    if (!container) {
      setCardSchemaSaveFeedback('Container selector (parent div) is required');
      setTimeout(() => setCardSchemaSaveFeedback(null), 3000);
      return;
    }
    const fields = Array.isArray(props.fields) ? props.fields : [];
    try {
      const saved = await saveCardSchema({
        name,
        containerSelector: container,
        fields,
        category: 'custom',
        description: `Custom schema with parent: ${container} (${fields.length} fields)`,
      });
      await loadCardSchemasList();
      setSelectedCardSchemaId(saved.id);
      setCardSchemaSaveFeedback(`Schema "${saved.name}" saved!`);
      setIsSavingCardSchema(false);
      setCardSchemaNameInput('');
      setTimeout(() => setCardSchemaSaveFeedback(null), 3500);
    } catch (err: any) {
      setCardSchemaSaveFeedback(err?.message || 'Error saving schema');
      setTimeout(() => setCardSchemaSaveFeedback(null), 3500);
    }
  };

  const handleDeleteCardSchemaItem = async (schemaId: string) => {
    const target = cardSchemas.find((s) => s.id === schemaId);
    if (!target || target.isBuiltIn) return;
    if (window.confirm(`Delete saved schema "${target.name}"?`)) {
      await deleteCardSchema(schemaId);
      await loadCardSchemasList();
      if (selectedCardSchemaId === schemaId) {
        setSelectedCardSchemaId('');
      }
      setCardSchemaSaveFeedback(`Deleted "${target.name}"`);
      setTimeout(() => setCardSchemaSaveFeedback(null), 2500);
    }
  };

  const handleExportSchemasFile = async () => {
    try {
      const json = await exportCardSchemasAsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `card_schemas_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Failed to export schemas:', e);
    }
  };

  const handleImportSchemasFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        await importCardSchemasFromJson(text);
        await loadCardSchemasList();
        setCardSchemaSaveFeedback('Schemas imported successfully!');
        setTimeout(() => setCardSchemaSaveFeedback(null), 3000);
      } catch (err: any) {
        setCardSchemaSaveFeedback(err?.message || 'Import error');
        setTimeout(() => setCardSchemaSaveFeedback(null), 3500);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportCardsDataset = async (format: 'csv' | 'xlsx' | 'json') => {
    if (!extractedCardsData || extractedCardsData.length === 0) return;
    setIsExportingCards(true);
    try {
      const filename = props.exportFilename || props.outputVariable || 'scraped_products';
      await exportAndDownloadDataset(extractedCardsData, format, filename);
    } catch (err) {
      console.warn('Export cards error:', err);
    } finally {
      setIsExportingCards(false);
    }
  };

  const propertiesScrapeFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleImportCardsDataset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await importDatasetFile(file);
      handlePropChange('importedItems', parsed.rows);
      handlePropChange('importedHeaders', parsed.headers);
      handlePropChange('importedFilename', parsed.filename);
      handlePropChange('useImportedData', true);
    } catch (err: any) {
      console.warn('Import cards error:', err);
    } finally {
      if (propertiesScrapeFileInputRef.current) propertiesScrapeFileInputRef.current.value = '';
    }
  };

  const renderScraperExecutionConfig = (accentBorder: string = 'border-orange-500') => (
    <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-200 select-none">
          <input
            type="checkbox"
            checked={!!props.headless}
            onChange={(e) => handlePropChange('headless', e.target.checked)}
            className="rounded border-[#232a3b] bg-[#161a24] text-orange-500 focus:ring-0 w-3.5 h-3.5"
          />
          <span className="font-medium">Headless Mode</span>
        </label>
        <span className="text-[10px] font-mono text-purple-400 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-500/30">
          Background Tab
        </span>
      </div>
      <p className="text-[10px] text-gray-500 leading-tight">
        Launches extraction in a dedicated background tab without stealing window focus.
      </p>

      <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 select-none pt-1 border-t border-[#1c2230]">
        <input
          type="checkbox"
          checked={props.autoCloseTab !== false}
          onChange={(e) => handlePropChange('autoCloseTab', e.target.checked)}
          className="rounded border-[#232a3b] bg-[#161a24] text-orange-500 focus:ring-0 w-3.5 h-3.5"
        />
        <span className="text-[11px] text-gray-400">Auto-close tab when extraction finishes</span>
      </label>
    </div>
  );

  const [isLocalGeneratingSchema, setIsLocalGeneratingSchema] = useState(false);
  const effectiveGeneratingSchema = isGeneratingSchema || isLocalGeneratingSchema;

  const handleGenerateAiSchema = async () => {
    if (!selectedNode) return;
    if (onGenerateSchema) {
      await onGenerateSchema(selectedNode.id);
      return;
    }

    setIsLocalGeneratingSchema(true);
    try {
      let htmlSnippet = props.cardHtmlSnippet || '';
      const textSnippet = props.cardTextSnippet || '';
      const tagName = props.cardTagName || '';
      let containerSelector = props.containerSelector || '';

      // If no card snippet was stored, attempt to extract live from active tab
      if (!htmlSnippet && containerSelector && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          const res = await chrome.runtime.sendMessage({
            type: 'EXECUTE_DOM_ACTION',
            payload: {
              action: 'extract_html',
              params: { selector: containerSelector, mode: 'outer' },
            },
          });
          if (res && res.success && res.html) {
            htmlSnippet = res.html;
          }
        } catch {}
      }

      // If no container and no snippet, prompt or launch element picker
      if (!htmlSnippet && !containerSelector) {
        onStartElementPicker('single', 'card_container');
        return;
      }

      const generated = await generateSchemaFromElement({
        selector: containerSelector,
        tagName,
        htmlSnippet,
        textSnippet,
      });

      if (generated && generated.fields && generated.fields.length > 0) {
        onUpdateProperties(selectedNode.id, {
          ...props,
          containerSelector: generated.containerSelector || containerSelector,
          fields: generated.fields,
          ...(htmlSnippet ? { cardHtmlSnippet: htmlSnippet } : {}),
        });
      }
    } catch (err: any) {
      console.error('Error generating schema:', err);
      alert(`AI Schema generation error: ${err.message || String(err)}`);
    } finally {
      setIsLocalGeneratingSchema(false);
    }
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
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Wait Duration / Timer</label>
                <div className="flex items-center gap-1 bg-[#0b0e14] p-0.5 rounded border border-[#1e2433] text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Number(props.duration ?? props.timeout ?? 1000);
                      if (props.unit === 's') {
                        handlePropsChange({
                          unit: 'ms',
                          duration: cur * 1000,
                          timeout: cur * 1000,
                        });
                      } else {
                        handlePropsChange({ unit: 'ms' });
                      }
                    }}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                      (props.unit || 'ms') === 'ms'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    ms
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Number(props.duration ?? props.timeout ?? 1000);
                      if ((props.unit || 'ms') === 'ms' && cur >= 1000) {
                        handlePropsChange({
                          unit: 's',
                          duration: cur / 1000,
                          timeout: cur / 1000,
                        });
                      } else {
                        handlePropsChange({ unit: 's' });
                      }
                    }}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                      props.unit === 's'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    seconds (s)
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={props.duration !== undefined ? props.duration : (props.timeout !== undefined ? props.timeout : 1000)}
                onChange={(e) => {
                  const raw = e.target.value;
                  const num = Number(raw);
                  const val = !isNaN(num) && raw.trim() !== '' ? num : raw;
                  handlePropsChange({ duration: val, timeout: val });
                }}
                placeholder={props.unit === 's' ? 'e.g. 2 or {{delay}}' : 'e.g. 2000 or {{delay}}'}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
              />
              <div className="flex items-center gap-1.5 mt-2">
                {(props.unit === 's' ? [0.5, 1, 2, 5, 10] : [500, 1000, 2000, 5000, 10000]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      handlePropsChange({ duration: preset, timeout: preset });
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                      Number(props.duration ?? props.timeout ?? 1000) === preset
                        ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                        : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                    }`}
                  >
                    {props.unit === 's' ? `${preset}s` : preset >= 1000 ? `${preset / 1000}s` : `${preset}ms`}
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
                            onClick={() => onStartElementPicker('single', 'stopCondition')}
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
                          onClick={() => onStartElementPicker('single', 'stopCondition')}
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
                            <option value="starts_with">starts with</option>
                            <option value="ends_with">ends with</option>
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

        {/* Output Variable (Extract Text, Attribute, Table, Screenshot, JS, Data, Storage, AI, Image, Firecrawl, New Nodes) */}
        {['extract_text', 'extract_attribute', 'extract_html', 'extract_table', 'extract_multiple', 'crawl_pagination', 'extract_links', 'extract_image', 'extract_all_images', 'scrape_elements', 'screenshot', 'execute_javascript', 'http_request', 'transform', 'regex', 'json_parse', 'generate_data', 'storage_manage', 'ai_agent', 'autonomous_agent', 'generate_image', 'generate_video', 'firecrawl', 'smart_scroll', 'download_file', 'show_notification', 'math_calculate', 'export_data', 'dataset_input'].includes(
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

        {/* Collection Iterator: Item Variable Name & Starting Offset */}
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

            {/* General Start Item # / Index Offset */}
            <div className="grid grid-cols-2 gap-2 p-2 bg-[#141924] rounded-lg border border-[#202738]">
              <div>
                <label className="block text-[10px] font-medium text-gray-400 mb-1">
                  Start from Item # (1-based)
                </label>
                <input
                  type="number"
                  value={props.startItem ?? ''}
                  onChange={(e) => handlePropChange('startItem', e.target.value === '' ? '' : Number(e.target.value))}
                  min={1}
                  placeholder="1 (default)"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs font-mono outline-none"
                />
                <p className="text-[9px] text-gray-500 mt-0.5">E.g. 5 starts at 5th element</p>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-400 mb-1">
                  Start Index (0-based)
                </label>
                <input
                  type="number"
                  value={props.startIndex ?? ''}
                  onChange={(e) => handlePropChange('startIndex', e.target.value === '' ? '' : Number(e.target.value))}
                  min={0}
                  placeholder="0 (default)"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs font-mono outline-none"
                />
                <p className="text-[9px] text-gray-500 mt-0.5">E.g. 4 is equivalent to #5</p>
              </div>
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
            {/* Card Setup: Two Dedicated Action Buttons */}
            <div className="p-3 rounded-xl bg-gradient-to-br from-[#121624] to-[#17112c] border border-indigo-500/25 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Card Schema Generator</span>
                </div>
                {props.cardHtmlSnippet || props.containerSelector ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium flex items-center gap-1">
                    <Check className="w-3 h-3" /> Ready
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300/80 border border-indigo-500/20 font-medium">
                    2-Step Setup
                  </span>
                )}
              </div>

              {/* Two Separate Buttons: 1 for Selecting, 1 for Generating */}
              <div className="grid grid-cols-2 gap-2">
                {/* Button 1: Select Card Element */}
                <button
                  type="button"
                  disabled={isPickingElement}
                  onClick={() => onStartElementPicker('single', 'card_container')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all border ${
                    isPickingElement
                      ? 'bg-rose-600 text-white animate-pulse border-rose-500'
                      : 'bg-[#151a27] hover:bg-[#1c2335] text-gray-200 border-[#2b354c] hover:border-indigo-500/50'
                  }`}
                  title="Click to visually pick the repeating card on the webpage"
                >
                  <Crosshair className={`w-3.5 h-3.5 ${isPickingElement ? 'animate-spin' : 'text-indigo-400'}`} />
                  <span>{isPickingElement ? 'Click on Page...' : 'Select Card Element'}</span>
                </button>

                {/* Button 2: Generate Schema with AI */}
                <button
                  type="button"
                  disabled={effectiveGeneratingSchema}
                  onClick={handleGenerateAiSchema}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                    effectiveGeneratingSchema
                      ? 'bg-indigo-700 text-white cursor-wait animate-pulse'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-indigo-500/25'
                  }`}
                  title="Generate extraction fields and selectors using AI"
                >
                  {effectiveGeneratingSchema ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Generate with AI</span>
                    </>
                  )}
                </button>
              </div>

              {/* Card Snippet / Selector Status Pill */}
              {props.cardHtmlSnippet && (
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#0e121c] border border-[#1e2538] text-[11px]">
                  <span className="text-gray-300 truncate max-w-[210px] font-mono">
                    {props.cardTagName ? `<${props.cardTagName}>` : 'Card'} {props.containerSelector || ''}
                  </span>
                  <span className="text-emerald-400 font-medium text-[10px] shrink-0">HTML Ready ✓</span>
                </div>
              )}
            </div>

            {/* Container Selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-gray-300">
                  Container Selector
                </label>
                <button
                  type="button"
                  onClick={() => onStartElementPicker('single', 'card_container')}
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
                placeholder="article.Box-row, .product-card, li, div.item"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
            </div>

            {/* Saved Card Schemas & Presets with Parent Div */}
            <div className="space-y-2 p-2.5 rounded-xl bg-[#0e121a] border border-[#1e2433]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-200">
                  <Bookmark className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Card Schema &amp; Parent Div</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsSavingCardSchema(!isSavingCardSchema)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-colors"
                    title="Save current card schema and parent div container selector"
                  >
                    <Save className="w-3 h-3" />
                    <span>{isSavingCardSchema ? 'Close' : 'Save Current'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportSchemasFile}
                    className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#1c2230] transition-colors"
                    title="Export all saved card schemas as JSON"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <label
                    className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#1c2230] cursor-pointer transition-colors"
                    title="Import card schemas from JSON file"
                  >
                    <Upload className="w-3 h-3" />
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportSchemasFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Feedback toast / notification */}
              {cardSchemaSaveFeedback && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-950/60 border border-emerald-500/40 text-[10px] text-emerald-300 animate-fadeIn">
                  <Check className="w-3 h-3 shrink-0" />
                  <span>{cardSchemaSaveFeedback}</span>
                </div>
              )}

              {/* Schema Selector Dropdown */}
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedCardSchemaId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const found = cardSchemas.find((s) => s.id === id);
                    if (found) handleApplyCardSchema(found);
                    else setSelectedCardSchemaId('');
                  }}
                  className="flex-1 bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs"
                >
                  <option value="">-- Load Schema Preset or Saved Schema --</option>
                  <optgroup label="🌟 Built-in Presets">
                    {cardSchemas
                      .filter((s) => s.isBuiltIn)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.fields.length} fields)
                        </option>
                      ))}
                  </optgroup>
                  {cardSchemas.some((s) => !s.isBuiltIn) && (
                    <optgroup label="💾 Your Saved Schemas">
                      {cardSchemas
                        .filter((s) => !s.isBuiltIn)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.fields.length} fields)
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>

                {/* Delete button if selected schema is a custom user schema */}
                {(() => {
                  const currentSelected = cardSchemas.find((s) => s.id === selectedCardSchemaId);
                  if (currentSelected && !currentSelected.isBuiltIn) {
                    return (
                      <button
                        type="button"
                        onClick={() => handleDeleteCardSchemaItem(currentSelected.id)}
                        className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 transition-colors"
                        title={`Delete saved schema "${currentSelected.name}"`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Inline Save Form */}
              {isSavingCardSchema && (
                <div className="p-2 rounded-lg bg-[#141924] border border-indigo-500/30 space-y-2 animate-fadeIn">
                  <div className="text-[11px] font-medium text-indigo-300 flex items-center justify-between">
                    <span>Save Current Schema &amp; Parent Div</span>
                    <span className="text-[10px] text-gray-400">
                      {(props.fields || []).length} field(s)
                    </span>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">
                      Schema Name:
                    </label>
                    <input
                      type="text"
                      value={cardSchemaNameInput}
                      onChange={(e) => setCardSchemaNameInput(e.target.value)}
                      placeholder="e.g. My Amazon Products, Shopify Cards"
                      className="w-full bg-[#0d1017] text-white p-1.5 rounded border border-[#202738] focus:border-indigo-500 outline-none text-xs"
                    />
                  </div>
                  <div className="p-1.5 rounded bg-[#0b0e14] border border-[#1b2230] text-[10px] space-y-0.5">
                    <div className="text-gray-400 truncate">
                      Parent Div:{' '}
                      <span className="font-mono text-indigo-300">
                        {props.containerSelector || '(No container selector specified)'}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setIsSavingCardSchema(false)}
                      className="px-2 py-1 rounded text-[10px] text-gray-400 hover:text-white bg-[#1c2230] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCurrentCardSchema}
                      className="px-2.5 py-1 rounded text-[10px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center gap-1 shadow-sm"
                    >
                      <Save className="w-3 h-3" />
                      <span>Save Schema</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Preset Badges */}
              <div className="pt-1">
                <span className="text-[10px] font-medium text-gray-400 block mb-1">
                  Quick Presets:
                </span>
                <div className="flex flex-wrap gap-1">
                  {cardSchemas.slice(0, 7).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyCardSchema(preset)}
                      className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                        selectedCardSchemaId === preset.id
                          ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/50'
                          : 'bg-[#141924] hover:bg-[#1e2536] border-[#202738] text-gray-300 hover:text-white'
                      }`}
                      title={preset.description || preset.containerSelector}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
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
                {(() => {
                  const effectiveFields = Array.isArray(props.fields) && props.fields.length > 0 ? props.fields : [
                    { name: 'title', selector: 'h2', attribute: 'text' },
                    { name: 'price', selector: '.price', attribute: 'text' },
                    { name: 'image', selector: 'img', attribute: 'src' },
                    { name: 'link', selector: 'a', attribute: 'href' },
                  ];
                  return effectiveFields.map((field: any, idx: number) => (
                    <div key={idx} className="bg-[#141924] p-2 rounded-lg border border-[#202738] space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => {
                            const updated = [...effectiveFields];
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
                            const updated = [...effectiveFields];
                            updated[idx] = { ...updated[idx], selector: e.target.value };
                            handlePropChange('fields', updated);
                          }}
                          placeholder="Selector inside card (e.g. h2, img, a)"
                          className="flex-1 bg-[#0d1017] text-white px-2 py-1 rounded border border-[#202738] outline-none text-[11px] font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => onStartElementPicker('single', 'field', idx)}
                          className="p-1 hover:bg-[#1f2738] text-gray-400 hover:text-indigo-400 rounded border border-[#202738] transition-colors"
                          title="Pick selector for this field from page"
                        >
                          <Crosshair className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = effectiveFields.filter((_: any, i: number) => i !== idx);
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
                            const updated = [...effectiveFields];
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
                  ));
                })()}
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

            {/* Extracted Cards Table Output */}
            <div className="pt-2 border-t border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-200">
                  <Table className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Extracted Cards Table Output</span>
                </div>
                {extractedCardsData.length > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                    {extractedCardsData.length} {extractedCardsData.length === 1 ? 'card' : 'cards'}
                  </span>
                )}
              </div>

              {extractedCardsData.length > 0 ? (
                <div className="p-2.5 rounded-xl bg-[#0e121a] border border-[#1e2433] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setIsScrapeTableModalOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-sm"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>View Full Table ({extractedCardsData.length} rows)</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <input
                        ref={propertiesScrapeFileInputRef}
                        type="file"
                        accept=".csv,.tsv,.json"
                        onChange={handleImportCardsDataset}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => propertiesScrapeFileInputRef.current?.click()}
                        className="px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-[10px] text-emerald-300 hover:text-white flex items-center gap-1 transition-colors"
                        title="Import CSV or JSON to populate dataset"
                      >
                        <Upload className="w-3 h-3 text-emerald-400" />
                        <span>Import</span>
                      </button>
                      <button
                        type="button"
                        disabled={isExportingCards}
                        onClick={() => handleExportCardsDataset('csv')}
                        className="px-2 py-1 rounded bg-[#161a24] hover:bg-[#202738] border border-[#263045] text-[10px] text-gray-300 hover:text-white flex items-center gap-1 transition-colors"
                        title="Download as CSV"
                      >
                        <FileText className="w-3 h-3 text-emerald-400" />
                        <span>CSV</span>
                      </button>
                      <button
                        type="button"
                        disabled={isExportingCards}
                        onClick={() => handleExportCardsDataset('xlsx')}
                        className="px-2 py-1 rounded bg-[#161a24] hover:bg-[#202738] border border-[#263045] text-[10px] text-gray-300 hover:text-white flex items-center gap-1 transition-colors"
                        title="Download as Excel XLSX"
                      >
                        <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                        <span>Excel</span>
                      </button>
                      <button
                        type="button"
                        disabled={isExportingCards}
                        onClick={() => handleExportCardsDataset('json')}
                        className="px-2 py-1 rounded bg-[#161a24] hover:bg-[#202738] border border-[#263045] text-[10px] text-gray-300 hover:text-white flex items-center gap-1 transition-colors"
                        title="Download as JSON"
                      >
                        <FileCode className="w-3 h-3 text-amber-400" />
                        <span>JSON</span>
                      </button>
                    </div>
                  </div>

                  {/* Inline Table Preview */}
                  <div className="rounded-lg border border-[#1e2538] overflow-hidden bg-[#0a0d14]">
                    <div className="overflow-x-auto max-h-48 text-[10px]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#121622] text-gray-400 border-b border-[#1e2538]">
                            <th className="py-1 px-2 font-mono text-[9px] w-6">#</th>
                            {(() => {
                              const keys = Array.from(
                                new Set(
                                  extractedCardsData.slice(0, 10).flatMap((item: any) =>
                                    item && typeof item === 'object' ? Object.keys(item) : []
                                  )
                                )
                              );
                              return keys.map((key) => (
                                <th key={key} className="py-1 px-2 font-medium truncate max-w-[120px]">
                                  {key}
                                </th>
                              ));
                            })()}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#161c29]">
                          {extractedCardsData.slice(0, 5).map((row: any, rIdx: number) => {
                            const keys = Array.from(
                              new Set(
                                extractedCardsData.slice(0, 10).flatMap((item: any) =>
                                  item && typeof item === 'object' ? Object.keys(item) : []
                                )
                              )
                            );
                            return (
                              <tr key={rIdx} className="hover:bg-[#131724]/60 transition-colors">
                                <td className="py-1 px-2 font-mono text-gray-500 text-[9px]">{rIdx + 1}</td>
                                {keys.map((k) => {
                                  const val = row && typeof row === 'object' ? row[k] : undefined;
                                  const strVal = String(val ?? '');
                                  const isImg =
                                    typeof val === 'string' &&
                                    (val.startsWith('data:image/') ||
                                      (val.startsWith('http') && (k.toLowerCase().includes('image') || k.toLowerCase().includes('src') || val.match(/\.(jpg|jpeg|png|webp|gif)/i))));
                                  const isLink = typeof val === 'string' && val.startsWith('http') && !isImg;

                                  return (
                                    <td key={k} className="py-1 px-2 text-gray-300 truncate max-w-[140px]">
                                      {isImg ? (
                                        <div className="flex items-center gap-1.5">
                                          <img
                                            src={val}
                                            alt={k}
                                            className="w-5 h-5 object-contain rounded border border-[#2b354c] bg-black/40 shrink-0"
                                          />
                                          <span className="truncate text-gray-400 font-mono text-[9px]">{val}</span>
                                        </div>
                                      ) : isLink ? (
                                        <a
                                          href={val}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-indigo-400 hover:text-indigo-300 underline flex items-center gap-0.5 truncate"
                                        >
                                          <span className="truncate">{val}</span>
                                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                        </a>
                                      ) : (
                                        <span>{strVal || <span className="text-gray-600 italic">null</span>}</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {extractedCardsData.length > 5 && (
                      <div className="px-2.5 py-1 bg-[#10141f] border-t border-[#1e2538] text-[9px] text-gray-400 flex items-center justify-between">
                        <span>Showing first 5 of {extractedCardsData.length} extracted cards</span>
                        <button
                          type="button"
                          onClick={() => setIsScrapeTableModalOpen(true)}
                          className="text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          View all {extractedCardsData.length} in table &rarr;
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[#0e121a] border border-[#1e2433] text-center space-y-2">
                  <div className="flex justify-center text-gray-600">
                    <Table className="w-5 h-5" />
                  </div>
                  <p className="text-[11px] text-gray-300 font-medium">No extracted cards yet</p>
                  <p className="text-[10px] text-gray-500 max-w-xs mx-auto">
                    Execute this node or import a dataset file to view structured cards in the interactive table.
                  </p>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => propertiesScrapeFileInputRef.current?.click()}
                      className="py-1 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Import CSV / JSON</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Draggable "For Each" Loop Card */}
              {(() => {
                const cols = Array.from(
                  new Set([
                    ...(Array.isArray(props.fields) ? props.fields.map((f: any) => f.name).filter(Boolean) : []),
                    ...extractedCardsData.slice(0, 5).flatMap((item: any) =>
                      item && typeof item === 'object' ? Object.keys(item) : []
                    ),
                    'title',
                    'price',
                    'link',
                  ])
                ).slice(0, 8);

                return (
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData('application/autoflow-node', 'for_each');
                      e.dataTransfer.setData(
                        'application/autoflow-node-props',
                        JSON.stringify({
                          array: `{{${props.outputVariable || 'scrapedProducts'}}}`,
                          itemVariable: props.itemVariable || 'currentProduct',
                          exposedVariables: cols,
                        })
                      );
                      e.dataTransfer.setData('application/autoflow-source-node', selectedNode.id);
                      e.dataTransfer.setData('application/autoflow-source-handle', 'loop_done');
                      e.dataTransfer.effectAllowed = 'copyMove';
                    }}
                    className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/30 hover:border-indigo-400 cursor-grab active:cursor-grabbing transition-all select-none space-y-2 group/drag shadow-sm"
                    title="Drag onto canvas to create a connected 'For Each' loop node"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-indigo-300 font-semibold text-xs">
                        <GripVertical className="w-3.5 h-3.5 text-indigo-400/80 group-hover/drag:text-indigo-200" />
                        <Repeat className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Drag &quot;For Each&quot; Loop to Canvas</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-indigo-300 bg-indigo-900/50 px-1.5 py-0.5 rounded border border-indigo-700/40">
                          &#123;&#123;{props.outputVariable || 'scrapedProducts'}&#125;&#125;
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(
                              new CustomEvent('autoflow:add-for-each-node', {
                                detail: {
                                  arrayKey: props.outputVariable || 'scrapedProducts',
                                  sourceNodeId: selectedNode.id,
                                  exposedVariables: cols,
                                },
                              })
                            );
                          }}
                          className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium flex items-center gap-1 shadow-sm transition-colors"
                          title="Instantly add and connect For Each node immediately below this scraper"
                        >
                          <Plus className="w-2.5 h-2.5" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>

                    <div className="text-[10px] text-gray-400">
                      In the loop body, each item exposes all columns as individual variables:
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {cols.map((colName) => (
                        <button
                          key={colName}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard?.writeText(`{{${colName}}}`);
                          }}
                          className="px-1.5 py-0.5 rounded bg-indigo-950/60 hover:bg-indigo-900 text-indigo-200 border border-indigo-500/30 text-[9px] font-mono flex items-center gap-0.5 transition-colors"
                          title={`Click to copy {{${colName}}} (also {{${props.itemVariable || 'currentProduct'}.${colName}}})`}
                        >
                          <span>&#123;&#123;{colName}&#125;&#125;</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
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
                    <div
                      className="relative rounded-lg overflow-hidden border border-[#232a3b] bg-black/60 p-1.5 flex items-center justify-center group cursor-pointer"
                      onClick={() => {
                        setFullScreenImageUrl(imagePreviews[0]);
                        setFullScreenImageIndex(0);
                      }}
                      title="Click to view full screen"
                    >
                      <img
                        src={imagePreviews[0]}
                        alt="Extracted Preview"
                        className="max-h-36 max-w-full object-contain rounded"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                        <span className="px-2 py-1 rounded bg-black/80 text-white text-[10px] font-medium flex items-center gap-1 border border-white/20">
                          <Maximize2 className="w-3 h-3 text-indigo-400" />
                          <span>Full Screen</span>
                        </span>
                      </div>
                    </div>

                    {imagePreviews.length > 1 && (
                      <div className="flex gap-1 overflow-x-auto pb-1 max-h-16">
                        {imagePreviews.slice(0, 16).map((src, i) => (
                          <div key={i} className="relative group shrink-0">
                            <img
                              src={src}
                              alt={`Preview ${i + 1}`}
                              className="w-12 h-12 object-cover rounded border border-[#232a3b] cursor-pointer hover:border-indigo-500"
                              onClick={() => {
                                setFullScreenImageUrl(src);
                                setFullScreenImageIndex(i);
                              }}
                            />
                            <a
                              href={src}
                              target="_blank"
                              rel="noreferrer"
                              className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/80 text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Open in new tab"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-gray-500 font-mono">
                        {imagePreviews[0].startsWith('data:image/')
                          ? `${Math.round(imagePreviews[0].length / 1024)} KB`
                          : 'URL'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={imagePreviews[0]}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[#1c2230] text-gray-300 hover:text-white transition-colors"
                          title="Open original image in new tab"
                        >
                          <ExternalLink className="w-3 h-3 text-gray-400" />
                          <span>Open Tab</span>
                        </a>
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

            {/* Structured Output & JSON Schema Designer */}
            {selectedNode.data.type === 'ai_agent' && (
              <JsonSchemaSection
                properties={props}
                onPropChange={handlePropChange}
                outputVariable={props.outputVariable || 'aiAnalysis'}
                runtimeOutput={
                  runtimeState?.output ??
                  runtimeState?.dynamicState?.response ??
                  (props.outputVariable ? variables[props.outputVariable] : undefined)
                }
              />
            )}

            {/* AI Agent Response / Result Preview */}
            {(() => {
              const nodeStateOutput = runtimeState?.output ?? runtimeState?.dynamicState?.response;
              const varOutput = props.outputVariable ? variables[props.outputVariable] : undefined;
              const effectiveOutput = nodeStateOutput ?? varOutput;
              const hasOutput = effectiveOutput !== undefined && effectiveOutput !== null && effectiveOutput !== '';
              const isSuccess = runtimeState?.status === 'success';

              if (!hasOutput && !isSuccess) return null;

              const textToDisplay = typeof effectiveOutput === 'object'
                ? JSON.stringify(effectiveOutput, null, 2)
                : String(effectiveOutput || 'Completed with empty response');

              return (
                <div className="p-3 rounded-xl bg-[#0f131d] border border-indigo-500/30 space-y-2 mt-3 shadow-sm">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-400">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                      <span>{selectedNode.data.type === 'autonomous_agent' ? 'Agent Goal Response' : 'AI Agent Response'}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isSuccess && (
                        <span className="text-[9px] bg-emerald-950/60 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-mono">
                          Success
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(textToDisplay);
                          setCopiedBase64(true);
                          setTimeout(() => setCopiedBase64(false), 2000);
                        }}
                        className="p-1 px-1.5 rounded bg-[#161d2b] hover:bg-[#20293d] text-gray-300 hover:text-white border border-[#26334a] text-[10px] flex items-center gap-1 transition-colors"
                        title="Copy AI response"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedBase64 ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-black/60 border border-[#1e2738] max-h-56 overflow-y-auto font-mono text-[11px] text-gray-200 whitespace-pre-wrap select-all leading-relaxed">
                    {textToDisplay}
                  </div>

                  {props.outputVariable && (
                    <div className="flex items-center justify-between text-[10px] text-gray-400 pt-0.5">
                      <span>Saved to variable:</span>
                      <code className="text-indigo-300 font-mono bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-800/30">
                        &#123;&#123;{props.outputVariable}&#125;&#125;
                      </code>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* AI Image Generator Node */}
        {selectedNode.data.type === 'generate_image' && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Image Generation Prompt</label>
                <span className="text-[10px] text-purple-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>
              <textarea
                rows={3}
                value={props.prompt || ''}
                onChange={(e) => handlePropChange('prompt', e.target.value)}
                placeholder="e.g. A high resolution product mock-up of {{pageTitle}}, commercial studio lighting, 8k"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono"
              />
              <p className="text-[10px] text-gray-500 mt-0.5">
                Describe the image to generate. You can embed extracted text, titles, or variables.
              </p>
            </div>

            {/* Input Image (img2img / Reference) */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-gray-300 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Input Image (img2img / Reference)</span>
                </label>
                <span className="text-[10px] text-purple-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>
              <p className="text-[10px] text-gray-500 leading-normal">
                Optional reference image for Image-to-Image editing, variations, or style matching. Enter an image URL, base64 data URI, variable (e.g. <code className="text-purple-300">&#123;&#123;screenshotUrl&#125;&#125;</code>), or upload a file.
              </p>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={props.inputImage || ''}
                  onChange={(e) => handlePropChange('inputImage', e.target.value)}
                  placeholder="https://... or {{screenshotUrl}} or data:image/..."
                  className="flex-1 bg-[#0b0e14] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs font-mono"
                />
                <label className="px-2 py-1.5 bg-[#1c2230] hover:bg-[#283145] text-gray-300 hover:text-white rounded border border-[#2a3449] cursor-pointer flex items-center gap-1 text-[11px] font-medium transition-colors shrink-0" title="Upload local image">
                  <Upload className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                          if (evt.target?.result) {
                            handlePropChange('inputImage', evt.target.result as string);
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
                {props.inputImage && (
                  <button
                    type="button"
                    onClick={() => handlePropChange('inputImage', '')}
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors"
                    title="Clear input image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {props.inputImage && (props.inputImage.startsWith('http') || props.inputImage.startsWith('data:image')) && (
                <div className="flex items-center gap-2 pt-1 border-t border-[#1c2230]">
                  <img
                    src={props.inputImage}
                    alt="Input reference preview"
                    className="w-10 h-10 object-cover rounded border border-[#2a3449]"
                  />
                  <div className="text-[10px] text-gray-400 truncate flex-1">
                    <span className="font-semibold text-gray-300 block">Reference Loaded</span>
                    {props.inputImage.startsWith('data:') ? 'Base64 image data' : props.inputImage}
                  </div>
                </div>
              )}
            </div>

            {/* Asynchronous Image Generation (upto 8: 1, 2, 4, 8) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Asynchronous Image Generation</span>
                </label>
                <span className="text-[10px] font-mono text-amber-300 bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-500/20">
                  {Number(props.asyncCount || 1) === 1 ? '1 image' : `${props.asyncCount || 1} images async`}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 mb-1.5">
                Generate variations concurrently in parallel (up to 8 images).
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 4, 8].map((count) => {
                  const isSelected = Number(props.asyncCount || 1) === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => handlePropChange('asyncCount', count)}
                      className={`py-1.5 px-2 text-center rounded border text-xs font-mono font-medium transition-all ${
                        isSelected
                          ? 'bg-amber-600 text-white border-amber-500 font-semibold shadow-sm shadow-amber-900/30'
                          : 'bg-[#11141c] text-gray-400 border-[#1c2230] hover:text-white hover:bg-[#161a24]'
                      }`}
                    >
                      {count === 1 ? '1 (Single)' : `${count} Async`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Model Selection */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Image Model</label>
              <select
                value={props.model || 'dall-e-3'}
                onChange={(e) => {
                  const newModel = e.target.value;
                  handlePropChange('model', newModel);
                  if (newModel === 'hy-image-v3.5-preview') {
                    if (!props.size || props.size === '1024x1024') {
                      handlePropChange('size', '1920x1080');
                    }
                  }
                }}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="dall-e-3">DALL-E 3 (OpenAI - Flagship)</option>
                <option value="dall-e-2">DALL-E 2 (OpenAI - Fast & Lightweight)</option>
                <option value="hy-image-v3.5-preview">Hunyuan Image 3.5 (GMI Cloud - hy-image-v3.5-preview)</option>
                <option value="custom">Custom Model (e.g. Flux, Stable Diffusion, SDXL)...</option>
              </select>
            </div>

            {props.model === 'hy-image-v3.5-preview' && (
              <div className="p-2.5 rounded-lg bg-purple-950/20 border border-purple-500/30 flex items-center justify-between text-xs text-purple-300">
                <span className="flex items-center gap-1.5 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>GMI Cloud Request Queue</span>
                </span>
                <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">hy-image-v3.5-preview</span>
              </div>
            )}

            {props.model === 'custom' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Custom Model Name</label>
                <input
                  type="text"
                  value={props.customModelName || ''}
                  onChange={(e) => {
                    handlePropChange('customModelName', e.target.value);
                    handlePropChange('model', e.target.value);
                  }}
                  placeholder="e.g. flux-1.1-pro, stable-diffusion-3.5, midjourney-proxy"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
                />
              </div>
            )}

            {/* Separate API Key & Base URL Settings */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-300">Dedicated API & Base URL Settings</span>
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#1c2230] text-gray-400 font-mono">
                  {props.model === 'hy-image-v3.5-preview' ? 'GMI Cloud Key' : 'Optional'}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 leading-normal">
                {props.model === 'hy-image-v3.5-preview'
                  ? 'GMI Cloud requires an API key from console.gmicloud.ai. Enter your key below or in global AI Settings.'
                  : 'By default, this node uses your global AI Settings. Specify a separate API key or custom OpenAI-compatible gateway (e.g. OpenRouter, Together AI, ExperientialLabs, local endpoint) below if needed.'}
              </p>

              <div>
                <label className="block text-[10px] font-medium text-gray-400 mb-1">
                  {props.model === 'hy-image-v3.5-preview' ? 'GMI Cloud API Key' : 'Separate API Key'}
                </label>
                <div className="relative">
                  <input
                    type={showImageApiKey ? 'text' : 'password'}
                    value={props.apiKey || ''}
                    onChange={(e) => handlePropChange('apiKey', e.target.value)}
                    placeholder={props.model === 'hy-image-v3.5-preview' ? 'GMI Cloud API Key (Bearer token)' : 'sk-... (Leave empty to use global key)'}
                    className="w-full bg-[#0b0e14] text-white p-1.5 pr-8 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowImageApiKey(!showImageApiKey)}
                    className="absolute right-2 top-2 text-gray-500 hover:text-gray-300"
                    title={showImageApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showImageApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-400 mb-1">
                  {props.model === 'hy-image-v3.5-preview' ? 'GMI Cloud Endpoint (Optional override)' : 'Separate Base URL'}
                </label>
                <input
                  type="text"
                  value={props.baseUrl || ''}
                  onChange={(e) => handlePropChange('baseUrl', e.target.value)}
                  placeholder={
                    props.model === 'hy-image-v3.5-preview'
                      ? 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests (Default)'
                      : 'https://api.openai.com/v1 or custom gateway'
                  }
                  className="w-full bg-[#0b0e14] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs font-mono"
                />
              </div>
            </div>

            {/* Image Resolution & Dimensions */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Image Size / Resolution</label>
                <span className="text-[10px] text-gray-400 font-mono">{props.size || (props.model === 'hy-image-v3.5-preview' ? '1920x1080' : '1024x1024')}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(props.model === 'hy-image-v3.5-preview' ? [
                  { id: '1920x1080', label: '1920x1080', desc: 'Full HD 16:9 Landscape' },
                  { id: '1080x1920', label: '1080x1920', desc: 'Full HD 9:16 Portrait' },
                  { id: '1024x1024', label: '1024x1024', desc: 'Square 1:1' },
                  { id: '3840x2160', label: '3840x2160', desc: '4K Ultra HD 16:9' },
                  { id: '1280x720', label: '1280x720', desc: 'HD 16:9' },
                  { id: '2048x2048', label: '2048x2048', desc: '2K Square' },
                ] : [
                  { id: '1024x1024', label: '1024x1024', desc: 'Square 1:1' },
                  { id: '1024x1792', label: '1024x1792', desc: 'Portrait 9:16' },
                  { id: '1792x1024', label: '1792x1024', desc: 'Landscape 16:9' },
                  { id: '512x512', label: '512x512', desc: 'DALL-E 2' },
                  { id: '256x256', label: '256x256', desc: 'Thumbnail' },
                ]).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handlePropChange('size', s.id)}
                    className={`py-1 px-1.5 text-center rounded border text-[10px] font-mono transition-colors ${
                      (props.size || (props.model === 'hy-image-v3.5-preview' ? '1920x1080' : '1024x1024')) === s.id
                        ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                        : 'bg-[#11141c] text-gray-400 border-[#1c2230] hover:text-white'
                    }`}
                    title={s.desc}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality and Style (for DALL-E 3) */}
            {(!props.model || props.model.includes('dall-e-3')) && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Quality</label>
                  <select
                    value={props.quality || 'standard'}
                    onChange={(e) => handlePropChange('quality', e.target.value)}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                  >
                    <option value="standard">Standard</option>
                    <option value="hd">HD (High Definition)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Style</label>
                  <select
                    value={props.style || 'vivid'}
                    onChange={(e) => handlePropChange('style', e.target.value)}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                  >
                    <option value="vivid">Vivid (Hyper-real)</option>
                    <option value="natural">Natural (Realistic)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Response Format */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Format</label>
              <select
                value={props.responseFormat || 'url'}
                onChange={(e) => handlePropChange('responseFormat', e.target.value)}
                className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="url">Hosted Image URL (Valid for 60 min)</option>
                <option value="b64_json">Base64 Data URI (Self-contained, permanent)</option>
              </select>
            </div>

            {/* Auto-Download Checkbox */}
            <div className="space-y-2 pt-1 border-t border-[#1c2230]">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!props.autoDownload}
                  onChange={(e) => handlePropChange('autoDownload', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px] flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  Auto-download generated image
                </span>
              </label>

              {props.autoDownload && (
                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1">Save Filename</label>
                  <input
                    type="text"
                    value={props.downloadFilename || 'generated_image'}
                    onChange={(e) => handlePropChange('downloadFilename', e.target.value)}
                    placeholder="e.g. art_{{pageTitle}}"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
              )}
            </div>

            {/* Generated Image Preview strictly scoped to this node */}
            {(() => {
              const nodeStateOutput = runtimeState?.output;
              const nodeDynamic = runtimeState?.dynamicState;
              const isThisNodeSuccess = runtimeState?.status === 'success';

              // Extract images strictly belonging to THIS node's execution
              const nodeImages: string[] = (() => {
                if (Array.isArray(nodeStateOutput) && nodeStateOutput.length > 0) {
                  return nodeStateOutput.filter((u): u is string => typeof u === 'string' && u.length > 0);
                }
                if (Array.isArray(nodeDynamic?.images) && nodeDynamic.images.length > 0) {
                  return nodeDynamic.images.filter((u): u is string => typeof u === 'string' && u.length > 0);
                }
                if (typeof nodeStateOutput === 'string' && (nodeStateOutput.startsWith('http') || nodeStateOutput.startsWith('data:image'))) {
                  return [nodeStateOutput];
                }
                if (typeof nodeDynamic?.previewUrl === 'string' && (nodeDynamic.previewUrl.startsWith('http') || nodeDynamic.previewUrl.startsWith('data:image'))) {
                  return [nodeDynamic.previewUrl];
                }
                // Only inspect outputVariable if this specific node has run with success
                if (isThisNodeSuccess && props.outputVariable) {
                  const varImages = variables[`${props.outputVariable}_images`];
                  if (Array.isArray(varImages) && varImages.length > 0) {
                    return varImages.filter((u): u is string => typeof u === 'string' && u.length > 0);
                  }
                  const singleVar = variables[props.outputVariable];
                  if (typeof singleVar === 'string' && (singleVar.startsWith('http') || singleVar.startsWith('data:image'))) {
                    return [singleVar];
                  }
                }
                return [];
              })();

              if (nodeImages.length === 0) return null;

              const primaryImage = nodeImages[0];

              return (
                <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2.5 mt-2">
                  <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Generated Image Preview</span>
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {nodeImages.length === 1 ? '1 image' : `${nodeImages.length} images generated`}
                    </span>
                  </div>

                  {/* Multi-image Gallery */}
                  {nodeImages.length > 1 ? (
                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1 bg-black/40 rounded-lg border border-[#232a3b]">
                      {nodeImages.map((imgUrl: string, idx: number) => (
                        <div
                          key={idx}
                          className="relative group rounded-lg overflow-hidden border border-[#2a3449] bg-black/80 flex flex-col items-center justify-center min-h-[110px]"
                        >
                          <img
                            src={imgUrl}
                            alt={`Generated variation ${idx + 1}`}
                            className="w-full max-h-48 object-contain cursor-pointer"
                            onClick={() => {
                              setFullScreenImageUrl(imgUrl);
                              setFullScreenImageIndex(idx);
                            }}
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 transition-opacity">
                            <button
                              type="button"
                              onClick={() => {
                                setFullScreenImageUrl(imgUrl);
                                setFullScreenImageIndex(idx);
                              }}
                              className="p-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                              title="Full Screen Preview"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                            <a
                              href={imgUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-md bg-[#1c2230] hover:bg-[#283145] text-gray-300 hover:text-white transition-colors"
                              title="Open image in new tab"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                const baseName = props.downloadFilename || `${props.outputVariable || 'image'}`;
                                handleDownloadImage(imgUrl, `${baseName}_${idx + 1}.png`);
                              }}
                              className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                              title="Download Image"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(imgUrl);
                                setCopiedBase64(true);
                                setTimeout(() => setCopiedBase64(false), 2000);
                              }}
                              className="p-1.5 rounded-md bg-[#1c2230] hover:bg-[#283145] text-gray-300 hover:text-white transition-colors"
                              title="Copy URL"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="absolute bottom-1 right-1 text-[9px] bg-black/80 text-white px-1 py-0.5 rounded font-mono">
                            #{idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Single Image Preview */
                    <div
                      className="group relative rounded-lg overflow-hidden border border-[#232a3b] bg-black/60 max-h-52 flex items-center justify-center cursor-pointer"
                      onClick={() => {
                        setFullScreenImageUrl(primaryImage);
                        setFullScreenImageIndex(0);
                      }}
                    >
                      <img
                        src={primaryImage}
                        alt="Generated Preview"
                        className="w-full max-h-52 object-contain"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                        <span className="px-3 py-1.5 rounded-lg bg-black/75 text-white text-xs font-medium flex items-center gap-1.5 border border-white/20 shadow-lg">
                          <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Click for Full Screen</span>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons: Full Screen, Download, Open Tab, Copy URL */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setFullScreenImageUrl(primaryImage);
                        setFullScreenImageIndex(0);
                      }}
                      className="py-1.5 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                      title="View image full screen"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Full Screen</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (nodeImages.length > 1) {
                          nodeImages.forEach((url, i) => {
                            const baseName = props.downloadFilename || `${props.outputVariable || 'image'}`;
                            setTimeout(() => handleDownloadImage(url, `${baseName}_${i + 1}.png`), i * 250);
                          });
                        } else {
                          const baseName = props.downloadFilename || `${props.outputVariable || 'image'}`;
                          handleDownloadImage(primaryImage, `${baseName}.png`);
                        }
                      }}
                      className="py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                      title="Download generated image file"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{nodeImages.length > 1 ? `Download (${nodeImages.length})` : 'Download'}</span>
                    </button>

                    <a
                      href={primaryImage}
                      target="_blank"
                      rel="noreferrer"
                      className="py-1.5 px-2 text-center rounded-lg bg-[#161a24] hover:bg-[#202738] text-gray-300 hover:text-white text-xs font-medium border border-[#232a3b] flex items-center justify-center gap-1.5 transition-colors"
                      title="Open image in new browser tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                      <span>Open in Tab</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(primaryImage);
                        setCopiedBase64(true);
                        setTimeout(() => setCopiedBase64(false), 2000);
                      }}
                      className="py-1.5 px-2 rounded-lg bg-[#161a24] hover:bg-[#202738] text-gray-300 hover:text-white text-xs font-medium border border-[#232a3b] flex items-center justify-center gap-1.5 transition-colors"
                      title="Copy image URL / data to clipboard"
                    >
                      <Copy className="w-3.5 h-3.5 text-gray-400" />
                      <span>{copiedBase64 ? 'Copied!' : 'Copy URL'}</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* AI Video Generator Node */}
        {selectedNode.data.type === 'generate_video' && (
          <VideoGeneratorProperties
            selectedNode={selectedNode}
            onPropChange={handlePropChange}
            runtimeState={runtimeState}
            variables={variables}
          />
        )}

        {/* Firecrawl (Keyless) Scraper Node */}
        {selectedNode.data.type === 'firecrawl' && (
          <div className="space-y-3">
            {/* Keyless Status Badge */}
            <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
                  Keyless Mode Active
                </span>
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 font-mono">
                  No Key Needed
                </span>
              </div>
              <p className="text-[10px] text-gray-400 leading-normal">
                Scrapes and converts full web pages into clean LLM-ready markdown using Firecrawl. Keyless tier is free and requires no signup.
              </p>
            </div>

            {/* Mode Selection */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Firecrawl Operation Mode</label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'scrape', label: 'Scrape Page', desc: 'Convert page into clean Markdown / HTML' },
                  { id: 'search', label: 'Search & Scrape', desc: 'Search the web & return scraped markdown' },
                  { id: 'map', label: 'Map Links', desc: 'Discover all internal & external links' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handlePropChange('mode', m.id)}
                    className={`py-1.5 px-2 text-center rounded border text-[11px] font-medium transition-colors ${
                      (props.mode || 'scrape') === m.id
                        ? 'bg-orange-600 text-white border-orange-500 shadow-sm'
                        : 'bg-[#11141c] text-gray-400 border-[#1c2230] hover:text-white'
                    }`}
                    title={m.desc}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Target URL (for scrape & map modes) */}
            {props.mode !== 'search' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-400">Target Page URL</label>
                  <button
                    type="button"
                    onClick={() => handlePropChange('url', '{{currentUrl}}')}
                    className="text-[10px] text-orange-400 hover:text-orange-300 font-mono transition-colors"
                  >
                    Use &#123;&#123;currentUrl&#125;&#125;
                  </button>
                </div>
                <input
                  type="text"
                  value={props.url || ''}
                  onChange={(e) => handlePropChange('url', e.target.value)}
                  placeholder="https://example.com or {{currentUrl}}"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none text-xs font-mono"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Supports static URLs or dynamic variables like <code className="text-gray-400 font-mono">&#123;&#123;currentUrl&#125;&#125;</code> or <code className="text-gray-400 font-mono">&#123;&#123;articleUrl&#125;&#125;</code>.
                </p>
              </div>
            )}

            {/* Search Query (for search mode) */}
            {props.mode === 'search' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-400">Search Query</label>
                  <span className="text-[10px] text-orange-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                </div>
                <input
                  type="text"
                  value={props.searchQuery || ''}
                  onChange={(e) => handlePropChange('searchQuery', e.target.value)}
                  placeholder="e.g. latest news about AI or {{searchTopic}}"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none text-xs font-mono"
                />
                <div className="mt-2">
                  <label className="block text-[10px] font-medium text-gray-400 mb-1">Max Results Limit</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={props.limit || 5}
                    onChange={(e) => handlePropChange('limit', parseInt(e.target.value) || 5)}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs font-mono"
                  />
                </div>
                <div className="mt-2">
                  <label className="block text-[10px] font-medium text-gray-400 mb-1">Search Output Format</label>
                  <select
                    value={props.searchOutputFormat || 'markdown'}
                    onChange={(e) => handlePropChange('searchOutputFormat', e.target.value)}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs"
                  >
                    <option value="markdown">Markdown Text (Clean, readable search summary)</option>
                    <option value="array">Structured Array (List of result objects for For Each loop)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Formats Selection (for scrape mode) */}
            {(!props.mode || props.mode === 'scrape') && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1.5">Extraction Formats</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'markdown', label: 'Markdown (LLM Clean)' },
                    { id: 'html', label: 'Cleaned HTML' },
                    { id: 'rawHtml', label: 'Raw HTML' },
                    { id: 'links', label: 'Extracted Links' },
                    { id: 'screenshot', label: 'Page Screenshot' },
                  ].map((fmt) => {
                    const currentFormats = Array.isArray(props.formats) ? props.formats : ['markdown'];
                    const isSelected = currentFormats.includes(fmt.id);
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => {
                          let nextFormats: string[];
                          if (isSelected) {
                            nextFormats = currentFormats.filter((f: string) => f !== fmt.id);
                            if (nextFormats.length === 0) nextFormats = ['markdown'];
                          } else {
                            nextFormats = [...currentFormats, fmt.id];
                          }
                          handlePropChange('formats', nextFormats);
                        }}
                        className={`py-1 px-2 rounded border text-[10px] font-mono transition-colors ${
                          isSelected
                            ? 'bg-orange-600/30 text-orange-300 border-orange-500/50 font-medium'
                            : 'bg-[#11141c] text-gray-400 border-[#1c2230] hover:text-white'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Page Toggles & Wait Timing */}
            {(!props.mode || props.mode === 'scrape') && (
              <div className="space-y-2 pt-1 border-t border-[#1c2230]">
                <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={props.onlyMainContent !== false}
                    onChange={(e) => handlePropChange('onlyMainContent', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-orange-600"
                  />
                  <span className="text-[11px]">
                    Only Main Content (Strip headers, footers & ads)
                  </span>
                </label>

                <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={props.fallbackToBrowser !== false}
                    onChange={(e) => handlePropChange('fallbackToBrowser', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-orange-600"
                  />
                  <span className="text-[11px]">
                    Fallback to Local Browser DOM if Keyless Limit reached
                  </span>
                </label>

                <div>
                  <label className="block text-[10px] font-medium text-gray-400 mb-1">
                    Wait for Dynamic Content (ms)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={props.waitFor !== undefined ? props.waitFor : 1000}
                    onChange={(e) => handlePropChange('waitFor', parseInt(e.target.value) || 0)}
                    placeholder="1000"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] outline-none text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {/* Dedicated API Settings (Keyless by default, optional key & self-hosted URL) */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-300">Custom API & Self-Hosted Settings</span>
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#1c2230] text-gray-400 font-mono">Optional</span>
              </div>
              <p className="text-[10px] text-gray-500 leading-normal">
                Leave empty for default keyless operation. Specify a custom key or your own self-hosted Firecrawl instance below if desired.
              </p>

              <div>
                <label className="block text-[10px] font-medium text-gray-400 mb-1">Optional API Key</label>
                <div className="relative">
                  <input
                    type={showFirecrawlApiKey ? 'text' : 'password'}
                    value={props.apiKey || ''}
                    onChange={(e) => handlePropChange('apiKey', e.target.value)}
                    placeholder="fc-... (Leave empty for keyless mode)"
                    className="w-full bg-[#0b0e14] text-white p-1.5 pr-8 rounded border border-[#232a3b] focus:border-orange-500 outline-none text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFirecrawlApiKey(!showFirecrawlApiKey)}
                    className="absolute right-2 top-2 text-gray-500 hover:text-gray-300"
                    title={showFirecrawlApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showFirecrawlApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-400 mb-1">Firecrawl Base URL</label>
                <input
                  type="text"
                  value={props.apiUrl || 'https://api.firecrawl.dev/v1'}
                  onChange={(e) => handlePropChange('apiUrl', e.target.value)}
                  placeholder="https://api.firecrawl.dev/v1 or http://localhost:3002/v1"
                  className="w-full bg-[#0b0e14] text-white p-1.5 rounded border border-[#232a3b] focus:border-orange-500 outline-none text-xs font-mono"
                />
              </div>
            </div>

            {/* Output Variable Configuration */}
            <div>
              <label className="block text-[11px] font-medium text-gray-300 mb-1">Save Output to Variable</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={props.outputVariable || 'firecrawlMarkdown'}
                  onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                  placeholder="firecrawlMarkdown"
                  className="flex-1 bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] focus:border-orange-500 outline-none text-xs font-mono"
                />
                <span className="px-2 py-1.5 rounded bg-orange-950/60 border border-orange-700/40 text-orange-300 text-[10px] font-mono shrink-0 select-all">
                  &#123;&#123;{props.outputVariable || 'firecrawlMarkdown'}&#125;&#125;
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                <span className="text-[10px] text-gray-500 py-0.5">Exposed variables:</span>
                {[
                  `{{${props.outputVariable || 'firecrawlMarkdown'}}}`,
                  `{{${props.outputVariable || 'firecrawlMarkdown'}_markdown}}`,
                  `{{${props.outputVariable || 'firecrawlMarkdown'}_screenshot}}`,
                  '{{firecrawlScreenshot}}',
                  ...(props.mode === 'search' ? [`{{${props.outputVariable || 'firecrawlMarkdown'}_results}}`] : []),
                ].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(v)}
                    className="px-1.5 py-0.5 rounded bg-[#1c2230] text-orange-300 border border-orange-500/20 text-[10px] font-mono hover:bg-orange-950/40 transition-colors"
                    title={`Click to copy ${v}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Screenshot Preview Card */}
            {(() => {
              const outVar = props.outputVariable || 'firecrawlMarkdown';
              const screenshot =
                runtimeState?.dynamicState?.previewUrl ||
                variables['firecrawlScreenshot'] ||
                variables['screenshotUrl'] ||
                (variables && variables[`${outVar}_screenshot`]);
              if (!screenshot) return null;
              return (
                <div className="p-2.5 rounded-lg bg-[#11141c] border border-orange-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-orange-400 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />
                      Page Screenshot Captured
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(screenshot);
                      }}
                      className="text-[10px] px-2 py-0.5 rounded bg-orange-900/40 hover:bg-orange-800/50 text-orange-200 border border-orange-500/30 transition-colors"
                      title="Copy screenshot URL to clipboard"
                    >
                      Copy URL
                    </button>
                  </div>
                  <div className="rounded-lg overflow-hidden border border-[#242b3d] bg-black/60 max-h-48 flex items-center justify-center group relative">
                    <img
                      src={screenshot}
                      alt="Firecrawl Screenshot"
                      className="w-full object-contain max-h-48 cursor-pointer"
                      onClick={() => window.open(screenshot, '_blank')}
                      title="Click to view full screenshot in new tab"
                    />
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono flex items-center justify-between">
                    <span>
                      Accessible via <code className="text-orange-300">&#123;&#123;firecrawlScreenshot&#125;&#125;</code> or <code className="text-orange-300">&#123;&#123;screenshotUrl&#125;&#125;</code>
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Live Scraped Markdown Output Preview */}
            {(runtimeState?.output || (props.outputVariable && variables[props.outputVariable])) && (
              <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2 mt-2">
                <div className="text-[11px] font-semibold text-orange-400 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5" />
                    Scraped Output Preview
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const text = String(runtimeState?.output || variables[props.outputVariable] || '');
                      navigator.clipboard.writeText(text);
                      setCopiedFirecrawlMarkdown(true);
                      setTimeout(() => setCopiedFirecrawlMarkdown(false), 2000);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded bg-[#1c2230] hover:bg-[#252c3d] text-gray-300 hover:text-white transition-colors"
                  >
                    {copiedFirecrawlMarkdown ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="p-2 rounded bg-black/40 border border-[#1c2230] max-h-48 overflow-y-auto text-[11px] font-mono text-gray-300 whitespace-pre-wrap select-all">
                  {typeof (runtimeState?.output || variables[props.outputVariable]) === 'object'
                    ? JSON.stringify(runtimeState?.output || variables[props.outputVariable], null, 2)
                    : String(runtimeState?.output || variables[props.outputVariable])}
                </div>
              </div>
            )}
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
                <option value="starts_with">starts with</option>
                <option value="ends_with">ends with</option>
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

            {['equals', 'not_equals', 'contains', 'does_not_contain', 'starts_with', 'ends_with'].includes(props.operator || 'equals') && (
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
          <div className="space-y-3">
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
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Start Count / Offset (Optional)</label>
              <input
                type="number"
                value={props.startCount ?? 0}
                onChange={(e) => handlePropChange('startCount', e.target.value === '' ? '' : Number(e.target.value))}
                min={0}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
                placeholder="0 (default)"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Initial offset for &#123;&#123;index&#125;&#125; or count counter (e.g. 0, 1...)
              </p>
            </div>
          </div>
        )}

        {/* For Each Node */}
        {selectedNode.data.type === 'for_each' && (
          <div className="space-y-3">
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

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Item Variable Name</label>
              <input
                type="text"
                value={props.itemVariable || 'item'}
                onChange={(e) => handlePropChange('itemVariable', e.target.value)}
                placeholder="item"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 p-2 bg-[#141924] rounded-lg border border-[#202738]">
              <div>
                <label className="block text-[10px] font-medium text-gray-400 mb-1">
                  Start from Item # (1-based)
                </label>
                <input
                  type="number"
                  value={props.startItem ?? ''}
                  onChange={(e) => handlePropChange('startItem', e.target.value === '' ? '' : Number(e.target.value))}
                  min={1}
                  placeholder="1 (default)"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs font-mono outline-none"
                />
                <p className="text-[9px] text-gray-500 mt-0.5">E.g. 5 starts at 5th element</p>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-400 mb-1">
                  Start Index (0-based)
                </label>
                <input
                  type="number"
                  value={props.startIndex ?? ''}
                  onChange={(e) => handlePropChange('startIndex', e.target.value === '' ? '' : Number(e.target.value))}
                  min={0}
                  placeholder="0 (default)"
                  className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] text-xs font-mono outline-none"
                />
                <p className="text-[9px] text-gray-500 mt-0.5">E.g. 4 is equivalent to #5</p>
              </div>
            </div>
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
          <TransformProperties
            selectedNode={selectedNode}
            onPropChange={handlePropChange}
          />
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

        {/* Watch Telegram Updates Node */}
        {selectedNode.data.type === 'telegram_watch' && (
          <div className="space-y-3">
            {/* Header info card */}
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-blue-400">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>Telegram Live Message Watcher</span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Waits for incoming messages sent to your Telegram bot. When a message arrives, it extracts the chat ID, message text, sender details, and raw update into variables to trigger downstream actions.
              </p>
            </div>

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
                    if (match?.defaultChatId && !props.allowedChatId) handlePropChange('allowedChatId', match.defaultChatId);
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
                            defaultChatId: props.allowedChatId,
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

            {/* Filter by Chat ID */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Filter by Chat ID (Optional)</label>
                <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>
              <input
                type="text"
                value={props.allowedChatId || ''}
                onChange={(e) => handlePropChange('allowedChatId', e.target.value)}
                placeholder="Leave blank for any chat, or -100123456789 / @channel"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                If specified, only messages originating from this chat/user ID will trigger the node.
              </p>
            </div>

            {/* Timeout & Polling Interval */}
            {/* Timeout & Unlimited Wait Controls */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Waiting Timeout & Duration</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!props.unlimitedTimeout}
                    onChange={(e) => handlePropChange('unlimitedTimeout', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                  />
                  <span className="text-[11px] font-medium">Remove Timer (Unlimited Time)</span>
                </label>
              </div>

              {!props.unlimitedTimeout ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Timeout (seconds)</label>
                    <input
                      type="number"
                      min="5"
                      max="86400"
                      value={props.timeoutSeconds !== undefined ? props.timeoutSeconds : 60}
                      onChange={(e) => handlePropChange('timeoutSeconds', Math.max(5, parseInt(e.target.value) || 60))}
                      className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Poll Interval (ms)</label>
                    <input
                      type="number"
                      min="500"
                      max="10000"
                      step="500"
                      value={props.pollIntervalMs !== undefined ? props.pollIntervalMs : 2000}
                      onChange={(e) => handlePropChange('pollIntervalMs', Math.max(500, parseInt(e.target.value) || 2000))}
                      className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed">
                  Timer removed: The node will wait indefinitely for incoming Telegram messages without timing out or erroring.
                </div>
              )}
            </div>

            {/* Recurring / Continuous Listening Mode */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Recurring / Continuous Listening</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-indigo-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!props.recurring}
                    onChange={(e) => handlePropChange('recurring', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                  />
                  <span className="text-[11px] font-medium">Enable Recurring Loop</span>
                </label>
              </div>

              {props.recurring && (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Watches continuously for each incoming message. Downstream nodes will execute for each received message, then loop back to listen again.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-0.5">Max Messages (0 = unlimited)</label>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={props.maxIterations !== undefined ? props.maxIterations : 0}
                        onChange={(e) => handlePropChange('maxIterations', Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-0.5">Delay Between Checks (ms)</label>
                      <input
                        type="number"
                        min="100"
                        max="60000"
                        step="500"
                        value={props.delayBetweenMs !== undefined ? props.delayBetweenMs : 1000}
                        onChange={(e) => handlePropChange('delayBetweenMs', Math.max(100, parseInt(e.target.value) || 1000))}
                        className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Checkbox Options */}
            <div className="pt-2 border-t border-[#1c2230] space-y-2">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.onlyNewMessages !== false}
                  onChange={(e) => handlePropChange('onlyNewMessages', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px]">Only New Messages (ignore old unread updates prior to node start)</span>
              </label>

              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.markAsRead !== false}
                  onChange={(e) => handlePropChange('markAsRead', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px]">Advance Offset (mark update as received so it won&apos;t repeat)</span>
              </label>
            </div>

            {/* Output Variables Configuration */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2.5">
              <div className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Extracted Variables Mapping</span>
              </div>

              <div>
                <label className="block text-[10px] text-gray-400 mb-0.5">Message Text Variable</label>
                <input
                  type="text"
                  value={props.textVariable || 'telegramMessage'}
                  onChange={(e) => handlePropChange('textVariable', e.target.value)}
                  placeholder="telegramMessage"
                  className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Chat ID Variable</label>
                  <input
                    type="text"
                    value={props.chatIdVariable || 'telegramChatId'}
                    onChange={(e) => handlePropChange('chatIdVariable', e.target.value)}
                    placeholder="telegramChatId"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Sender Username</label>
                  <input
                    type="text"
                    value={props.senderUsernameVariable || 'telegramUsername'}
                    onChange={(e) => handlePropChange('senderUsernameVariable', e.target.value)}
                    placeholder="telegramUsername"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Sender Full Name</label>
                  <input
                    type="text"
                    value={props.senderNameVariable || 'telegramSenderName'}
                    onChange={(e) => handlePropChange('senderNameVariable', e.target.value)}
                    placeholder="telegramSenderName"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Raw Update JSON</label>
                  <input
                    type="text"
                    value={props.rawUpdateVariable || 'telegramUpdate'}
                    onChange={(e) => handlePropChange('rawUpdateVariable', e.target.value)}
                    placeholder="telegramUpdate"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Live Status or Last Received Message Preview */}
            {(() => {
              const liveMsg =
                runtimeState?.output ||
                (props.textVariable && variables[props.textVariable]) ||
                (props.outputVariable && variables[props.outputVariable]);
              const detail =
                runtimeState?.dynamicState?.detail ||
                (props.chatIdVariable && variables[props.chatIdVariable]
                  ? `From ${variables[props.senderNameVariable || 'telegramSenderName'] || variables[props.senderUsernameVariable || 'telegramUsername'] || 'Chat'} (${variables[props.chatIdVariable]})`
                  : undefined);

              if (!liveMsg) return null;

              return (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> Message Received
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          typeof liveMsg === 'object' ? JSON.stringify(liveMsg, null, 2) : String(liveMsg)
                        );
                      }}
                      className="text-[10px] text-emerald-400/80 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <Copy className="w-2.5 h-2.5" /> Copy Text
                    </button>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-emerald-500/20 text-xs font-mono text-emerald-200 break-words max-h-32 overflow-y-auto">
                    {typeof liveMsg === 'object' ? JSON.stringify(liveMsg, null, 2) : String(liveMsg)}
                  </div>
                  {detail && (
                    <p className="text-[10px] text-gray-400 font-mono">
                      {detail}
                    </p>
                  )}
                </div>
              );
            })()}
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

        {/* Watch Discord Updates Node */}
        {selectedNode.data.type === 'discord_watch' && (
          <div className="space-y-3">
            {/* Header info card */}
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-400">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>Discord Live Message Watcher</span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Listens for incoming messages in a Discord channel via your Discord Bot. When a message is posted, it extracts author, content, channel ID, attachments, and raw JSON into variables.
              </p>
            </div>

            {/* Account / Credential Selector */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Discord Bot Account</span>
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
                    if (match?.botToken) handlePropChange('botToken', match.botToken);
                    if (match?.channelId && !props.channelId) handlePropChange('channelId', match.channelId);
                  }
                }}
                className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
              >
                <option value="">Manual / Custom Credentials</option>
                {savedDiscordCreds.map((cred) => (
                  <option key={cred.id} value={cred.id}>
                    Saved: {cred.name} ({cred.mode === 'bot' ? 'Bot Token' : 'Webhook'})
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
                      placeholder="Discord Bot Token or {{discordToken}}"
                      className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Obtain from the <span className="text-gray-300">Discord Developer Portal</span> under Bot &gt; Token.
                    </p>
                  </div>

                  {props.botToken && (
                    <button
                      type="button"
                      onClick={async () => {
                        const accountName = prompt('Enter a name for this Discord account:', 'My Discord Bot');
                        if (accountName) {
                          const saved = await saveCredential({
                            platform: 'discord',
                            name: accountName,
                            mode: 'bot',
                            botToken: props.botToken,
                            channelId: props.channelId,
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

            {/* Channel ID */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Discord Channel ID</label>
                <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>
              <input
                type="text"
                value={props.channelId || ''}
                onChange={(e) => handlePropChange('channelId', e.target.value)}
                placeholder="123456789012345678 or {{channelId}}"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Right-click the Discord channel with Developer Mode enabled and click &ldquo;Copy Channel ID&rdquo;.
              </p>
            </div>

            {/* Filter by User ID */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Filter by User ID / Username (Optional)</label>
                <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>
              <input
                type="text"
                value={props.allowedUserId || ''}
                onChange={(e) => handlePropChange('allowedUserId', e.target.value)}
                placeholder="Leave blank for any user, or user_id / username"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
            </div>

            {/* Timeout & Unlimited Wait Controls */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Waiting Timeout & Duration</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!props.unlimitedTimeout}
                    onChange={(e) => handlePropChange('unlimitedTimeout', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                  />
                  <span className="text-[11px] font-medium">Remove Timer (Unlimited Time)</span>
                </label>
              </div>

              {!props.unlimitedTimeout ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Timeout (seconds)</label>
                    <input
                      type="number"
                      min="5"
                      max="86400"
                      value={props.timeoutSeconds !== undefined ? props.timeoutSeconds : 60}
                      onChange={(e) => handlePropChange('timeoutSeconds', Math.max(5, parseInt(e.target.value) || 60))}
                      className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Poll Interval (ms)</label>
                    <input
                      type="number"
                      min="500"
                      max="10000"
                      step="500"
                      value={props.pollIntervalMs !== undefined ? props.pollIntervalMs : 2000}
                      onChange={(e) => handlePropChange('pollIntervalMs', Math.max(500, parseInt(e.target.value) || 2000))}
                      className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed">
                  Timer removed: The node will wait indefinitely for incoming Discord messages without timing out or erroring.
                </div>
              )}
            </div>

            {/* Recurring / Continuous Listening Mode */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Recurring / Continuous Listening</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-indigo-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!props.recurring}
                    onChange={(e) => handlePropChange('recurring', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                  />
                  <span className="text-[11px] font-medium">Enable Recurring Loop</span>
                </label>
              </div>

              {props.recurring && (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Watches continuously for each incoming Discord message. Downstream nodes will execute for each message, then loop back to listen again.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-0.5">Max Messages (0 = unlimited)</label>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={props.maxIterations !== undefined ? props.maxIterations : 0}
                        onChange={(e) => handlePropChange('maxIterations', Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-0.5">Delay Between Checks (ms)</label>
                      <input
                        type="number"
                        min="100"
                        max="60000"
                        step="500"
                        value={props.delayBetweenMs !== undefined ? props.delayBetweenMs : 1000}
                        onChange={(e) => handlePropChange('delayBetweenMs', Math.max(100, parseInt(e.target.value) || 1000))}
                        className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Checkbox Options */}
            <div className="pt-2 border-t border-[#1c2230] space-y-2">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.onlyNewMessages !== false}
                  onChange={(e) => handlePropChange('onlyNewMessages', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px]">Only New Messages (ignore messages prior to node start)</span>
              </label>

              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.ignoreBots !== false}
                  onChange={(e) => handlePropChange('ignoreBots', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px]">Ignore Bot Messages (prevent infinite feedback loops)</span>
              </label>
            </div>

            {/* Output Variables Configuration */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2.5">
              <div className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Extracted Variables Mapping</span>
              </div>

              <div>
                <label className="block text-[10px] text-gray-400 mb-0.5">Message Content Variable</label>
                <input
                  type="text"
                  value={props.textVariable || 'discordMessage'}
                  onChange={(e) => handlePropChange('textVariable', e.target.value)}
                  placeholder="discordMessage"
                  className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Author Username</label>
                  <input
                    type="text"
                    value={props.authorVariable || 'discordUsername'}
                    onChange={(e) => handlePropChange('authorVariable', e.target.value)}
                    placeholder="discordUsername"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Author Display Name</label>
                  <input
                    type="text"
                    value={props.senderNameVariable || 'discordSenderName'}
                    onChange={(e) => handlePropChange('senderNameVariable', e.target.value)}
                    placeholder="discordSenderName"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Author ID</label>
                  <input
                    type="text"
                    value={props.authorIdVariable || 'discordAuthorId'}
                    onChange={(e) => handlePropChange('authorIdVariable', e.target.value)}
                    placeholder="discordAuthorId"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Channel ID Variable</label>
                  <input
                    type="text"
                    value={props.channelIdVariable || 'discordChannelId'}
                    onChange={(e) => handlePropChange('channelIdVariable', e.target.value)}
                    placeholder="discordChannelId"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Attachment / Image URL</label>
                  <input
                    type="text"
                    value={props.attachmentUrlVariable || 'discordAttachmentUrl'}
                    onChange={(e) => handlePropChange('attachmentUrlVariable', e.target.value)}
                    placeholder="discordAttachmentUrl"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Raw Message JSON</label>
                  <input
                    type="text"
                    value={props.rawUpdateVariable || 'discordUpdate'}
                    onChange={(e) => handlePropChange('rawUpdateVariable', e.target.value)}
                    placeholder="discordUpdate"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Live Status or Last Received Message Preview */}
            {(() => {
              const liveMsg =
                runtimeState?.output ||
                (props.textVariable && variables[props.textVariable]) ||
                (props.outputVariable && variables[props.outputVariable]);
              const detail =
                runtimeState?.dynamicState?.detail ||
                (props.channelIdVariable && variables[props.channelIdVariable]
                  ? `From ${variables[props.senderNameVariable || 'discordSenderName'] || variables[props.authorVariable || 'discordUsername'] || 'User'} in #${variables[props.channelIdVariable]}`
                  : undefined);

              if (!liveMsg) return null;

              return (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> Discord Message Received
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          typeof liveMsg === 'object' ? JSON.stringify(liveMsg, null, 2) : String(liveMsg)
                        );
                      }}
                      className="text-[10px] text-emerald-400/80 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <Copy className="w-2.5 h-2.5" /> Copy Text
                    </button>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-emerald-500/20 text-xs font-mono text-emerald-200 break-words max-h-32 overflow-y-auto">
                    {typeof liveMsg === 'object' ? JSON.stringify(liveMsg, null, 2) : String(liveMsg)}
                  </div>
                  {detail && (
                    <p className="text-[10px] text-gray-400 font-mono">
                      {detail}
                    </p>
                  )}
                </div>
              );
            })()}
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

        {/* Watch Slack Updates Node */}
        {selectedNode.data.type === 'slack_watch' && (
          <div className="space-y-3">
            {/* Header info card */}
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>Slack Live Message Watcher</span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Listens for incoming messages in a Slack channel using your Slack Bot Token. When a message is posted, it extracts sender, text, channel ID, timestamp, and raw JSON into variables.
              </p>
            </div>

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
                    if (match?.botToken) handlePropChange('botToken', match.botToken);
                    if (match?.channel && !props.channel) handlePropChange('channel', match.channel);
                  }
                }}
                className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
              >
                <option value="">Manual / Custom Credentials</option>
                {savedSlackCreds.map((cred) => (
                  <option key={cred.id} value={cred.id}>
                    Saved: {cred.name} ({cred.mode === 'bot' ? 'Bot OAuth Token' : 'Webhook'})
                  </option>
                ))}
              </select>

              {(!props.credentialId || props.credentialId === '') && (
                <div className="space-y-2 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-gray-400">Slack Bot User OAuth Token</label>
                      <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                    </div>
                    <input
                      type="password"
                      value={props.botToken || ''}
                      onChange={(e) => handlePropChange('botToken', e.target.value)}
                      placeholder="xoxb-1234567890-..."
                      className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Requires <span className="text-gray-300 font-mono">channels:history</span> scope in your Slack App OAuth permissions.
                    </p>
                  </div>

                  {props.botToken && (
                    <button
                      type="button"
                      onClick={async () => {
                        const accountName = prompt('Enter a name for this Slack account:', 'My Slack Workspace');
                        if (accountName) {
                          const saved = await saveCredential({
                            platform: 'slack',
                            name: accountName,
                            mode: 'bot',
                            botToken: props.botToken,
                            channel: props.channel,
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

            {/* Channel */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Slack Channel (ID or Name)</label>
                <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>
              <input
                type="text"
                value={props.channel || ''}
                onChange={(e) => handlePropChange('channel', e.target.value)}
                placeholder="C0123456789, #general, or {{slackChannel}}"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Channel ID (e.g. C0123456789) is recommended. To get it, right-click channel name in Slack &gt; Copy link &gt; extract the ID at end of link.
              </p>
            </div>

            {/* Filter by User ID */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-400">Filter by Sender User ID (Optional)</label>
                <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>
              <input
                type="text"
                value={props.allowedUserId || ''}
                onChange={(e) => handlePropChange('allowedUserId', e.target.value)}
                placeholder="Leave blank for any user, or U01234567"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
            </div>

            {/* Timeout & Unlimited Wait Controls */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Waiting Timeout & Duration</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!props.unlimitedTimeout}
                    onChange={(e) => handlePropChange('unlimitedTimeout', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                  />
                  <span className="text-[11px] font-medium">Remove Timer (Unlimited Time)</span>
                </label>
              </div>

              {!props.unlimitedTimeout ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Timeout (seconds)</label>
                    <input
                      type="number"
                      min="5"
                      max="86400"
                      value={props.timeoutSeconds !== undefined ? props.timeoutSeconds : 60}
                      onChange={(e) => handlePropChange('timeoutSeconds', Math.max(5, parseInt(e.target.value) || 60))}
                      className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Poll Interval (ms)</label>
                    <input
                      type="number"
                      min="500"
                      max="10000"
                      step="500"
                      value={props.pollIntervalMs !== undefined ? props.pollIntervalMs : 2000}
                      onChange={(e) => handlePropChange('pollIntervalMs', Math.max(500, parseInt(e.target.value) || 2000))}
                      className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed">
                  Timer removed: The node will wait indefinitely for incoming Slack messages without timing out or erroring.
                </div>
              )}
            </div>

            {/* Recurring / Continuous Listening Mode */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Recurring / Continuous Listening</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-indigo-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!props.recurring}
                    onChange={(e) => handlePropChange('recurring', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                  />
                  <span className="text-[11px] font-medium">Enable Recurring Loop</span>
                </label>
              </div>

              {props.recurring && (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Watches continuously for each incoming Slack message. Downstream nodes will execute for each message, then loop back to listen again.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-0.5">Max Messages (0 = unlimited)</label>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={props.maxIterations !== undefined ? props.maxIterations : 0}
                        onChange={(e) => handlePropChange('maxIterations', Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-0.5">Delay Between Checks (ms)</label>
                      <input
                        type="number"
                        min="100"
                        max="60000"
                        step="500"
                        value={props.delayBetweenMs !== undefined ? props.delayBetweenMs : 1000}
                        onChange={(e) => handlePropChange('delayBetweenMs', Math.max(100, parseInt(e.target.value) || 1000))}
                        className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Checkbox Options */}
            <div className="pt-2 border-t border-[#1c2230] space-y-2">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.onlyNewMessages !== false}
                  onChange={(e) => handlePropChange('onlyNewMessages', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px]">Only New Messages (ignore messages prior to node start)</span>
              </label>

              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.ignoreBots !== false}
                  onChange={(e) => handlePropChange('ignoreBots', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600"
                />
                <span className="text-[11px]">Ignore Bot Messages (prevent infinite feedback loops)</span>
              </label>
            </div>

            {/* Output Variables Configuration */}
            <div className="p-2.5 rounded-lg bg-[#11141c] border border-[#1c2230] space-y-2.5">
              <div className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Extracted Variables Mapping</span>
              </div>

              <div>
                <label className="block text-[10px] text-gray-400 mb-0.5">Message Content Variable</label>
                <input
                  type="text"
                  value={props.textVariable || 'slackMessage'}
                  onChange={(e) => handlePropChange('textVariable', e.target.value)}
                  placeholder="slackMessage"
                  className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Sender User ID Variable</label>
                  <input
                    type="text"
                    value={props.userIdVariable || 'slackUserId'}
                    onChange={(e) => handlePropChange('userIdVariable', e.target.value)}
                    placeholder="slackUserId"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Channel Variable</label>
                  <input
                    type="text"
                    value={props.channelVariable || 'slackChannel'}
                    onChange={(e) => handlePropChange('channelVariable', e.target.value)}
                    placeholder="slackChannel"
                    className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-gray-400 mb-0.5">Timestamp (ts) Variable</label>
                <input
                  type="text"
                  value={props.timestampVariable || 'slackTimestamp'}
                  onChange={(e) => handlePropChange('timestampVariable', e.target.value)}
                  placeholder="slackTimestamp"
                  className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] text-gray-400 mb-0.5">Raw Update JSON</label>
                <input
                  type="text"
                  value={props.rawUpdateVariable || 'slackUpdate'}
                  onChange={(e) => handlePropChange('rawUpdateVariable', e.target.value)}
                  placeholder="slackUpdate"
                  className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] focus:border-indigo-500 outline-none font-mono text-xs"
                />
              </div>
            </div>

            {/* Live Status or Last Received Message Preview */}
            {(() => {
              const liveMsg =
                runtimeState?.output ||
                (props.textVariable && variables[props.textVariable]) ||
                (props.outputVariable && variables[props.outputVariable]);
              const detail =
                runtimeState?.dynamicState?.detail ||
                (props.channelVariable && variables[props.channelVariable]
                  ? `From ${variables[props.userIdVariable || 'slackUserId'] || 'User'} in ${variables[props.channelVariable]}`
                  : undefined);

              if (!liveMsg) return null;

              return (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> Slack Message Received
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          typeof liveMsg === 'object' ? JSON.stringify(liveMsg, null, 2) : String(liveMsg)
                        );
                      }}
                      className="text-[10px] text-emerald-400/80 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <Copy className="w-2.5 h-2.5" /> Copy Text
                    </button>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-emerald-500/20 text-xs font-mono text-emerald-200 break-words max-h-32 overflow-y-auto">
                    {typeof liveMsg === 'object' ? JSON.stringify(liveMsg, null, 2) : String(liveMsg)}
                  </div>
                  {detail && (
                    <p className="text-[10px] text-gray-400 font-mono">
                      {detail}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Combine Datasets Node */}
        {selectedNode.data.type === 'combine_datasets' && (
          <div className="space-y-4 pt-2 border-t border-[#1c2230]">
            {/* Header description banner */}
            <div className="p-2.5 rounded-xl bg-gradient-to-r from-pink-500/10 via-rose-500/5 to-transparent border border-pink-500/20">
              <div className="flex items-center gap-2 text-pink-400 font-semibold text-xs mb-1">
                <Layers className="w-4 h-4" />
                <span>Multi-Source Schema & Product Combiner</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Merge multiple scrapes and schemas with column alignment, custom aliasing, and duplicate resolution.
              </p>
            </div>

            {/* Schema Alignment Mode Tabs */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Schema Alignment Mode
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433] text-[10px]">
                {[
                  { id: 'union', label: 'Full Union', sub: 'Outer Join' },
                  { id: 'intersection', label: 'Intersection', sub: 'Inner Join' },
                  { id: 'key_join', label: 'Key Join', sub: 'Merge by Key' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handlePropChange('mode', m.id)}
                    className={`py-1.5 px-1.5 text-center rounded-lg font-medium transition-all ${
                      (props.mode || 'union') === m.id
                        ? 'bg-pink-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                    }`}
                  >
                    <div>{m.label}</div>
                    <div className="text-[8px] opacity-75">{m.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Primary Key for Key Join */}
            {props.mode === 'key_join' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Primary Match Key</label>
                <input
                  type="text"
                  value={props.primaryKey || 'title'}
                  onChange={(e) => handlePropChange('primaryKey', e.target.value)}
                  placeholder="e.g. title, sku, url"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none font-mono text-xs"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Rows from different sources with the same primary key will be merged into a single record.
                </p>
              </div>
            )}

            {/* Source Data Mode */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Dataset Source
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433] text-[10px]">
                <button
                  type="button"
                  onClick={() => handlePropChange('sourceMode', 'incoming_edges')}
                  className={`py-1.5 px-2 text-center rounded-lg font-medium transition-all ${
                    (props.sourceMode || 'incoming_edges') === 'incoming_edges'
                      ? 'bg-pink-600 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                  }`}
                >
                  Canvas Predecessors
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange('sourceMode', 'variables')}
                  className={`py-1.5 px-2 text-center rounded-lg font-medium transition-all ${
                    props.sourceMode === 'variables'
                      ? 'bg-pink-600 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                  }`}
                >
                  From Variables
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                {(props.sourceMode || 'incoming_edges') === 'incoming_edges'
                  ? 'Connect scrape or extract nodes directly into this node on the canvas. Execution engine synchronizes all branches before combining.'
                  : 'Specify the variable names that hold the extracted arrays.'}
              </p>
            </div>

            {/* Source Variables List when in variables mode */}
            {props.sourceMode === 'variables' && (
              <div className="p-2.5 rounded-xl bg-[#0e121a] border border-[#1e2433] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-gray-300">Source Variable Names</label>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Array.isArray(props.sourceVariables) ? [...props.sourceVariables] : ['scrapedProducts1'];
                      cur.push(`scrapedProducts${cur.length + 1}`);
                      handlePropChange('sourceVariables', cur);
                    }}
                    className="text-[10px] text-pink-400 hover:text-pink-300 flex items-center gap-1"
                  >
                    <Plus className="w-2.5 h-2.5" /> Add Variable
                  </button>
                </div>
                {(Array.isArray(props.sourceVariables) ? props.sourceVariables : ['scrapedProducts1', 'scrapedProducts2']).map((varName: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={varName}
                      onChange={(e) => {
                        const cur = [...(props.sourceVariables || [])];
                        cur[idx] = e.target.value;
                        handlePropChange('sourceVariables', cur);
                      }}
                      placeholder={`e.g. scrapedProducts${idx + 1}`}
                      className="flex-1 bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cur = (props.sourceVariables || []).filter((_: any, i: number) => i !== idx);
                        handlePropChange('sourceVariables', cur);
                      }}
                      className="p-1.5 text-gray-500 hover:text-rose-400 rounded hover:bg-[#1f2638]"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Deduplication Card */}
            <div className="p-3 rounded-xl bg-[#0e121a] border border-[#1e2433] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-pink-400" />
                  <span>Intelligent Deduplication</span>
                </label>
                <input
                  type="checkbox"
                  checked={props.deduplicate !== false}
                  onChange={(e) => handlePropChange('deduplicate', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-pink-600 focus:ring-0 cursor-pointer"
                />
              </div>

              {props.deduplicate !== false && (
                <div className="space-y-3 pt-1 border-t border-[#1a2030]">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Resolution Strategy</label>
                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                      {[
                        { id: 'merge_coalesce', label: 'Merge & Fill Gaps', desc: 'Coalesce fields' },
                        { id: 'highest_completeness', label: 'Highest Completeness', desc: 'Row with most data' },
                        { id: 'keep_first', label: 'Keep First', desc: 'Earliest source' },
                        { id: 'keep_last', label: 'Keep Last', desc: 'Latest source' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handlePropChange('dedupStrategy', s.id)}
                          className={`p-2 rounded-lg border text-left transition-all ${
                            (props.dedupStrategy || 'merge_coalesce') === s.id
                              ? 'bg-pink-950/40 border-pink-500/50 text-pink-200'
                              : 'bg-[#141824] border-[#1e2433] text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          <div className="font-medium text-[10px]">{s.label}</div>
                          <div className="text-[9px] opacity-70 mt-0.5">{s.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Deduplication Keys (Optional)</label>
                    <input
                      type="text"
                      value={Array.isArray(props.dedupKeys) ? props.dedupKeys.join(', ') : (props.dedupKeys || '')}
                      onChange={(e) => {
                        const val = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                        handlePropChange('dedupKeys', val);
                      }}
                      placeholder="e.g. title, url (leave empty for full-row match)"
                      className="w-full bg-[#141824] text-white p-1.5 rounded border border-[#232a3b] outline-none font-mono text-[11px]"
                    />
                    <p className="text-[9px] text-gray-500 mt-0.5">
                      Columns to evaluate for matching duplicate items. Empty matches all common keys.
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={props.normalizeUrls !== false}
                        onChange={(e) => handlePropChange('normalizeUrls', e.target.checked)}
                        className="rounded bg-[#161a24] border-[#232a3b] text-pink-600 focus:ring-0"
                      />
                      <span className="text-[10px]">Normalize URLs (strip tracking & query parameters)</span>
                    </label>
                    <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!props.caseSensitive}
                        onChange={(e) => handlePropChange('caseSensitive', e.target.checked)}
                        className="rounded bg-[#161a24] border-[#232a3b] text-pink-600 focus:ring-0"
                      />
                      <span className="text-[10px]">Case-sensitive text comparison</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Column Aliasing / Renaming Table */}
            <div className="p-3 rounded-xl bg-[#0e121a] border border-[#1e2433] space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-gray-300">Column Mapping / Aliasing</div>
                  <div className="text-[10px] text-gray-500">Unify mismatched column names (e.g. product_name &#8594; title)</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const cur = Array.isArray(props.columnMappings) ? [...props.columnMappings] : [];
                    cur.push({ sourceColumn: '', targetColumn: '' });
                    handlePropChange('columnMappings', cur);
                  }}
                  className="px-2 py-1 rounded bg-pink-600/20 hover:bg-pink-600/30 text-pink-300 border border-pink-500/30 text-[10px] font-medium flex items-center gap-1"
                >
                  <Plus className="w-2.5 h-2.5" /> Map Column
                </button>
              </div>

              {(Array.isArray(props.columnMappings) && props.columnMappings.length > 0) ? (
                <div className="space-y-1.5 pt-1">
                  {props.columnMappings.map((map: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={map.sourceColumn || ''}
                        onChange={(e) => {
                          const cur = [...props.columnMappings];
                          cur[idx] = { ...cur[idx], sourceColumn: e.target.value };
                          handlePropChange('columnMappings', cur);
                        }}
                        placeholder="Source column"
                        className="w-1/2 bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none font-mono text-[11px]"
                      />
                      <span className="text-gray-500 text-xs">&#8594;</span>
                      <input
                        type="text"
                        value={map.targetColumn || ''}
                        onChange={(e) => {
                          const cur = [...props.columnMappings];
                          cur[idx] = { ...cur[idx], targetColumn: e.target.value };
                          handlePropChange('columnMappings', cur);
                        }}
                        placeholder="Unified column"
                        className="w-1/2 bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const cur = props.columnMappings.filter((_: any, i: number) => i !== idx);
                          handlePropChange('columnMappings', cur);
                        }}
                        className="p-1 text-gray-500 hover:text-rose-400 rounded hover:bg-[#1f2638]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-gray-500 italic py-1">
                  No manual mappings. Columns with identical names are merged automatically.
                </div>
              )}
            </div>

            {/* Source Tag Column */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.addSourceColumn !== false}
                  onChange={(e) => handlePropChange('addSourceColumn', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-pink-600 focus:ring-0"
                />
                <span className="text-[11px] font-medium">Add source dataset tracking column</span>
              </label>

              {props.addSourceColumn !== false && (
                <div className="pl-5">
                  <input
                    type="text"
                    value={props.sourceColumnName || '_source'}
                    onChange={(e) => handlePropChange('sourceColumnName', e.target.value)}
                    placeholder="_source"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] outline-none font-mono text-[11px]"
                  />
                </div>
              )}
            </div>

            {/* Output Variable */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Combined Output Variable</label>
              <input
                type="text"
                value={props.outputVariable || 'combinedDataset'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="combinedDataset"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-pink-500 outline-none font-mono text-xs"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Merged array accessible as <code className="text-pink-400 font-mono">&#123;&#123;{props.outputVariable || 'combinedDataset'}&#125;&#125;</code>, row count as <code className="text-pink-400 font-mono">&#123;&#123;{props.outputVariable || 'combinedDataset'}_count&#125;&#125;</code>.
              </p>
            </div>
          </div>
        )}

        {/* Async Parallel Node */}
        {selectedNode.data.type === 'async_parallel' && (
          <div className="space-y-4 pt-2 border-t border-[#1c2230]">
            {/* Header description banner */}
            <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/20">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-1">
                <Zap className="w-4 h-4" />
                <span>Concurrent Async Parallel Orchestrator</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Execute multiple workflow branches simultaneously with concurrency limits, error tolerance, and variable merging.
              </p>
            </div>

            {/* Execution Mode Tabs */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Parallel Execution Mode
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433] text-[10px]">
                {[
                  { id: 'all', label: 'Promise.all', sub: 'Strict All' },
                  { id: 'settled', label: 'All Settled', sub: 'Error Tolerant' },
                  { id: 'race', label: 'Race', sub: 'First Finished' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handlePropChange('mode', m.id)}
                    className={`py-1.5 px-1.5 text-center rounded-lg font-medium transition-all ${
                      (props.mode || 'all') === m.id
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                    }`}
                  >
                    <div>{m.label}</div>
                    <div className="text-[8px] opacity-75">{m.sub}</div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                {(props.mode || 'all') === 'all' && 'All branches execute concurrently. If any fails, the node stops immediately.'}
                {props.mode === 'settled' && 'Runs all branches to completion regardless of individual errors. Captures successes and failures.'}
                {props.mode === 'race' && 'The first branch to complete sets the result. Slow branches are ignored.'}
              </p>
            </div>

            {/* Branch Lanes Configuration */}
            <div className="p-3 rounded-xl bg-[#0e121a] border border-[#1e2433] space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                    <GitFork className="w-3.5 h-3.5 text-amber-400" />
                    <span>Parallel Branch Lanes</span>
                  </div>
                  <div className="text-[10px] text-gray-500">Each branch creates an outgoing canvas handle</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const cur = Array.isArray(props.branches) ? [...props.branches] : [
                      { id: 'branch_1', name: 'Branch 1' },
                      { id: 'branch_2', name: 'Branch 2' },
                    ];
                    const nextNum = cur.length + 1;
                    cur.push({ id: `branch_${nextNum}`, name: `Branch ${nextNum}` });
                    handlePropChange('branches', cur);
                  }}
                  className="px-2 py-1 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-[10px] font-medium flex items-center gap-1"
                >
                  <Plus className="w-2.5 h-2.5" /> Add Branch
                </button>
              </div>

              <div className="space-y-1.5">
                {(Array.isArray(props.branches) ? props.branches : [
                  { id: 'branch_1', name: 'Branch 1' },
                  { id: 'branch_2', name: 'Branch 2' },
                ]).map((b: any, idx: number, arr: any[]) => (
                  <div key={b.id || idx} className="flex items-center gap-2 bg-[#141824] p-1.5 rounded-lg border border-[#202738]">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <input
                      type="text"
                      value={b.name || ''}
                      onChange={(e) => {
                        const cur = [...arr];
                        cur[idx] = { ...cur[idx], name: e.target.value };
                        handlePropChange('branches', cur);
                      }}
                      placeholder={`Branch ${idx + 1}`}
                      className="flex-1 bg-transparent text-white outline-none font-medium text-xs"
                    />
                    <span className="text-[9px] font-mono text-gray-500">{b.id}</span>
                    {arr.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const cur = arr.filter((_: any, i: number) => i !== idx);
                          handlePropChange('branches', cur);
                        }}
                        className="p-1 text-gray-500 hover:text-rose-400 rounded hover:bg-[#1f2638]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Concurrency Throttling & Timeout */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Concurrency</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={props.maxConcurrency ?? 0}
                  onChange={(e) => handlePropChange('maxConcurrency', Number(e.target.value))}
                  placeholder="0 = Unlimited"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
                />
                <span className="text-[9px] text-gray-500 mt-0.5 block">0 = all at once</span>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Timeout (ms)</label>
                <input
                  type="number"
                  step={1000}
                  min={1000}
                  value={props.timeoutMs ?? 30000}
                  onChange={(e) => handlePropChange('timeoutMs', Number(e.target.value))}
                  placeholder="30000"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
                />
                <span className="text-[9px] text-gray-500 mt-0.5 block">{((props.timeoutMs ?? 30000) / 1000).toFixed(0)}s limit</span>
              </div>
            </div>

            {/* Variable Merge Strategy */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Variable Merge Strategy
              </label>
              <select
                value={props.mergeStrategy || 'merge'}
                onChange={(e) => handlePropChange('mergeStrategy', e.target.value)}
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs"
              >
                <option value="merge">Merge (All branch variables propagate back to workflow context)</option>
                <option value="isolated">Isolated (Branch variables remain isolated; only parallelResults is saved)</option>
                <option value="collect_datasets">Collect Datasets (Aggregates array outputs from all branches into a list)</option>
              </select>
            </div>

            {/* Output Variable */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Results Output Variable</label>
              <input
                type="text"
                value={props.outputVariable || 'parallelResults'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="parallelResults"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-amber-500 outline-none font-mono text-xs"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Contains branch status, outputs, execution timings, and aggregated variables.
              </p>
            </div>
          </div>
        )}

        {/* Generate PDF Document Node */}
        {selectedNode.data.type === 'generate_pdf' && (
          <div className="space-y-4 pt-2 border-t border-[#1c2230]">
            {/* Header description banner */}
            <div className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs mb-1">
                <FileText className="w-4 h-4" />
                <span>Themed Executive PDF Briefing Generator</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Transform extracted data into executive briefings with 6 visual themes, full Markdown formatting, image injection, and AI report synthesis.
              </p>
            </div>

            {/* Theme Picker Cards */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-indigo-400" />
                <span>Visual PDF Theme ({Object.keys(PDF_THEMES).length} curated themes)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(PDF_THEMES).map(([themeKey, tConfig]) => {
                  const isSelected = (props.theme || 'modern_clean') === themeKey;
                  return (
                    <button
                      key={themeKey}
                      type="button"
                      onClick={() => handlePropChange('theme', themeKey)}
                      className={`p-2.5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                        isSelected
                          ? 'bg-[#181d2c] border-indigo-500 ring-1 ring-indigo-500/50 shadow-md'
                          : 'bg-[#11141c] border-[#1c2230] hover:border-gray-700 text-gray-400'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[11px] font-bold ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                          {tConfig.name}
                        </span>
                        <div
                          className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                          style={{ backgroundColor: tConfig.accentColor }}
                          title={`Accent: ${tConfig.accentColor}`}
                        />
                      </div>
                      <p className="text-[9px] text-gray-500 leading-tight mb-2">
                        {tConfig.description}
                      </p>
                      <div className="flex items-center gap-1 pt-1.5 border-t border-[#202738] text-[9px] font-mono text-gray-400">
                        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: tConfig.bgColor }} />
                        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: tConfig.cardBg }} />
                        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: tConfig.accentColor }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AI Report Synthesis Card */}
            <div className="p-3 rounded-xl bg-[#0e121a] border border-[#1e2433] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>AI Executive Briefing Synthesis</span>
                </label>
                <input
                  type="checkbox"
                  checked={!!props.useAi}
                  onChange={(e) => handlePropChange('useAi', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600 focus:ring-0 cursor-pointer"
                />
              </div>

              {props.useAi && (
                <div className="space-y-2.5 pt-1 border-t border-[#1a2030]">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">AI Model</label>
                    <select
                      value={props.aiModel || 'gpt-5.6-sol'}
                      onChange={(e) => handlePropChange('aiModel', e.target.value)}
                      className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
                    >
                      <option value="gpt-5.6-sol">gpt-5.6-sol (ExperientialLabs Virtual Fast)</option>
                      <option value="gpt-5.6-luna">gpt-5.6-luna (ExperientialLabs Virtual Pro)</option>
                      <option value="gpt-4o-mini">gpt-4o-mini (OpenAI Fast)</option>
                      <option value="gpt-4o">gpt-4o (OpenAI Flagship)</option>
                      <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                      {aiAgentModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.name || m.id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">AI Instructions & Data Prompt</label>
                    <textarea
                      rows={3}
                      value={props.aiPrompt || 'Summarize the extracted items in {{combinedDataset}} into a structured executive report with key findings table and strategic insights.'}
                      onChange={(e) => handlePropChange('aiPrompt', e.target.value)}
                      placeholder="e.g. Turn {{combinedDataset}} into a high-level briefing with competitive analysis table..."
                      className="w-full bg-[#161a24] text-white p-2 rounded border border-[#232a3b] outline-none text-xs font-mono"
                    />
                    <p className="text-[9px] text-gray-500 mt-0.5">
                      AI outputs clean Markdown with headings, tables, and callouts directly injected into your PDF.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Document Details (Title, Subtitle, Author) */}
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Document Title</label>
                <input
                  type="text"
                  value={props.title || 'Executive Scrape Briefing'}
                  onChange={(e) => handlePropChange('title', e.target.value)}
                  placeholder="e.g. Market Research Briefing"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] outline-none text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Subtitle</label>
                  <input
                    type="text"
                    value={props.subtitle || ''}
                    onChange={(e) => handlePropChange('subtitle', e.target.value)}
                    placeholder="Multi-Source Intelligence"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Author / Organization</label>
                  <input
                    type="text"
                    value={props.author || 'AutoFlow AI'}
                    onChange={(e) => handlePropChange('author', e.target.value)}
                    placeholder="AutoFlow AI"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] outline-none text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Markdown Content Editor with Snippet Buttons */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-300">Markdown Document Content</label>
                <span className="text-[10px] text-indigo-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
              </div>

              {/* Quick formatting snippets */}
              <div className="flex flex-wrap gap-1">
                {[
                  { label: '+ H2', snippet: '\n## Section Heading\n' },
                  { label: '+ Table', snippet: '\n| Field | Value |\n| --- | --- |\n| Example | Sample |\n' },
                  { label: '+ [!NOTE]', snippet: '\n> [!NOTE]\n> Executive context notes here.\n' },
                  { label: '+ [!TIP]', snippet: '\n> [!TIP]\n> Actionable optimization suggestion.\n' },
                  { label: '+ [!WARNING]', snippet: '\n> [!WARNING]\n> Critical alert or exception.\n' },
                  { label: '+ Page Break', snippet: '\n<!-- pagebreak -->\n' },
                ].map((snip, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => {
                      const cur = props.contentMarkdown || '';
                      handlePropChange('contentMarkdown', cur + snip.snippet);
                    }}
                    className="px-1.5 py-0.5 bg-[#161a24] hover:bg-[#1e2434] text-gray-300 hover:text-white rounded border border-[#232a3b] text-[9px] font-mono transition-colors"
                  >
                    {snip.label}
                  </button>
                ))}
              </div>

              <textarea
                rows={6}
                value={props.contentMarkdown ?? '# Executive Summary\n\nGenerated intelligence report based on extracted dataset.\n\n| Item | Status |\n| --- | --- |\n| Analysis | Completed |'}
                onChange={(e) => handlePropChange('contentMarkdown', e.target.value)}
                placeholder="# Heading 1&#10;&#10;Content paragraphs..."
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none text-xs font-mono leading-relaxed"
              />
            </div>

            {/* Image Injection Manager */}
            <div className="p-3 rounded-xl bg-[#0e121a] border border-[#1e2433] space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Injected Images & Screenshots</span>
                  </div>
                  <div className="text-[10px] text-gray-500">Inject images into cover, header, or article flow</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const cur = Array.isArray(props.images) ? [...props.images] : [];
                    cur.push({ url: '{{screenshotUrl}}', placement: 'inline', caption: '' });
                    handlePropChange('images', cur);
                  }}
                  className="px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[10px] font-medium flex items-center gap-1"
                >
                  <Plus className="w-2.5 h-2.5" /> Add Image
                </button>
              </div>

              {(Array.isArray(props.images) && props.images.length > 0) ? (
                <div className="space-y-2 pt-1">
                  {props.images.map((img: any, idx: number) => (
                    <div key={idx} className="p-2 bg-[#141824] rounded-lg border border-[#202738] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-indigo-400">Image #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = props.images.filter((_: any, i: number) => i !== idx);
                            handlePropChange('images', cur);
                          }}
                          className="p-1 text-gray-500 hover:text-rose-400 rounded hover:bg-[#1f2638]"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={img.url || ''}
                        onChange={(e) => {
                          const cur = [...props.images];
                          cur[idx] = { ...cur[idx], url: e.target.value };
                          handlePropChange('images', cur);
                        }}
                        placeholder="Image URL or {{screenshotUrl}} or storage:myKey"
                        className="w-full bg-[#161a24] text-white p-1 rounded border border-[#232a3b] outline-none font-mono text-[11px]"
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          value={img.placement || 'inline'}
                          onChange={(e) => {
                            const cur = [...props.images];
                            cur[idx] = { ...cur[idx], placement: e.target.value };
                            handlePropChange('images', cur);
                          }}
                          className="bg-[#161a24] text-white p-1 rounded border border-[#232a3b] outline-none text-[10px]"
                        >
                          <option value="inline">Inline (In Document Body)</option>
                          <option value="cover_page">Cover Page (Hero)</option>
                          <option value="header_logo">Header Logo (Top)</option>
                          <option value="gallery_grid">Gallery Grid</option>
                          <option value="footer">Footer Banner</option>
                        </select>
                        <input
                          type="text"
                          value={img.caption || ''}
                          onChange={(e) => {
                            const cur = [...props.images];
                            cur[idx] = { ...cur[idx], caption: e.target.value };
                            handlePropChange('images', cur);
                          }}
                          placeholder="Caption (optional)"
                          className="bg-[#161a24] text-white p-1 rounded border border-[#232a3b] outline-none text-[10px]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-gray-500 italic py-0.5">
                  No images attached yet. Add screenshots or brand logos.
                </div>
              )}
            </div>

            {/* Layout, Download & Storage Options */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Page Format</label>
                  <select
                    value={props.pageSize || 'A4'}
                    onChange={(e) => handlePropChange('pageSize', e.target.value)}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] outline-none text-xs"
                  >
                    <option value="A4">A4 (210 x 297mm)</option>
                    <option value="Letter">US Letter (8.5 x 11in)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Orientation</label>
                  <select
                    value={props.orientation || 'portrait'}
                    onChange={(e) => handlePropChange('orientation', e.target.value)}
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] outline-none text-xs"
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-300">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!props.coverPage}
                    onChange={(e) => handlePropChange('coverPage', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600 focus:ring-0"
                  />
                  <span>Standalone Cover Page</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={props.includePageNumbers !== false}
                    onChange={(e) => handlePropChange('includePageNumbers', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600 focus:ring-0"
                  />
                  <span>Page Numbers</span>
                </label>
              </div>

              <div className="space-y-2 pt-2 border-t border-[#1c2230]">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-300">
                    <input
                      type="checkbox"
                      checked={props.autoDownload !== false}
                      onChange={(e) => handlePropChange('autoDownload', e.target.checked)}
                      className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600 focus:ring-0"
                    />
                    <span>Auto-Download PDF File</span>
                  </label>
                </div>
                {props.autoDownload !== false && (
                  <input
                    type="text"
                    value={props.filename || 'autoflow_report.pdf'}
                    onChange={(e) => handlePropChange('filename', e.target.value)}
                    placeholder="autoflow_report.pdf"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] outline-none font-mono text-xs"
                  />
                )}
              </div>

              <div className="space-y-2 pt-1 border-t border-[#1c2230]">
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-300">
                  <input
                    type="checkbox"
                    checked={!!props.saveToStorage}
                    onChange={(e) => handlePropChange('saveToStorage', e.target.checked)}
                    className="rounded bg-[#161a24] border-[#232a3b] text-indigo-600 focus:ring-0"
                  />
                  <span>Save to Simple Storage (Documents)</span>
                </label>
                {props.saveToStorage && (
                  <input
                    type="text"
                    value={props.storageKey || 'report_pdf'}
                    onChange={(e) => handlePropChange('storageKey', e.target.value)}
                    placeholder="Storage key, e.g. report_pdf"
                    className="w-full bg-[#11141c] text-white p-1.5 rounded border border-[#1c2230] outline-none font-mono text-xs"
                  />
                )}
              </div>
            </div>

            {/* Output Variable */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Output Variable Name</label>
              <input
                type="text"
                value={props.outputVariable || 'generatedPdf'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="generatedPdf"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-indigo-500 outline-none font-mono text-xs"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Contains PDF metadata, data URL for viewing, and byte size.
              </p>
            </div>
          </div>
        )}

        {/* Simple Storage Node */}
        {selectedNode.data.type === 'simple_storage' && (
          <div className="space-y-4 pt-2 border-t border-[#1c2230]">
            {/* Header description banner */}
            <div className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs mb-1">
                <Archive className="w-4 h-4" />
                <span>Universal Simple Storage</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Shared data store for Arrays, Dictionaries, Primitive Variables, Images, and Documents. Accessible by any node via &#123;&#123;key&#125;&#125; or &#123;&#123;storage.key&#125;&#125;.
              </p>
            </div>

            {/* Storage Scope Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Storage Scope
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433] text-[10px]">
                <button
                  type="button"
                  onClick={() => handlePropChange('scope', 'workflow')}
                  className={`py-1.5 px-2 text-center rounded-lg font-medium transition-all ${
                    (props.scope || 'workflow') === 'workflow'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                  }`}
                >
                  Workflow Run (In-Memory)
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange('scope', 'persistent')}
                  className={`py-1.5 px-2 text-center rounded-lg font-medium transition-all ${
                    props.scope === 'persistent'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                  }`}
                >
                  Persistent (Chrome Storage)
                </button>
              </div>
            </div>

            {/* Storage Action Pills */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Storage Action
              </label>
              <div className="grid grid-cols-4 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433] text-[10px]">
                {[
                  { id: 'set', label: 'SET' },
                  { id: 'get', label: 'GET' },
                  { id: 'append', label: 'APPEND' },
                  { id: 'merge', label: 'MERGE' },
                  { id: 'delete', label: 'DELETE' },
                  { id: 'clear', label: 'CLEAR' },
                  { id: 'list', label: 'LIST' },
                ].map((act) => (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => handlePropChange('action', act.id)}
                    className={`py-1.5 px-1 text-center rounded-lg font-bold transition-all ${
                      (props.action || 'set') === act.id
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                    }`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Storage Key */}
            {props.action !== 'clear' && props.action !== 'list' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Storage Key</label>
                <input
                  type="text"
                  value={props.key || 'myItems'}
                  onChange={(e) => handlePropChange('key', e.target.value)}
                  placeholder="e.g. products, myVar, config"
                  className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none font-mono text-xs font-semibold"
                />
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-emerald-400/90 font-mono">
                  <span>Accessible in any node as:</span>
                  <span className="bg-emerald-950/60 px-1 py-0.5 rounded border border-emerald-800/40">
                    &#123;&#123;{props.key || 'myItems'}&#125;&#125;
                  </span>
                </div>
              </div>
            )}

            {/* Entry Type Selector */}
            {['set', 'append', 'merge'].includes(props.action || 'set') && (
              <div>
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Entry Type
                </label>
                <div className="grid grid-cols-5 gap-1 p-1 bg-[#0b0e14] rounded-xl border border-[#1e2433] text-[9px]">
                  {[
                    { id: 'array', label: 'Array', icon: Layers },
                    { id: 'dictionary', label: 'Dictionary', icon: Database },
                    { id: 'variable', label: 'Variable', icon: Key },
                    { id: 'image', label: 'Image', icon: ImageIcon },
                    { id: 'document', label: 'Document', icon: FileText },
                  ].map((t) => {
                    const TIcon = t.icon;
                    const isSelected = (props.entryType || 'array') === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handlePropChange('entryType', t.id)}
                        className={`py-2 px-1 text-center rounded-lg font-medium transition-all flex flex-col items-center gap-1 ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-[#151a26]'
                        }`}
                      >
                        <TIcon className="w-3 h-3" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Value Input depending on Entry Type */}
            {['set', 'append', 'merge'].includes(props.action || 'set') && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-400">
                    {props.entryType === 'array' ? 'Array Value / Variable' :
                     props.entryType === 'dictionary' ? 'Dictionary JSON / Variable' :
                     props.entryType === 'image' ? 'Image URL or Data URL' :
                     props.entryType === 'document' ? 'Document Content / Variable' : 'Variable Value'}
                  </label>
                  <span className="text-[10px] text-teal-400 font-mono">&#123;&#123;var&#125;&#125; supported</span>
                </div>

                {props.entryType === 'variable' ? (
                  <input
                    type="text"
                    value={props.value ?? ''}
                    onChange={(e) => handlePropChange('value', e.target.value)}
                    placeholder="e.g. {{extractedText}} or hello world"
                    className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none text-xs font-mono"
                  />
                ) : (
                  <textarea
                    rows={4}
                    value={props.value ?? (props.entryType === 'array' ? '[]' : props.entryType === 'dictionary' ? '{}' : '')}
                    onChange={(e) => handlePropChange('value', e.target.value)}
                    placeholder={
                      props.entryType === 'array' ? 'e.g. {{scrapedProducts}} or ["item1", "item2"]' :
                      props.entryType === 'dictionary' ? 'e.g. {"status": "success", "count": 10}' :
                      props.entryType === 'image' ? '{{screenshotUrl}} or https://...' :
                      '# Document Content...'
                    }
                    className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none text-xs font-mono leading-relaxed"
                  />
                )}
              </div>
            )}

            {/* AI-Powered Data Assistant */}
            {['set', 'append', 'merge'].includes(props.action || 'set') && (
              <div className="p-2.5 rounded-xl bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-transparent border border-violet-500/20 space-y-2">
                <div className="flex items-center gap-1.5 text-violet-400 font-semibold text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Data Assistant</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Describe what data you need and AI will generate or modify the value for you.
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={aiStoragePrompt}
                    onChange={(e) => { setAiStoragePrompt(e.target.value); setAiStorageError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && aiStoragePrompt.trim() && !aiStorageLoading) {
                        e.preventDefault();
                        (async () => {
                          setAiStorageLoading(true);
                          setAiStorageError(null);
                          try {
                            const entryType = props.entryType || 'array';
                            const currentValue = props.value ?? (entryType === 'array' ? '[]' : entryType === 'dictionary' ? '{}' : '');
                            const systemPrompt = `You are a data generation assistant. The user wants to ${props.action || 'set'} data in a ${entryType} storage.
Current value: ${currentValue}
Rules:
- For arrays: output valid JSON array only (e.g. ["item1", "item2"])
- For dictionaries: output valid JSON object only (e.g. {"key": "value"})
- For variables: output a plain string value
- Output ONLY the raw data, no markdown fences, no explanation, no extra text.
- If the user asks to modify/append to existing data, work with the current value.`;
                            const result = await queryLlm(aiStoragePrompt, systemPrompt);
                            const cleaned = result.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
                            handlePropChange('value', cleaned);
                            setAiStoragePrompt('');
                          } catch (err: any) {
                            setAiStorageError(err.message || 'AI generation failed');
                          } finally {
                            setAiStorageLoading(false);
                          }
                        })();
                      }
                    }}
                    placeholder={
                      (props.entryType || 'array') === 'array' ? 'e.g. "Generate 10 US city names"' :
                      (props.entryType || 'array') === 'dictionary' ? 'e.g. "Create a user profile with name, email, age"' :
                      'e.g. "Generate a greeting message"'
                    }
                    className="flex-1 bg-[#11141c] text-white p-1.5 rounded-lg border border-[#1c2230] focus:border-violet-500 outline-none text-xs"
                    disabled={aiStorageLoading}
                  />
                  <button
                    type="button"
                    disabled={!aiStoragePrompt.trim() || aiStorageLoading}
                    onClick={async () => {
                      setAiStorageLoading(true);
                      setAiStorageError(null);
                      try {
                        const entryType = props.entryType || 'array';
                        const currentValue = props.value ?? (entryType === 'array' ? '[]' : entryType === 'dictionary' ? '{}' : '');
                        const systemPrompt = `You are a data generation assistant. The user wants to ${props.action || 'set'} data in a ${entryType} storage.
Current value: ${currentValue}
Rules:
- For arrays: output valid JSON array only (e.g. ["item1", "item2"])
- For dictionaries: output valid JSON object only (e.g. {"key": "value"})
- For variables: output a plain string value
- Output ONLY the raw data, no markdown fences, no explanation, no extra text.
- If the user asks to modify/append to existing data, work with the current value.`;
                        const result = await queryLlm(aiStoragePrompt, systemPrompt);
                        const cleaned = result.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
                        handlePropChange('value', cleaned);
                        setAiStoragePrompt('');
                      } catch (err: any) {
                        setAiStorageError(err.message || 'AI generation failed');
                      } finally {
                        setAiStorageLoading(false);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
                  >
                    {aiStorageLoading ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
                    ) : (
                      <><Sparkles className="w-3 h-3" /> Generate</>
                    )}
                  </button>
                </div>
                {aiStorageError && (
                  <div className="text-[10px] text-rose-400 bg-rose-950/40 px-2 py-1 rounded border border-rose-800/40">
                    {aiStorageError}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {(props.entryType || 'array') === 'array' && (
                    <>
                      <button type="button" onClick={() => setAiStoragePrompt('Generate 5 sample product names')} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/30 hover:bg-violet-900/60">Products</button>
                      <button type="button" onClick={() => setAiStoragePrompt('Generate 10 random email addresses')} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/30 hover:bg-violet-900/60">Emails</button>
                      <button type="button" onClick={() => setAiStoragePrompt('Add 3 more items to the existing array')} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/30 hover:bg-violet-900/60">Extend</button>
                    </>
                  )}
                  {(props.entryType || 'array') === 'dictionary' && (
                    <>
                      <button type="button" onClick={() => setAiStoragePrompt('Create a user profile with name, email, age, and role')} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/30 hover:bg-violet-900/60">User Profile</button>
                      <button type="button" onClick={() => setAiStoragePrompt('Create app config with theme, language, and notification settings')} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/30 hover:bg-violet-900/60">Config</button>
                    </>
                  )}
                  {props.entryType === 'variable' && (
                    <button type="button" onClick={() => setAiStoragePrompt('Generate a professional greeting message')} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/30 hover:bg-violet-900/60">Greeting</button>
                  )}
                </div>
              </div>
            )}

            {/* Merge Deep Toggle */}
            {props.action === 'merge' && props.entryType === 'dictionary' && (
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.deepMerge !== false}
                  onChange={(e) => handlePropChange('deepMerge', e.target.checked)}
                  className="rounded bg-[#161a24] border-[#232a3b] text-emerald-600 focus:ring-0"
                />
                <span className="text-[11px]">Deep Recursive Merge</span>
              </label>
            )}

            {/* Output Variable */}
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">Result Output Variable</label>
              <input
                type="text"
                value={props.outputVariable || 'storageResult'}
                onChange={(e) => handlePropChange('outputVariable', e.target.value)}
                placeholder="storageResult"
                className="w-full bg-[#11141c] text-white p-2 rounded-lg border border-[#1c2230] focus:border-emerald-500 outline-none font-mono text-xs"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Returns the stored/retrieved value or storage operation status.
              </p>
            </div>

            {/* Quick For-Each Loop Creator / Draggable Chip */}
            <div className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                  <Repeat className="w-3.5 h-3.5" />
                  <span>Iterate Array with For Each</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400/90 bg-emerald-900/40 px-1.5 py-0.5 rounded border border-emerald-700/30">
                  &#123;&#123;{props.key || 'myItems'}&#125;&#125;
                </span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Drag this block onto the canvas or click below to automatically attach a For Each loop configured for this storage array.
              </p>
              <div className="flex items-center gap-2">
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/autoflow-node', 'for_each');
                    e.dataTransfer.setData(
                      'application/autoflow-node-props',
                      JSON.stringify({
                        array: `{{${props.key || 'myItems'}}}`,
                        itemVariable: 'item',
                      })
                    );
                    e.dataTransfer.setData('application/autoflow-source-node', selectedNode.id);
                    e.dataTransfer.effectAllowed = 'copyMove';
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 hover:bg-emerald-900/60 hover:border-emerald-400 cursor-grab active:cursor-grabbing text-emerald-300 text-xs font-medium transition-all shadow-sm select-none"
                  title={`Drag onto canvas to add For Each loop for {{${props.key || 'myItems'}}}`}
                >
                  <GripVertical className="w-3.5 h-3.5 text-emerald-400/80" />
                  <Repeat className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Drag Loop to Canvas</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent('autoflow:add-for-each-node', {
                        detail: {
                          arrayKey: props.key || 'myItems',
                          sourceNodeId: selectedNode.id,
                        },
                      })
                    );
                  }}
                  className="py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 transition-colors shadow-sm"
                  title="Add and connect For Each node immediately below this node"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Loop</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Context & Data Nodes */}
        <DataNodesProperties
          selectedNode={selectedNode}
          onPropChange={handlePropChange}
        />

        {/* Control Flow & Branching Nodes */}
        <ControlFlowProperties
          selectedNode={selectedNode}
          onPropChange={handlePropChange}
          allNodes={allNodes || []}
        />

        {/* Free Scraper Nodes */}
        <ScraperPropertiesPanel
          selectedNode={selectedNode}
          runtimeState={runtimeState}
          onPropChange={handlePropChange}
        />
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

      {/* Full Screen Image Preview Modal */}
      {fullScreenImageUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/92 backdrop-blur-md flex flex-col justify-between p-4 md:p-6 select-none animate-in fade-in duration-150 cursor-zoom-out"
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG' || target.closest('button') || target.closest('a') || target.closest('.no-close-modal')) {
              return;
            }
            setFullScreenImageUrl(null);
          }}
        >
          {/* Top-Right Floating Quick Close Button */}
          <button
            type="button"
            onClick={() => setFullScreenImageUrl(null)}
            className="fixed top-4 right-4 z-[10000] p-2.5 rounded-full bg-black/75 hover:bg-red-600 text-white/90 hover:text-white border border-white/20 hover:border-red-500 transition-all hover:scale-110 shadow-2xl backdrop-blur-sm cursor-pointer group"
            title="Close Preview (Esc)"
          >
            <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
          </button>

          {/* Header */}
          <div
            className="flex items-center justify-between w-full max-w-6xl mx-auto pb-3 border-b border-white/10 text-white relative z-10 pr-12 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 shadow-sm">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Full Screen Image Preview</h3>
                <p className="text-[11px] text-gray-400 font-mono flex items-center gap-2">
                  <span>
                    {modalImages.length > 1
                      ? `Image ${fullScreenImageIndex + 1} of ${modalImages.length}`
                      : 'Generated Image'}
                  </span>
                  {modalImages.length > 1 && (
                    <span className="text-[10px] bg-indigo-950/60 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                      Use &larr; / &rarr; keys or buttons to slide
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Previous / Next slide buttons in header */}
              {modalImages.length > 1 && (
                <div className="flex items-center bg-[#161a24] rounded-lg border border-[#2a3449] p-0.5 mr-1">
                  <button
                    type="button"
                    onClick={handlePrevFullScreenImage}
                    className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-[#202738] transition-colors cursor-pointer"
                    title="Previous Image (Left Arrow)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-mono px-2 text-gray-300 select-none">
                    {fullScreenImageIndex + 1}/{modalImages.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextFullScreenImage}
                    className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-[#202738] transition-colors cursor-pointer"
                    title="Next Image (Right Arrow)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Download */}
              <button
                type="button"
                onClick={() => {
                  const baseName = props.downloadFilename || `${props.outputVariable || 'image'}`;
                  handleDownloadImage(fullScreenImageUrl, `${baseName}_${fullScreenImageIndex + 1}.png`);
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                title="Download this image"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>

              {/* Open in Tab */}
              <a
                href={fullScreenImageUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[#1c2230] hover:bg-[#283145] text-gray-300 hover:text-white text-xs font-medium border border-[#2a3449] flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Open original image in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                <span>Open in Tab</span>
              </a>

              {/* Copy URL */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(fullScreenImageUrl);
                  setCopiedBase64(true);
                  setTimeout(() => setCopiedBase64(false), 2000);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#1c2230] hover:bg-[#283145] text-gray-300 hover:text-white text-xs font-medium border border-[#2a3449] flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Copy URL / Base64"
              >
                {copiedBase64 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedBase64 ? 'Copied!' : 'Copy'}</span>
              </button>

              {/* Header Close button */}
              <button
                type="button"
                onClick={() => setFullScreenImageUrl(null)}
                className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm ml-1 cursor-pointer"
                title="Close full screen preview (Esc)"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>

          {/* Main Image Viewport with Left/Right Arrow UI Buttons and Floating Actions Pill */}
          <div
            className="flex-1 flex items-center justify-center relative w-full max-w-6xl mx-auto my-2 overflow-hidden cursor-zoom-out"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.tagName === 'IMG' || target.closest('button') || target.closest('a') || target.closest('.no-close-modal')) {
                return;
              }
              setFullScreenImageUrl(null);
            }}
          >
            {/* Left Navigation Arrow Button */}
            {modalImages.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevFullScreenImage();
                }}
                className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/75 hover:bg-black/90 text-white/90 hover:text-white border border-white/20 hover:border-white/40 transition-all hover:scale-110 shadow-2xl backdrop-blur-sm group cursor-pointer"
                title="Previous image (Left Arrow)"
              >
                <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
              </button>
            )}

            {/* Main Center Image with transition */}
            <div
              className="relative max-h-[72vh] max-w-[90vw] flex items-center justify-center cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                key={fullScreenImageUrl}
                src={fullScreenImageUrl}
                alt={`Image preview ${fullScreenImageIndex + 1}`}
                className="max-h-[72vh] max-w-[90vw] object-contain rounded-lg shadow-2xl border border-white/10 select-none animate-in fade-in zoom-in-95 duration-200"
              />
            </div>

            {/* Right Navigation Arrow Button */}
            {modalImages.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextFullScreenImage();
                }}
                className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/75 hover:bg-black/90 text-white/90 hover:text-white border border-white/20 hover:border-white/40 transition-all hover:scale-110 shadow-2xl backdrop-blur-sm group cursor-pointer"
                title="Next image (Right Arrow)"
              >
                <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}

            {/* Floating Quick Actions Bar right below the image in Full Screen */}
            <div
              className="absolute bottom-3 z-30 flex items-center gap-2 bg-black/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 shadow-2xl no-close-modal cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  const baseName = props.downloadFilename || `${props.outputVariable || 'image'}`;
                  handleDownloadImage(fullScreenImageUrl, `${baseName}_${fullScreenImageIndex + 1}.png`);
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all hover:scale-105 shadow-md cursor-pointer"
                title="Download this image"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>

              <a
                href={fullScreenImageUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1c2230] hover:bg-[#283145] text-gray-200 hover:text-white text-xs font-medium border border-white/10 transition-all hover:scale-105 shadow-md cursor-pointer"
                title="Open full resolution in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5 text-gray-300" />
                <span>Open in Tab</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(fullScreenImageUrl);
                  setCopiedBase64(true);
                  setTimeout(() => setCopiedBase64(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1c2230] hover:bg-[#283145] text-gray-200 hover:text-white text-xs font-medium border border-white/10 transition-all hover:scale-105 shadow-md cursor-pointer"
                title="Copy URL or base64"
              >
                {copiedBase64 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedBase64 ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={() => setFullScreenImageUrl(null)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-600/30 hover:bg-red-600 text-red-200 hover:text-white text-xs font-medium border border-red-500/30 transition-all hover:scale-105 cursor-pointer ml-1"
                title="Close (Esc)"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>

          {/* Bottom Thumbnail Strip (if multiple images) */}
          {modalImages.length > 1 && (
            <div
              className="flex items-center justify-center gap-2 py-1.5 overflow-x-auto max-w-2xl mx-auto z-10 px-4 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              {modalImages.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setFullScreenImageIndex(i);
                    setFullScreenImageUrl(img);
                  }}
                  className={`w-12 h-12 md:w-14 md:h-14 rounded-lg border-2 overflow-hidden transition-all shrink-0 relative group shadow-md cursor-pointer ${
                    i === fullScreenImageIndex
                      ? 'border-indigo-500 ring-2 ring-indigo-500/50 scale-105 opacity-100'
                      : 'border-[#2a3449] opacity-60 hover:opacity-100 hover:border-gray-400'
                  }`}
                  title={`Image ${i + 1} of ${modalImages.length}`}
                >
                  <img src={img} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/80 text-white px-1 rounded font-mono">
                    #{i + 1}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Footer Bar */}
          <div
            className="w-full max-w-6xl mx-auto pt-2 flex items-center justify-between text-xs text-gray-400 border-t border-white/10 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-mono text-[11px] truncate max-w-xl text-gray-500">
              {fullScreenImageUrl.startsWith('data:') ? 'Base64 Encoded Image Data' : fullScreenImageUrl}
            </span>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              {modalImages.length > 1 && (
                <span>&larr; / &rarr; keys or buttons to slide</span>
              )}
              <span>Click backdrop or press Close / Esc to dismiss</span>
            </div>
          </div>
        </div>
      )}

      {/* Extracted Cards Table Inspection Modal */}
      <TableModal
        isOpen={isScrapeTableModalOpen}
        onClose={() => setIsScrapeTableModalOpen(false)}
        title={`Extracted Cards Table (${extractedCardsData.length} items)`}
        data={extractedCardsData}
        defaultFilename={props.exportFilename || props.outputVariable || 'scraped_products'}
      />
    </aside>
  );
};
