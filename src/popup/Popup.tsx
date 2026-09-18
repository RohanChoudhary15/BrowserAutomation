import React, { useState, useEffect } from 'react';
import { Play, Circle, ExternalLink, Columns, Layers, Sparkles } from 'lucide-react';
import { loadAllWorkflows } from '../storage/workflowStore';
import { Workflow } from '../types/workflow';

export const Popup: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);

  useEffect(() => {
    loadAllWorkflows().then((all) => {
      setWorkflows(all);
      if (all.length > 0) setActiveWorkflow(all[0]);
    });
  }, []);

  const openFullEditor = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    } else {
      window.open('index.html', '_blank');
    }
  };

  const openSidePanel = () => {
    if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.sidePanel.open({ tabId: tabs[0].id });
        }
      });
    } else {
      openFullEditor();
    }
  };

  const handleRecordTab = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'START_RECORDING' });
      openSidePanel();
    }
  };

  return (
    <div className="w-[340px] bg-[#0c0e14] text-white p-4 select-none flex flex-col gap-4 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#1c2230]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-sm shadow-md">
            ⚡
          </div>
          <div>
            <h1 className="font-bold text-sm leading-none">AutoFlow</h1>
            <span className="text-[10px] text-gray-400">Visual Browser Automation</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Ready</span>
        </div>
      </div>

      {/* Active Workflow Card */}
      <div className="bg-[#11141c] border border-[#1c2230] rounded-xl p-3">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
          Active Workflow
        </span>
        <div className="font-bold text-sm text-gray-100 truncate">
          {activeWorkflow ? activeWorkflow.name : 'Example Web Automation'}
        </div>
        <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2">
          <span>{activeWorkflow?.nodes.length || 0} nodes</span>
          <span>•</span>
          <span>Updated recently</span>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="space-y-2">
        <button
          onClick={openSidePanel}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-md transition-all active:scale-[0.98]"
        >
          <Columns className="w-4 h-4" />
          <span>Open Side Panel Editor</span>
        </button>

        <button
          onClick={openFullEditor}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#161a24] hover:bg-[#1c2230] text-gray-200 hover:text-white font-medium text-xs border border-[#232a3b] transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Open Full-Screen Canvas</span>
        </button>

        <button
          onClick={handleRecordTab}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 font-medium text-xs border border-rose-500/30 transition-all"
        >
          <Circle className="w-3 h-3 fill-current" />
          <span>Record Current Tab</span>
        </button>
      </div>

      {/* Footer Info */}
      <div className="pt-2 border-t border-[#1c2230] text-center text-[10px] text-gray-500">
        Chrome & Edge Manifest V3 • Node-based Web Automation
      </div>
    </div>
  );
};
