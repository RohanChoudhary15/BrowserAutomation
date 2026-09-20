import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Play,
  Pause,
  Square,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  ChevronRight,
  Maximize2,
  Settings,
  MousePointer,
  Type,
  Navigation,
  ArrowDown,
  RefreshCw,
  X,
  Copy,
  ExternalLink,
  HelpCircle,
  Send,
} from 'lucide-react';
import { AgentStep, AiConfig, HumanGuidanceRequest } from '../../ai/types';
import { runBrowserAgent, convertAgentStepsToWorkflow, AgentPauseController } from '../../ai/browserAgent';
import { getAiConfig } from '../../ai/aiService';
import { WorkflowNode, WorkflowEdge } from '../../types/workflow';

interface BrowserAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyWorkflowToCanvas: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
}

const PRESET_GOALS = [
  'Go to google.com, search for "AutoFlow Browser Automation", and click the first result',
  'Find the search bar on this page, type "mechanical keyboard", and press Enter',
  'Scroll down the page, find the pricing section, and extract the pro tier price',
  'Find and click the "Contact Us" or "About" link and wait for the page to load',
];

export const BrowserAgentModal: React.FC<BrowserAgentModalProps> = ({
  isOpen,
  onClose,
  onApplyWorkflowToCanvas,
}) => {
  const [goal, setGoal] = useState('');
  const [maxSteps, setMaxSteps] = useState(10);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [statusText, setStatusText] = useState('Ready to launch browser agent');
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [activeTabUrl, setActiveTabUrl] = useState<string>('');
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);

  // Human-in-the-Loop state
  const [humanGuidanceRequest, setHumanGuidanceRequest] = useState<HumanGuidanceRequest | null>(null);
  const [guidanceInput, setGuidanceInput] = useState('');
  const [askHumanInput, setAskHumanInput] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const pauseControllerRef = useRef<AgentPauseController>(new AgentPauseController());
  const guidanceResolverRef = useRef<((response: string) => void) | null>(null);
  const timelineEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      getAiConfig().then(cfg => setAiConfig(cfg));
      // Query active tab URL
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          if (tab?.url) setActiveTabUrl(tab.url);
        });
      }
    }
  }, [isOpen]);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  if (!isOpen) return null;

  const handlePause = () => {
    pauseControllerRef.current.pause();
    setIsPaused(true);
    setStatusText('Agent paused by human. Provide guidance or click Resume.');
  };

  const handleResume = (customGuidance?: string) => {
    const textToSubmit = customGuidance !== undefined ? customGuidance : guidanceInput;
    pauseControllerRef.current.resume(textToSubmit.trim() || undefined);
    setIsPaused(false);
    setGuidanceInput('');
    setStatusText(textToSubmit.trim() ? `Resumed with guidance: "${textToSubmit.trim()}"` : 'Resuming agent execution...');
  };

  const handleSendHumanGuidance = (answer: string) => {
    if (guidanceResolverRef.current) {
      guidanceResolverRef.current(answer);
      guidanceResolverRef.current = null;
    }
    setHumanGuidanceRequest(null);
    setAskHumanInput('');
    setStatusText(`Human instructed AI: "${answer}". Resuming execution...`);
  };

  const handleStart = async () => {
    if (!goal.trim() || isRunning) return;

    setIsRunning(true);
    setIsPaused(false);
    setSteps([]);
    setSelectedStepIndex(null);
    setHumanGuidanceRequest(null);
    abortControllerRef.current = new AbortController();
    pauseControllerRef.current = new AgentPauseController();

    try {
      await runBrowserAgent({
        goal: goal.trim(),
        maxSteps,
        config: aiConfig || undefined,
        signal: abortControllerRef.current.signal,
        pauseController: pauseControllerRef.current,
        onRequestHumanGuidance: (req) => {
          setHumanGuidanceRequest(req);
          return new Promise<string>((resolve) => {
            guidanceResolverRef.current = resolve;
          });
        },
        onStatusUpdate: (text) => setStatusText(text),
        onScreenshot: (dataUrl) => setLatestScreenshot(dataUrl),
        onStep: (step) => {
          setSteps(prev => [...prev, step]);
          if (step.screenshotAfter) {
            setLatestScreenshot(step.screenshotAfter);
          }
        },
      });
    } catch (err: any) {
      setStatusText(`Agent execution error: ${err.message}`);
    } finally {
      setIsRunning(false);
      setIsPaused(false);
      setHumanGuidanceRequest(null);
      guidanceResolverRef.current = null;
    }
  };

  const handleRetry = async () => {
    if (!goal.trim() || isRunning) return;

    setIsRunning(true);
    setIsPaused(false);
    setHumanGuidanceRequest(null);
    abortControllerRef.current = new AbortController();
    pauseControllerRef.current = new AgentPauseController();

    try {
      await runBrowserAgent({
        goal: goal.trim(),
        maxSteps,
        config: aiConfig || undefined,
        signal: abortControllerRef.current.signal,
        pauseController: pauseControllerRef.current,
        onRequestHumanGuidance: (req) => {
          setHumanGuidanceRequest(req);
          return new Promise<string>((resolve) => {
            guidanceResolverRef.current = resolve;
          });
        },
        onStatusUpdate: (text) => setStatusText(text),
        onScreenshot: (dataUrl) => setLatestScreenshot(dataUrl),
        onStep: (step) => {
          setSteps(prev => [...prev, step]);
          if (step.screenshotAfter) {
            setLatestScreenshot(step.screenshotAfter);
          }
        },
      });
    } catch (err: any) {
      setStatusText(`Retry execution error: ${err.message}`);
    } finally {
      setIsRunning(false);
      setIsPaused(false);
      setHumanGuidanceRequest(null);
      guidanceResolverRef.current = null;
    }
  };

  const handleSelectPreset = (preset: string) => {
    setGoal(preset);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (pauseControllerRef.current.isPaused) {
      pauseControllerRef.current.resume();
    }
    if (guidanceResolverRef.current) {
      guidanceResolverRef.current('Agent stopped by user');
      guidanceResolverRef.current = null;
    }
    setHumanGuidanceRequest(null);
    setIsRunning(false);
    setIsPaused(false);
    setStatusText('Stopped by user');
  };

  const handleConvertToWorkflow = () => {
    if (steps.length === 0) return;
    const { nodes, edges } = convertAgentStepsToWorkflow(steps, goal);
    onApplyWorkflowToCanvas(nodes, edges);
    onClose();
  };

  const activeStep = selectedStepIndex !== null ? steps[selectedStepIndex] : steps[steps.length - 1];
  const displayedScreenshot = activeStep?.screenshotAfter || activeStep?.screenshotBefore || latestScreenshot;

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'click':
        return <MousePointer className="w-3.5 h-3.5 text-blue-400" />;
      case 'type':
        return <Type className="w-3.5 h-3.5 text-emerald-400" />;
      case 'navigate':
        return <Navigation className="w-3.5 h-3.5 text-indigo-400" />;
      case 'scroll':
        return <ArrowDown className="w-3.5 h-3.5 text-amber-400" />;
      case 'done':
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
      case 'ask_human':
        return <HelpCircle className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Bot className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-5xl h-[92vh] bg-[#0d1017] border border-[#1e2433] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-gray-200">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a202c] bg-[#11141c]/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-md">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                  Autonomous Browser Agent
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Vision Mode
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Human-in-Loop
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30 hidden sm:inline">
                  {aiConfig?.model || 'gpt-5.6-sol'}
                </span>
              </div>
              <p className="text-xs text-gray-400 hidden sm:block truncate max-w-md">
                Perceives live screenshots, reasons step-by-step, and executes actions autonomously with human oversight.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {steps.length > 0 && (
              <button
                onClick={handleConvertToWorkflow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all"
                title="Convert executed actions into visual canvas nodes"
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Convert to</span> Workflow
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1c2230] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Goal Input & Controls Header */}
        <div className="p-3 sm:p-4 bg-[#11141c]/50 border-b border-[#1a202c] space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isRunning && handleStart()}
                placeholder="Describe what the agent should do on the browser page..."
                disabled={isRunning}
                className="w-full bg-[#0d1017] text-white pl-3 pr-24 py-2 rounded-xl border border-[#1e2433] focus:border-indigo-500 outline-none text-xs sm:text-sm placeholder-gray-500 transition-colors"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 hidden sm:inline">Max Steps:</span>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-12 bg-[#161a24] text-center text-xs text-white py-0.5 rounded border border-[#232a3b] outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isRunning ? (
                <>
                  <button
                    onClick={handleStart}
                    disabled={!goal.trim()}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start Agent</span>
                  </button>
                  {steps.length > 0 && (
                    <button
                      onClick={handleRetry}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#1c2438] hover:bg-[#25304a] text-indigo-300 rounded-xl text-xs sm:text-sm font-semibold border border-indigo-500/30 transition-all"
                      title="Retry remaining or failed tasks"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </button>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  {!isPaused ? (
                    <button
                      onClick={handlePause}
                      className="flex items-center gap-1 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md transition-all"
                      title="Pause agent to inspect and add instructions"
                    >
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>Pause</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleResume()}
                      className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md transition-all"
                      title="Resume agent execution"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Resume</span>
                    </button>
                  )}
                  <button
                    onClick={handleStop}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md transition-all"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Preset Prompts Pills */}
          {!isRunning && steps.length === 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
              <span className="text-gray-500 shrink-0">Try:</span>
              {PRESET_GOALS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectPreset(preset)}
                  className="px-2.5 py-1 bg-[#161a24] hover:bg-[#1c2230] text-gray-400 hover:text-gray-200 rounded-lg border border-[#1f2638] whitespace-nowrap transition-colors"
                >
                  {preset.slice(0, 42)}...
                </button>
              ))}
            </div>
          )}

          {/* Status Bar */}
          <div className="flex items-center justify-between text-[11px] bg-[#0d1017] px-3 py-1.5 rounded-lg border border-[#1a202c]">
            <div className="flex items-center gap-2 truncate">
              <span className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? (isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-ping') : 'bg-gray-500'}`} />
              <span className="font-mono text-gray-300 truncate">{statusText}</span>
            </div>
            {activeTabUrl && (
              <div className="flex items-center gap-1 text-gray-500 shrink-0 ml-2 hidden sm:flex truncate max-w-xs">
                <ExternalLink className="w-3 h-3" />
                <span className="truncate">{activeTabUrl.replace(/^https?:\/\//, '')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Human-in-the-Loop Pause & Guidance Banner */}
        {isPaused && (
          <div className="bg-amber-950/40 border-b border-amber-600/40 px-4 py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 animate-fade-in">
            <div className="flex items-center gap-1.5 text-amber-300 text-xs font-semibold shrink-0">
              <Pause className="w-3.5 h-3.5 text-amber-400" />
              <span>Agent Paused</span>
            </div>
            <input
              type="text"
              value={guidanceInput}
              onChange={(e) => setGuidanceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleResume();
                }
              }}
              placeholder="Add guidance or next instructions (e.g. 'Click the second button instead', 'Skip step')..."
              className="flex-1 bg-[#0d1017] text-white text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 focus:border-amber-400 outline-none placeholder-amber-200/40"
              autoFocus
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleResume()}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Resume with Guidance</span>
              </button>
            </div>
          </div>
        )}

        {/* AI Assistance Request Banner / Card */}
        {humanGuidanceRequest && (
          <div className="bg-indigo-950/80 border-b border-indigo-500/50 px-4 py-3 flex flex-col gap-2.5 animate-fade-in shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-indigo-200 text-xs font-bold">
                <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>AI Assistance Required</span>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30 font-mono">
                  Step #{humanGuidanceRequest.stepIndex}
                </span>
              </div>
              <span className="text-[11px] text-amber-300/80">Execution waiting for your input</span>
            </div>
            <div className="bg-[#0b0e14]/90 p-2.5 rounded-lg border border-indigo-500/30 text-xs text-gray-200">
              <p className="font-semibold text-indigo-100">{humanGuidanceRequest.question}</p>
              {humanGuidanceRequest.reason && (
                <p className="text-[11px] text-gray-400 mt-1 italic">{humanGuidanceRequest.reason}</p>
              )}
            </div>

            {/* Suggested Option Chips */}
            {humanGuidanceRequest.suggestedOptions && humanGuidanceRequest.suggestedOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-gray-400 text-[10px]">Quick reply:</span>
                {humanGuidanceRequest.suggestedOptions.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendHumanGuidance(opt)}
                    className="px-2 py-0.5 bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-200 rounded-md border border-indigo-700/50 hover:border-indigo-400 transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={askHumanInput}
                onChange={(e) => setAskHumanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && askHumanInput.trim()) {
                    handleSendHumanGuidance(askHumanInput.trim());
                  }
                }}
                placeholder="Type instructions or answer (e.g., 'I solved the CAPTCHA, click Continue', 'Select Option B')..."
                className="flex-1 bg-[#0d1017] text-white text-xs px-3 py-1.5 rounded-lg border border-indigo-500/40 focus:border-indigo-400 outline-none placeholder-gray-500"
                autoFocus
              />
              <button
                onClick={() => handleSendHumanGuidance(askHumanInput.trim() || 'Proceed')}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 shadow-sm shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Command</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Body: Split View (Live Screenshot & Step Timeline) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          
          {/* Left Column: Live Screenshot Preview (7 cols) */}
          <div className="lg:col-span-7 bg-[#0b0e14] flex flex-col border-b lg:border-b-0 lg:border-r border-[#1a202c] overflow-hidden">
            <div className="px-3 py-2 border-b border-[#161a24] flex items-center justify-between text-xs text-gray-400 bg-[#0e1118]">
              <div className="flex items-center gap-1.5 font-medium">
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>Live Browser View</span>
                {displayedScreenshot && (
                  <span className="text-[10px] text-gray-500 font-mono">
                    (Updated {activeStep ? `Step #${activeStep.stepNumber}` : 'Real-time'})
                  </span>
                )}
              </div>
              {displayedScreenshot && (
                <button
                  onClick={() => setShowScreenshotModal(true)}
                  className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#161a24] transition-colors"
                  title="Enlarge Screenshot"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 flex items-center justify-center p-3 overflow-auto bg-[#07090e]">
              {displayedScreenshot ? (
                <div className="relative group max-w-full max-h-full rounded-xl overflow-hidden border border-[#1e2433] shadow-lg bg-black">
                  <img
                    src={displayedScreenshot}
                    alt="Live Tab Screenshot"
                    className="object-contain max-h-[48vh] lg:max-h-[58vh] w-auto mx-auto select-none"
                  />
                  {activeStep && (
                    <div className="absolute bottom-2 left-2 right-2 bg-[#0d1017]/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] flex items-center justify-between text-gray-300">
                      <div className="flex items-center gap-1.5 truncate">
                        {getActionIcon(activeStep.action.type)}
                        <span className="font-semibold text-white uppercase">{activeStep.action.type}</span>
                        {activeStep.action.text && <span className="font-mono text-emerald-300 truncate">"{activeStep.action.text}"</span>}
                        {activeStep.action.selector && <span className="text-gray-400 truncate font-mono text-[10px]">{activeStep.action.selector}</span>}
                      </div>
                      <span className="text-gray-500 font-mono shrink-0">Step {activeStep.stepNumber}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center p-8 max-w-sm text-gray-500">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[#121622] border border-[#1f2638] flex items-center justify-center">
                    <Eye className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-300 mb-1">No Screenshot Captured Yet</p>
                  <p className="text-xs">
                    Start the agent to see live page perceptions and automatic visual updates.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Tasks & Reasoning Timeline (5 cols) */}
          <div className="lg:col-span-5 bg-[#0e121a] flex flex-col overflow-hidden">
            {/* Header: Timeline */}
            <div className="px-3 py-2.5 border-b border-[#161a24] flex items-center justify-between bg-[#111520]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-semibold text-white tracking-wide">Execution Timeline</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#161a24] text-indigo-300 font-mono border border-indigo-500/20">
                  {steps.length} {steps.length === 1 ? 'action' : 'actions'}
                </span>
              </div>
              <span className="text-[11px] font-mono text-gray-400 hidden sm:inline">
                {isRunning ? (isPaused ? 'Paused' : 'Executing...') : (steps.length > 0 ? 'Finished' : 'Ready')}
              </span>
            </div>

            {/* Execution Step Timeline */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {steps.length === 0 ? (
                <div className="text-center py-12 px-4 text-gray-500">
                  <Bot className="w-10 h-10 mx-auto mb-2 text-gray-600" />
                  <p className="text-xs">Waiting for agent launch...</p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Each step's visual thought reasoning and executed DOM actions will appear here.
                  </p>
                </div>
              ) : (
                steps.map((step, idx) => {
                  const isSelected = selectedStepIndex === idx || (selectedStepIndex === null && idx === steps.length - 1);
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedStepIndex(idx)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#151a26] border-indigo-500/50 shadow-md ring-1 ring-indigo-500/30'
                          : 'bg-[#11141c] border-[#1c2230] hover:border-[#2a3449]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#1e2536] text-indigo-300">
                            #{step.stepNumber}
                          </span>
                          <div className="flex items-center gap-1 text-xs font-semibold text-white">
                            {getActionIcon(step.action.type)}
                            <span className="uppercase tracking-wider text-[11px]">{step.action.type}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {step.success ? (
                            <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          ) : (
                            <span className="text-[10px] text-red-400 flex items-center gap-0.5">
                              <AlertCircle className="w-3 h-3" /> Error
                            </span>
                          )}
                        </div>
                      </div>

                        {/* Model Thought Reasoning */}
                        <p className="text-xs text-gray-300 leading-relaxed bg-[#0b0e14] p-2 rounded-lg border border-[#181d2a] mb-2">
                          {step.thought}
                        </p>

                        {/* Action Details */}
                        <div className="text-[11px] font-mono text-gray-400 space-y-0.5">
                          {step.action.text && (
                            <div className="truncate">
                              <span className="text-gray-500">text:</span> <span className="text-emerald-300 font-semibold">"{step.action.text}"</span>
                            </div>
                          )}
                          {step.action.selector && (
                            <div className="truncate">
                              <span className="text-gray-500">selector:</span> <span className="text-indigo-300">{step.action.selector}</span>
                            </div>
                          )}
                          {step.action.url && (
                            <div className="truncate">
                              <span className="text-gray-500">url:</span> <span className="text-blue-300">{step.action.url}</span>
                            </div>
                          )}
                          {step.action.type === 'ask_human' && (
                            <div className="p-2 mt-1 rounded bg-amber-950/30 border border-amber-600/30 text-amber-200 text-xs font-sans space-y-1">
                              <div className="flex items-center gap-1 font-semibold text-amber-300">
                                <HelpCircle className="w-3.5 h-3.5" />
                                <span>AI Asked for Assistance:</span>
                              </div>
                              <p className="text-amber-100">{step.action.question || step.thought}</p>
                              {step.action.reason && (
                                <p className="text-[10px] text-amber-300/70 italic">Reason: {step.action.reason}</p>
                              )}
                            </div>
                          )}
                          {step.humanGuidance && (
                            <div className="p-2 mt-1 rounded bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 text-xs font-sans">
                              <span className="text-gray-400 font-semibold">Human Command:</span> "{step.humanGuidance}"
                            </div>
                          )}
                          {step.action.answer && (
                            <div className="p-2 mt-1 rounded bg-green-950/40 border border-green-800/40 text-green-300 text-xs font-sans">
                              <strong>Summary:</strong> {step.action.answer}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={timelineEndRef} />
              </div>
          </div>
        </div>

        {/* Modal Screenshot Zoom */}
        {showScreenshotModal && displayedScreenshot && (
          <div
            onClick={() => setShowScreenshotModal(false)}
            className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <img
              src={displayedScreenshot}
              alt="Expanded Tab View"
              className="max-w-full max-h-full rounded-lg shadow-2xl"
            />
          </div>
        )}

      </div>
    </div>
  );
};
