import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Wand2,
  Settings,
  ArrowRight,
  RefreshCw,
  Check,
  Zap,
  Server,
  Globe,
  AlertCircle,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import { synthesizeWorkflow } from '../../ai/workflowSynthesizer';
import {
  getAiConfig,
  saveAiConfig,
  fetchAvailableModels,
  getDefaultModelForProvider,
  DEFAULT_MISTRAL_API_KEY,
  DEFAULT_OPENAI_API_KEY,
} from '../../ai/aiService';
import { AiConfig, AiProvider, ModelOption, SynthesizedWorkflow } from '../../ai/types';
import { WorkflowNode, WorkflowEdge } from '../../types/workflow';

interface AiCopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNodeId: string | null;
  currentNodes: WorkflowNode[];
  currentEdges: WorkflowEdge[];
  onApplyWorkflow: (nodes: WorkflowNode[], edges: WorkflowEdge[], summary?: string) => void;
  onAppendNodes: (newNodes: WorkflowNode[], newEdges: WorkflowEdge[], targetNodeId?: string) => void;
}

const RECIPES = [
  {
    title: 'E-Commerce Price Drop Alert',
    prompt: 'Navigate to an online store, wait for product cards, extract the product title and price, check if price is less than 50, and take a screenshot if true.',
  },
  {
    title: 'Hacker News Scraper & AI Digest',
    prompt: 'Navigate to https://news.ycombinator.com, extract all 30 top headlines into an array, use AI agent to summarize the trending tech topics, and post to webhook.',
  },
  {
    title: 'Form Auto-Filler with Random Data',
    prompt: 'Navigate to signup page, generate random user data (email and name), fill out the input fields, click submit, and verify success message.',
  },
  {
    title: 'Search & Multi-Item Scraper',
    prompt: 'Open https://quotes.toscrape.com, extract all authors into a list, click the inspirational tag, wait for page update, and capture a screenshot.',
  },
];

