import React, { useState } from 'react';
import { Workflow } from '../../types/workflow';
import { Plus, Trash2, Copy, Edit2, X, ExternalLink, Clock, Sparkles } from 'lucide-react';
import { formatTimestamp } from '../../utils/formatters';
import { ALL_TEMPLATES } from '../../storage/starterWorkflow';

interface WorkflowListModalProps {
  isOpen: boolean;
  workflows: Workflow[];
  activeWorkflowId: string;
  onClose: () => void;
  onSelectWorkflow: (id: string) => void;
  onCreateWorkflow: () => void;
  onDuplicateWorkflow: (workflow: Workflow) => void;
  onDeleteWorkflow: (id: string) => void;
  onResetTemplates?: () => void;
}

export const WorkflowListModal: React.FC<WorkflowListModalProps> = ({
  isOpen,
  workflows,
  activeWorkflowId,
  onClose,
  onSelectWorkflow,
  onCreateWorkflow,
  onDuplicateWorkflow,
  onDeleteWorkflow,
  onResetTemplates,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-[#11141c] border border-[#232a3b] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#1c2230] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">My Workflows</h2>
            <p className="text-xs text-gray-400 mt-0.5">Manage and switch between your automation workflows</p>
          </div>
          <div className="flex items-center gap-2">
            {onResetTemplates && (
              <button
                onClick={() => {
                  if (confirm('Restore all 5 complex official templates? This will refresh any missing templates.')) {
                    onResetTemplates();
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1c2230] hover:bg-[#252c3d] text-gray-200 hover:text-white font-medium text-xs transition-colors border border-[#2d374d]"
                title="Restore all official complex templates"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Restore Templates</span>
              </button>
            )}
            <button
              onClick={onCreateWorkflow}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Workflow</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1c2230] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Workflows List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {workflows.map((wf) => {
            const isActive = wf.id === activeWorkflowId;
            const isTemplate = ALL_TEMPLATES.some((t) => t.id === wf.id);
            return (
              <div
                key={wf.id}
                onClick={() => {
                  onSelectWorkflow(wf.id);
                  onClose();
                }}
                className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-950/20 border-indigo-500/50 shadow-sm'
                    : 'bg-[#161a24] hover:bg-[#1c2230] border-[#232a3b]'
                }`}
              >
                <div className="overflow-hidden pr-3 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-xs text-white truncate">{wf.name}</span>
                    {isActive && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.2 rounded font-mono">
                        Active
                      </span>
                    )}
                    {isTemplate && (
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 rounded font-mono font-medium">
                        Template
                      </span>
                    )}
                  </div>
                  {wf.description && (
                    <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                      {wf.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1.5">
                    <span>{wf.nodes.length} nodes</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-500" />
                      Updated {wf.updatedAt ? new Date(wf.updatedAt).toLocaleDateString() : 'recently'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onDuplicateWorkflow(wf)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Duplicate Workflow"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {workflows.length > 1 && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete workflow "${wf.name}"?`)) {
                          onDeleteWorkflow(wf.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete Workflow"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
