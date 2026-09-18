import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Square,
  StepForward,
  Circle,
  FolderOpen,
  Download,
  Upload,
  Undo2,
  Redo2,
  Maximize2,
  Check,
  Loader2,
  Layers,
  Sparkles,
  MoreHorizontal,
  Bot,
  Rabbit,
  ChevronDown,
  Key,
} from 'lucide-react';
import { WorkflowExecutionStatus } from '../../types/execution';
import { HumanIntensity } from '../../types/workflow';
import { HUMAN_INTENSITY_HINTS, HUMAN_INTENSITY_LABELS } from '../../utils/human';

interface HeaderBarProps {
  workflowName: string;
  isSaving: boolean;
  executionStatus: WorkflowExecutionStatus;
  isRecording: boolean;
  canUndo: boolean;
  canRedo: boolean;
  humanMode?: boolean;
  humanIntensity?: HumanIntensity;
  humanCursor?: boolean;
  onRenameWorkflow: (name: string) => void;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
  onStep: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenWorkflows: () => void;
  onOpenBotCredentials?: () => void;
  onExport: () => void;
  onImport: () => void;
  onFitView: () => void;
  onToggleAiCopilot: () => void;
  isAiCopilotOpen?: boolean;
  onOpenBrowserAgent?: () => void;
  onToggleHumanMode?: () => void;
  onChangeHumanIntensity?: (intensity: HumanIntensity) => void;
  onToggleHumanCursor?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  workflowName,
  isSaving,
  executionStatus,
  isRecording,
  canUndo,
  canRedo,
  humanMode,
  humanIntensity,
  humanCursor,
  onRenameWorkflow,
  onRun,
  onPause,
  onResume,
  onStep,
  onStop,
  onToggleRecord,
  onUndo,
  onRedo,
  onOpenWorkflows,
  onOpenBotCredentials,
  onExport,
  onImport,
  onFitView,
  onToggleAiCopilot,
  isAiCopilotOpen,
  onOpenBrowserAgent,
  onToggleHumanMode,
  onChangeHumanIntensity,
  onToggleHumanCursor,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(workflowName);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showHumanMenu, setShowHumanMenu] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const humanMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTempName(workflowName);
  }, [workflowName]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
      if (humanMenuRef.current && !humanMenuRef.current.contains(e.target as Node)) {
        setShowHumanMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFinishRename = () => {
    setIsEditingName(false);
    if (tempName.trim() && tempName !== workflowName) {
      onRenameWorkflow(tempName.trim());
    } else {
      setTempName(workflowName);
    }
  };

  const isRunning = executionStatus === 'running';
  const isPaused = executionStatus === 'paused';

  return (
    <header className="h-14 border-b border-[#1c2230] bg-[#0c0e14] px-2 sm:px-4 flex items-center justify-between select-none z-20 gap-1.5 sm:gap-2">
      {/* Left section: Logo & Workflow Name */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink">
        {/* Logo */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white font-bold text-sm sm:text-base">
            ⚡
          </div>
          <span className="font-bold text-sm tracking-tight text-white hidden md:inline">AutoFlow</span>
          <span className="text-[9px] uppercase font-mono px-1 py-0.5 rounded bg-[#1c2230] text-gray-400 border border-[#232a3b] hidden lg:inline">
            v1.0
          </span>
        </div>

        <div className="h-4 w-[1px] bg-[#232a3b] hidden sm:block shrink-0" />

        {/* Workflow Name (Editable) */}
        <div className="flex items-center gap-1 min-w-0">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishRename();
                if (e.key === 'Escape') {
                  setTempName(workflowName);
                  setIsEditingName(false);
                }
              }}
              className="bg-[#161a24] text-white text-xs font-semibold px-1.5 py-0.5 rounded border border-indigo-500 outline-none w-24 sm:w-36 md:w-48"
            />
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="text-xs font-semibold text-gray-200 hover:text-white px-1.5 py-1 rounded hover:bg-[#161a24] transition-colors truncate max-w-[70px] sm:max-w-[130px] md:max-w-[200px]"
              title="Click to rename workflow"
            >
              {workflowName}
            </button>
          )}

          {/* Save Status Indicator */}
          <div className="flex items-center gap-1 text-[10px] text-gray-500 font-mono shrink-0" title={isSaving ? 'Saving...' : 'Saved'}>
            {isSaving ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-400" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
            <span className="hidden md:inline">{isSaving ? 'Saving...' : 'Saved'}</span>
          </div>
        </div>
      </div>

      {/* Center section: Execution & Recording Controls */}
      <div className="flex items-center gap-1 bg-[#11141c] border border-[#1c2230] p-1 rounded-xl shadow-inner shrink-0">
        {/* Run / Pause / Resume */}
        {!isRunning && !isPaused ? (
          <button
            onClick={onRun}
            className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition-all active:scale-95 shrink-0"
            title="Run Workflow (Ctrl+Enter)"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Run</span>
          </button>
        ) : isPaused ? (
          <button
            onClick={onResume}
            className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-sm transition-all shrink-0"
            title="Resume Workflow"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Resume</span>
          </button>
        ) : (
          <button
            onClick={onPause}
            className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-sm transition-all shrink-0"
            title="Pause Workflow"
          >
            <Pause className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Pause</span>
          </button>
        )}

        {/* Step Forward (shown on sm screens) */}
        <button
          onClick={onStep}
          disabled={isRunning && !isPaused}
          className="p-1 sm:p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1c2230] disabled:opacity-40 transition-colors hidden sm:flex shrink-0"
          title="Step One Node"
        >
          <StepForward className="w-3.5 h-3.5" />
        </button>

        {/* Stop */}
        <button
          onClick={onStop}
          disabled={!isRunning && !isPaused}
          className="p-1 sm:p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-[#1c2230] disabled:opacity-40 transition-colors shrink-0"
          title="Stop Workflow"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
        </button>

        <div className="h-4 w-[1px] bg-[#232a3b] mx-0.5" />

        {/* Record Button */}
        <button
          onClick={onToggleRecord}
          className={`flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
            isRecording
              ? 'bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-600/30'
              : 'text-gray-300 hover:text-white hover:bg-[#1c2230]'
          }`}
          title={isRecording ? 'Stop Recording' : 'Record Browser Actions (R)'}
        >
          <Circle className={`w-3 h-3 ${isRecording ? 'fill-current animate-ping' : 'fill-rose-500 text-rose-500'}`} />
          <span className="hidden sm:inline">{isRecording ? 'Recording...' : 'Record'}</span>
        </button>

        <div className="h-4 w-[1px] bg-[#232a3b] mx-0.5" />

        {/* Human Mode toggle + pacing popover */}
        {onToggleHumanMode && (
          <div className="relative shrink-0" ref={humanMenuRef}>
            <div className="flex items-center rounded-lg overflow-hidden">
              <button
                onClick={onToggleHumanMode}
                className={`flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs font-medium transition-all ${
                  humanMode
                    ? 'bg-amber-500/90 text-[#1a1206] shadow-lg shadow-amber-500/20'
                    : 'text-gray-300 hover:text-white hover:bg-[#1c2230]'
                }`}
                title={
                  humanMode
                    ? `Human Mode ON (${HUMAN_INTENSITY_LABELS[humanIntensity || 'natural']}) — click to disable`
                    : 'Human Mode OFF — enable human-like pauses and cursor movement'
                }
              >
                <Rabbit className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{humanMode ? 'Human: ON' : 'Human'}</span>
              </button>
              <button
                onClick={() => setShowHumanMenu((v) => !v)}
                className={`px-1 py-1 sm:py-1.5 border-l text-xs transition-all ${
                  humanMode
                    ? 'bg-amber-500/90 text-[#1a1206] border-amber-600/60'
                    : 'text-gray-400 hover:text-white hover:bg-[#1c2230] border-[#232a3b]'
                }`}
                title="Human Mode settings"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {showHumanMenu && (
              <div className="absolute right-0 mt-1 w-60 bg-[#11141c] border border-[#232a3b] rounded-xl shadow-2xl p-3 z-50 text-xs text-gray-300 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-200">Human Mode</span>
                  <span
                    className={`uppercase text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      humanMode ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    {humanMode ? 'on' : 'off'}
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Pacing</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['subtle', 'natural', 'slow'] as HumanIntensity[]).map((level) => (
                      <button
                        key={level}
                        onClick={() => onChangeHumanIntensity?.(level)}
                        className={`py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${
                          (humanIntensity || 'natural') === level
                            ? 'bg-amber-500/20 text-amber-200 border-amber-500/50'
                            : 'bg-[#161a24] text-gray-400 border-[#232a3b] hover:text-white'
                        }`}
                        title={HUMAN_INTENSITY_HINTS[level]}
                      >
                        {HUMAN_INTENSITY_LABELS[level]}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {HUMAN_INTENSITY_HINTS[humanIntensity || 'natural']}
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={humanCursor !== false}
                    onChange={() => onToggleHumanCursor?.()}
                    className="rounded bg-[#161a24] border-[#232a3b] text-amber-500"
                  />
                  <span>Show moving cursor</span>
                </label>

                <p className="text-[10px] text-gray-500 leading-relaxed border-t border-[#1c2230] pt-2">
                  Adds curved cursor travel and small jittered pauses between steps. Per-node typing
                  delays still take precedence.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right section: Workflows, History & Export/Import */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Undo / Redo - shown on lg screens */}
        <div className="hidden lg:flex items-center gap-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#161a24] disabled:opacity-30 transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#161a24] disabled:opacity-30 transition-colors"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onFitView}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#161a24] transition-colors"
            title="Fit Canvas (F)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <div className="h-4 w-[1px] bg-[#232a3b] mx-0.5" />
        </div>

        {/* AI Copilot - Always visible & prominent */}
        <button
          onClick={onToggleAiCopilot}
          className={`flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm shrink-0 ${
            isAiCopilotOpen
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white ring-2 ring-purple-400/50'
              : 'bg-gradient-to-r from-indigo-600/20 to-purple-600/20 text-purple-300 hover:text-white hover:from-indigo-600/40 hover:to-purple-600/40 border border-purple-500/40'
          }`}
          title="AI Workflow Copilot (Generates Nodes)"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="inline">AI</span>
          <span className="hidden sm:inline">Copilot</span>
        </button>

        {/* Autonomous Browser Agent - Vision-driven direct web execution */}
        {onOpenBrowserAgent && (
          <button
            onClick={onOpenBrowserAgent}
            className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-violet-600/20 to-indigo-600/20 hover:from-violet-600/40 hover:to-indigo-600/40 text-indigo-300 hover:text-white border border-indigo-500/40 transition-all shadow-sm shrink-0"
            title="Autonomous AI Browser Agent (Vision-Powered Browser Use)"
          >
            <Bot className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="inline">Agent</span>
          </button>
        )}

        {/* Workflows Modal Button */}
        <button
          onClick={onOpenWorkflows}
          className="p-1.5 sm:px-2 sm:py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-[#161a24] transition-colors border border-[#1c2230] flex items-center gap-1 shrink-0"
          title="My Workflows"
        >
          <FolderOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="hidden md:inline">Workflows</span>
        </button>

        {/* Bot Credentials Button */}
        {onOpenBotCredentials && (
          <button
            onClick={onOpenBotCredentials}
            className="p-1.5 sm:px-2 sm:py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-[#161a24] transition-colors border border-[#1c2230] flex items-center gap-1 shrink-0"
            title="Manage Bot Accounts (Telegram, Discord, Slack)"
          >
            <Key className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="hidden xl:inline">Bot Accounts</span>
          </button>
        )}

        {/* Export / Import - shown on lg screens */}
        <div className="hidden lg:flex items-center gap-0.5">
          <button
            onClick={onExport}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#161a24] transition-colors"
            title="Export Workflow JSON"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onImport}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#161a24] transition-colors"
            title="Import Workflow JSON"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* More Actions Menu for compact/sidepanel view */}
        <div className="relative lg:hidden" ref={moreMenuRef}>
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`p-1.5 rounded-lg transition-colors border ${
              showMoreMenu
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                : 'text-gray-400 hover:text-white hover:bg-[#161a24] border-[#1c2230]'
            }`}
            title="More Options"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {showMoreMenu && (
            <div className="absolute right-0 mt-1 w-44 bg-[#11141c] border border-[#232a3b] rounded-xl shadow-2xl py-1 z-50 text-xs text-gray-300 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  onUndo();
                  setShowMoreMenu(false);
                }}
                disabled={!canUndo}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#1c2230] hover:text-white disabled:opacity-40"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo (Ctrl+Z)</span>
              </button>
              <button
                onClick={() => {
                  onRedo();
                  setShowMoreMenu(false);
                }}
                disabled={!canRedo}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#1c2230] hover:text-white disabled:opacity-40"
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span>Redo</span>
              </button>
              <button
                onClick={() => {
                  onFitView();
                  setShowMoreMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#1c2230] hover:text-white"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Fit Canvas (F)</span>
              </button>
              {onOpenBotCredentials && (
                <button
                  onClick={() => {
                    onOpenBotCredentials();
                    setShowMoreMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#1c2230] hover:text-white"
                >
                  <Key className="w-3.5 h-3.5 text-blue-400" />
                  <span>Bot Accounts</span>
                </button>
              )}
              <div className="h-[1px] bg-[#1c2230] my-1" />
              <button
                onClick={() => {
                  onExport();
                  setShowMoreMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#1c2230] hover:text-white"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
              <button
                onClick={() => {
                  onImport();
                  setShowMoreMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#1c2230] hover:text-white"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import JSON</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