export const AiCopilotDrawer: React.FC<AiCopilotDrawerProps> = ({
  isOpen,
  onClose,
  selectedNodeId,
  currentNodes,
  currentEdges,
  onApplyWorkflow,
  onAppendNodes,
}) => {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig>({ provider: 'built-in', model: 'gpt-5.6-sol' });
  const [models, setModels] = useState<ModelOption[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelFetchStatus, setModelFetchStatus] = useState<string | null>(null);
  const [customModelMode, setCustomModelMode] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationWarning, setGenerationWarning] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<SynthesizedWorkflow | null>(null);
  const [copiedError, setCopiedError] = useState(false);

  const loadModels = async (configToUse?: AiConfig) => {
    const active = configToUse || aiConfig;
    setIsLoadingModels(true);
    setModelFetchStatus(null);
    try {
      const fetched = await fetchAvailableModels(active);
      setModels(fetched);
      if (active.provider !== 'built-in' && (active.apiKey || active.provider === 'custom' || active.provider === 'openrouter')) {
        setModelFetchStatus(`✓ ${fetched.length} models retrieved from /models`);
      }
      if (fetched.length > 0 && !customModelMode) {
        const found = fetched.some(m => m.id === active.model && m.id !== 'gpt-4o-mini');
        if (!found) {
          const hasDefault = fetched.some(m => m.id === 'gpt-5.6-sol');
          setAiConfig(prev => ({ ...prev, model: hasDefault ? 'gpt-5.6-sol' : fetched[0].id }));
        }
      }
    } catch (err: any) {
      setModelFetchStatus(`⚠ Failed to load from /models: ${err.message}`);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      getAiConfig().then(cfg => {
        setAiConfig(cfg);
        loadModels(cfg);
      });
      setGenerationError(null);
      setGenerationWarning(null);
      setPendingResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProviderChange = (newProvider: AiProvider) => {
    let newApiKey = aiConfig.apiKey;
    if (newProvider === 'openai' && (!aiConfig.apiKey || aiConfig.apiKey === '' || aiConfig.apiKey === DEFAULT_MISTRAL_API_KEY)) {
      newApiKey = DEFAULT_OPENAI_API_KEY;
    } else if (newProvider === 'mistral' && (!aiConfig.apiKey || aiConfig.apiKey === '' || aiConfig.apiKey === DEFAULT_OPENAI_API_KEY)) {
      newApiKey = DEFAULT_MISTRAL_API_KEY;
    }

    const newConfig: AiConfig = {
      ...aiConfig,
      provider: newProvider,
      model: getDefaultModelForProvider(newProvider),
      openaiBaseUrl: newProvider === 'openai' && !aiConfig.openaiBaseUrl ? 'https://api.experientiallabs.ai' : aiConfig.openaiBaseUrl,
      apiKey: newApiKey,
    };
    setAiConfig(newConfig);
    loadModels(newConfig);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveAiConfig(aiConfig);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setGenerationError(null);
    setGenerationWarning(null);
    setPendingResult(null);

    try {
      const result: SynthesizedWorkflow = await synthesizeWorkflow({
        prompt: prompt.trim(),
        mode,
        selectedNodeId: selectedNodeId || undefined,
        currentNodes,
        currentEdges,
      });

      if (result.error) {
        setGenerationError(result.error);
        setPendingResult(result);
      } else if (result.warning) {
        setGenerationWarning(result.warning);
        setPendingResult(result);
      } else {
        if (mode === 'replace') {
          onApplyWorkflow(result.nodes, result.edges, result.summary);
        } else {
          onAppendNodes(result.nodes, result.edges, selectedNodeId || undefined);
        }
        onClose();
      }
    } catch (err: any) {
      setGenerationError(err.message || String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyPendingResult = () => {
    if (!pendingResult) return;
    if (mode === 'replace') {
      onApplyWorkflow(pendingResult.nodes, pendingResult.edges, pendingResult.summary);
    } else {
      onAppendNodes(pendingResult.nodes, pendingResult.edges, selectedNodeId || undefined);
    }
    setPendingResult(null);
    setGenerationError(null);
    setGenerationWarning(null);
    onClose();
  };

  const handleSwitchToBuiltinAndGenerate = async () => {
    const offlineConfig: AiConfig = {
      ...aiConfig,
      provider: 'built-in',
    };
    setAiConfig(offlineConfig);
    setGenerationError(null);
    setGenerationWarning(null);
    setIsGenerating(true);
    try {
      const result = await synthesizeWorkflow({
        prompt: prompt.trim(),
        mode,
        selectedNodeId: selectedNodeId || undefined,
        currentNodes,
        currentEdges,
      });
      if (mode === 'replace') {
        onApplyWorkflow(result.nodes, result.edges, result.summary);
      } else {
        onAppendNodes(result.nodes, result.edges, selectedNodeId || undefined);
      }
      onClose();
    } catch (err: any) {
      setGenerationError(err.message || String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <aside className="fixed right-0 top-14 bottom-0 w-full sm:w-96 max-w-full bg-[#11141c] border-l border-[#232a3b] shadow-2xl z-40 flex flex-col select-none animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-[#1c2230] flex items-center justify-between bg-[#0c0e14]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-xs text-white">AI Workflow Copilot</h2>
            <p className="text-[10px] text-gray-400">Natural language workflow synthesis</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-lg text-gray-400 hover:text-white transition-colors ${
              showSettings ? 'bg-indigo-600/20 text-indigo-400' : 'hover:bg-[#1c2230]'
            }`}
            title="Configure AI Provider / API Key"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1c2230] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Panel (Collapsible) */}
      {showSettings && (
        <form onSubmit={handleSaveConfig} className="p-4 border-b border-[#1c2230] bg-[#0f121a] space-y-3 text-xs">
          <div className="font-semibold text-gray-300 text-[11px] flex items-center justify-between">
            <span>AI Provider & Model Settings</span>
            {saveSuccess && <span className="text-emerald-400 text-[10px] flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>}
          </div>

          <div>
            <label className="block text-[10px] text-gray-400 mb-1">Provider</label>
            <select
              value={aiConfig.provider}
              onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
              className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs"
            >
              <option value="built-in">Built-in Semantic Synthesizer (Zero Config / Offline)</option>
              <option value="openai">OpenAI Compatible API (/v1/models)</option>
              <option value="mistral">Mistral AI (api.mistral.ai)</option>
              <option value="gemini">Google Gemini API (/v1beta/models)</option>
              <option value="openrouter">OpenRouter API (/api/v1/models)</option>
              <option value="custom">Custom / Local OpenAI-Compatible (Ollama, LM Studio)</option>
            </select>
          </div>

          {/* OpenAI Custom Base URL */}
          {aiConfig.provider === 'openai' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-gray-400">OpenAI Base URL</label>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...aiConfig, openaiBaseUrl: 'https://api.experientiallabs.ai' };
                      setAiConfig(updated);
                      loadModels(updated);
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-medium hover:underline"
                  >
                    ExperientialLabs
                  </button>
                  <span className="text-gray-600">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...aiConfig, openaiBaseUrl: 'https://api.openai.com/v1' };
                      setAiConfig(updated);
                      loadModels(updated);
                    }}
                    className="text-gray-400 hover:text-white hover:underline"
                  >
                    Official
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={aiConfig.openaiBaseUrl || ''}
                onChange={(e) => setAiConfig({ ...aiConfig, openaiBaseUrl: e.target.value })}
                placeholder="https://api.experientiallabs.ai"
                className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none font-mono text-xs"
              />
            </div>
          )}

          {aiConfig.provider === 'custom' && (
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Custom API Base URL</label>
              <input
                type="text"
                value={aiConfig.customEndpoint || ''}
                onChange={(e) => setAiConfig({ ...aiConfig, customEndpoint: e.target.value })}
                placeholder="http://localhost:11434/v1"
                className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none font-mono text-xs"
              />
            </div>
          )}

          {aiConfig.provider !== 'built-in' && (
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">
                API Key {aiConfig.provider === 'custom' && '(optional)'}
              </label>
              <input
                type="password"
                value={aiConfig.apiKey || ''}
                onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                placeholder={aiConfig.provider === 'mistral' ? 'xT6AO...' : 'sk-... or xpl_...'}
                className="w-full bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none font-mono text-xs"
              />
            </div>
          )}

          {/* Model Selector from /models endpoint */}
          {aiConfig.provider !== 'built-in' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-gray-400">
                  Model {models.length > 0 && `(${models.length} from /models)`}
                </label>
                <button
                  type="button"
                  onClick={() => setCustomModelMode(!customModelMode)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {customModelMode ? 'Select from list' : 'Type custom model'}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {customModelMode ? (
                  <input
                    type="text"
                    value={aiConfig.model || ''}
                    onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                    placeholder="e.g. gpt-4o, gemini-1.5-pro..."
                    className="flex-1 bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none font-mono text-xs"
                  />
                ) : (
                  <select
                    value={aiConfig.model || ''}
                    onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                    className="flex-1 bg-[#161a24] text-white p-1.5 rounded border border-[#232a3b] outline-none text-xs truncate"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => loadModels()}
                  disabled={isLoadingModels}
                  className="p-1.5 bg-[#1c2230] hover:bg-[#232a3b] text-gray-300 hover:text-white rounded border border-[#2e374d] transition-colors disabled:opacity-50"
                  title="Refresh / Query /models endpoint"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingModels ? 'animate-spin text-indigo-400' : ''}`} />
                </button>
              </div>

              {modelFetchStatus && (
                <div
                  className={`mt-1 text-[10px] truncate ${
                    modelFetchStatus.startsWith('✓') ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {modelFetchStatus}
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium text-xs transition-colors"
          >
            Save Settings
          </button>
        </form>
      )}

      {/* Main Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Active Model & Engine Status Banner */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#161a24] border border-[#232a3b] text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <div className="min-w-0 truncate">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Active Engine</div>
              <div className="font-medium text-white truncate text-[11px]">
                {aiConfig.provider === 'built-in' ? 'Offline Semantic Synthesizer' : aiConfig.model || 'Default Model'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-1 rounded bg-[#1c2230] border border-[#2e374d] shrink-0"
          >
            Change
          </button>
        </div>

        {/* Error Alert Card */}
        {generationError && (
          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 text-rose-400 font-semibold text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>AI Generation Error</span>
              </div>
              <button
                type="button"
                onClick={() => setGenerationError(null)}
                className="text-gray-400 hover:text-white p-0.5 rounded hover:bg-rose-500/20"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="bg-[#0c0e14]/80 p-2.5 rounded-lg border border-rose-500/20 text-[11px] text-rose-300 font-mono break-words leading-relaxed select-text">
              {generationError}
            </div>

            {/* Quick action buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowSettings(true);
                  setGenerationError(null);
                }}
                className="px-2 py-1 rounded bg-[#1c2230] hover:bg-[#232a3b] text-gray-200 text-[10px] font-medium border border-[#2e374d] flex items-center gap-1 transition-colors"
              >
                <Settings className="w-3 h-3 text-indigo-400" />
                <span>Change Settings</span>
              </button>

              <button
                type="button"
                onClick={handleSwitchToBuiltinAndGenerate}
                className="px-2 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 text-[10px] font-medium border border-indigo-500/30 flex items-center gap-1 transition-colors"
              >
                <Zap className="w-3 h-3 text-indigo-400" />
                <span>Try Offline Synthesizer</span>
              </button>

              {pendingResult && (
                <button
                  type="button"
                  onClick={handleApplyPendingResult}
                  className="px-2 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-[10px] font-medium border border-emerald-500/30 flex items-center gap-1 transition-colors"
                >
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Apply Offline Fallback</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(generationError);
                  setCopiedError(true);
                  setTimeout(() => setCopiedError(false), 2000);
                }}
                className="px-2 py-1 rounded bg-[#161a24] text-gray-400 hover:text-white text-[10px] ml-auto border border-[#232a3b] flex items-center gap-1"
              >
                <Copy className="w-2.5 h-2.5" />
                <span>{copiedError ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Warning Alert Card */}
        {generationWarning && !generationError && (
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs space-y-2 animate-in fade-in duration-200">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Notice</span>
              </div>
              <button
                type="button"
                onClick={() => setGenerationWarning(null)}
                className="text-gray-400 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed font-mono">
              {generationWarning}
            </p>
          </div>
        )}

        {/* Mode Selector */}
        <div>
          <label className="block text-[11px] font-medium text-gray-400 mb-1.5">Synthesis Target</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('replace')}
              className={`p-2 rounded-xl text-left border transition-all text-xs ${
                mode === 'replace'
                  ? 'bg-indigo-600/20 border-indigo-500 text-white font-semibold'
                  : 'bg-[#161a24] border-[#232a3b] text-gray-400 hover:text-white'
              }`}
            >
              <div className="font-medium text-[11px]">New Workflow</div>
              <div className="text-[10px] opacity-70 mt-0.5">Build full canvas flow</div>
            </button>

            <button
              onClick={() => setMode('append')}
              className={`p-2 rounded-xl text-left border transition-all text-xs ${
                mode === 'append'
                  ? 'bg-indigo-600/20 border-indigo-500 text-white font-semibold'
                  : 'bg-[#161a24] border-[#232a3b] text-gray-400 hover:text-white'
              }`}
            >
              <div className="font-medium text-[11px]">Append Nodes</div>
              <div className="text-[10px] opacity-70 mt-0.5">
                {selectedNodeId ? 'Attach to selected' : 'Add to end of graph'}
              </div>
            </button>
          </div>
        </div>

        {/* Prompt Input */}
        <div>
          <label className="block text-[11px] font-medium text-gray-400 mb-1.5">
            Describe the workflow you want to create
          </label>
          <textarea
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Go to https://news.ycombinator.com, extract the top stories into an array, check if any story mentions AI, and if so take a screenshot and post to webhook..."
            className="w-full bg-[#161a24] text-white p-3 rounded-xl border border-[#232a3b] focus:border-indigo-500 outline-none text-xs leading-relaxed placeholder-gray-500"
          />
        </div>

        {/* Quick Recipes */}
        <div>
          <span className="text-[11px] font-medium text-gray-400 block mb-2">Or pick a recipe template:</span>
          <div className="space-y-2">
            {RECIPES.map((recipe, idx) => (
              <div
                key={idx}
                onClick={() => setPrompt(recipe.prompt)}
                className="p-2.5 rounded-xl bg-[#161a24] hover:bg-[#1c2230] border border-[#232a3b] hover:border-indigo-500/40 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-gray-200 group-hover:text-white">
                  <span>{recipe.title}</span>
                  <ArrowRight className="w-3 h-3 text-gray-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="text-[10px] text-gray-400 line-clamp-2 mt-1">{recipe.prompt}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer / Generate Button */}
      <div className="p-4 border-t border-[#1c2230] bg-[#0c0e14]">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98]"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Synthesizing Workflow...</span>
            </>
          ) : (
            <>
              <Wand2 className="w-3.5 h-3.5" />
              <span>{mode === 'replace' ? 'Generate & Apply to Canvas' : 'Synthesize & Append'}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
