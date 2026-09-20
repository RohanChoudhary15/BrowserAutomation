import React, { useState, useEffect, useMemo } from 'react';
import {
  Brain,
  Search,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Globe,
  Bot,
  User,
  Sparkles,
  Clock,
  RefreshCw,
} from 'lucide-react';
import {
  SiteNote,
  getAllSiteNotes,
  saveSiteNote,
  updateSiteNote,
  deleteSiteNote,
  clearDomainNotes,
  normalizeDomain,
} from '../../storage/siteMemoryStore';

interface SiteMemoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
  initialDomain?: string;
}

export const SiteMemoryManager: React.FC<SiteMemoryManagerProps> = ({
  isOpen,
  onClose,
  initialDomain,
}) => {
  const [allNotesMap, setAllNotesMap] = useState<Record<string, SiteNote[]>>({});
  const [activeDomainTab, setActiveDomainTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // New note form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTitle, setNewTitle] = useState('');

  // Inline editing state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');

  const currentNormalizedDomain = useMemo(() => {
    return initialDomain ? normalizeDomain(initialDomain) : 'global';
  }, [initialDomain]);

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      const map = await getAllSiteNotes();
      setAllNotesMap(map);
    } catch (err) {
      console.warn('Failed to load site memory notes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadNotes();
      if (initialDomain) {
        const norm = normalizeDomain(initialDomain);
        setActiveDomainTab(norm);
        setNewDomain(norm);
      } else {
        setNewDomain('global');
      }
    }
  }, [isOpen, initialDomain]);

  if (!isOpen) return null;

  // Compute unique domains list
  const availableDomains = Object.keys(allNotesMap).sort();

  // Flatten and filter notes
  const allNotesList = useMemo(() => {
    const list: SiteNote[] = [];
    Object.values(allNotesMap).forEach((notes) => {
      list.push(...notes);
    });
    // Sort descending by updatedAt
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [allNotesMap]);

  const filteredNotes = useMemo(() => {
    return allNotesList.filter((note) => {
      // Domain filter
      if (activeDomainTab !== 'all' && note.domain !== activeDomainTab) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchContent = note.content.toLowerCase().includes(q);
        const matchDomain = note.domain.toLowerCase().includes(q);
        const matchTitle = (note.title || '').toLowerCase().includes(q);
        return matchContent || matchDomain || matchTitle;
      }
      return true;
    });
  }, [allNotesList, activeDomainTab, searchQuery]);

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    const domainToSave = normalizeDomain(newDomain.trim() || activeDomainTab !== 'all' ? activeDomainTab : currentNormalizedDomain);
    await saveSiteNote(domainToSave, newContent.trim(), 'user', newTitle.trim() || undefined);
    setNewContent('');
    setNewTitle('');
    setShowAddForm(false);
    await loadNotes();
  };

  const handleStartEdit = (note: SiteNote) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
    setEditTitle(note.title || '');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editContent.trim()) return;
    await updateSiteNote(id, editContent.trim(), editTitle.trim() || undefined);
    setEditingNoteId(null);
    await loadNotes();
  };

  const handleDelete = async (id: string) => {
    await deleteSiteNote(id);
    await loadNotes();
  };

  const handleClearDomain = async (domain: string) => {
    if (window.confirm(`Are you sure you want to delete all memory notes for ${domain}?`)) {
      await clearDomainNotes(domain);
      await loadNotes();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl h-[85vh] bg-[#0e121a] border border-[#1f2638] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-gray-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c2233] bg-[#131824]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Permanent Site Memory & Notes
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {allNotesList.length} Notes Stored
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Persistent domain knowledge automatically maintained and read by the Autonomous Agent across visits.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Note</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1c2230] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Domain Filter Bar */}
        <div className="p-3 bg-[#111622] border-b border-[#1c2233] flex flex-col sm:flex-row gap-2 items-center justify-between">
          {/* Domain Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveDomainTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeDomainTab === 'all'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-[#181f2f] text-gray-400 hover:text-gray-200'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>All Domains ({allNotesList.length})</span>
            </button>

            {currentNormalizedDomain !== 'global' && (
              <button
                onClick={() => setActiveDomainTab(currentNormalizedDomain)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  activeDomainTab === currentNormalizedDomain
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-[#181f2f] text-indigo-300 hover:text-indigo-100 border border-indigo-500/30'
                }`}
              >
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>Current: {currentNormalizedDomain}</span>
              </button>
            )}

            {availableDomains
              .filter((d) => d !== currentNormalizedDomain)
              .map((domain) => (
                <button
                  key={domain}
                  onClick={() => setActiveDomainTab(domain)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    activeDomainTab === domain
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-[#181f2f] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {domain} ({(allNotesMap[domain] || []).length})
                </button>
              ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search site notes..."
              className="w-full bg-[#0a0d14] text-xs text-white pl-8 pr-3 py-1.5 rounded-lg border border-[#1f2638] focus:border-purple-500 outline-none placeholder-gray-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Add Note Form Modal/Card */}
        {showAddForm && (
          <form
            onSubmit={handleCreateNote}
            className="p-4 bg-[#141b2b] border-b border-[#232c40] space-y-3 animate-fade-in"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Create Site Memory Note
              </span>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Domain / URL (e.g. google.com, github.com, global)
                </label>
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="google.com"
                  className="w-full bg-[#0a0d14] text-xs text-white px-3 py-1.5 rounded-lg border border-[#1f2638] focus:border-purple-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Title (Optional)
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Cookie Consent or Login Selector"
                  className="w-full bg-[#0a0d14] text-xs text-white px-3 py-1.5 rounded-lg border border-[#1f2638] focus:border-purple-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">
                Note / Knowledge Content for Agent
              </label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="e.g. Always click #onetrust-accept-btn-handler if cookie modal appears. Main search bar selector is input[type=search]."
                rows={3}
                className="w-full bg-[#0a0d14] text-xs text-white p-2.5 rounded-lg border border-[#1f2638] focus:border-purple-500 outline-none resize-none font-mono"
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 bg-[#1a202c] hover:bg-[#252d3d] text-gray-300 rounded-lg text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newContent.trim()}
                className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-all disabled:opacity-50"
              >
                Save to Memory
              </button>
            </div>
          </form>
        )}

        {/* Notes List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-gray-500 gap-2 text-xs">
              <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
              <span>Loading permanent notes...</span>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-center text-gray-500 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#141a27] flex items-center justify-center text-gray-400">
                <Brain className="w-6 h-6 text-purple-400/60" />
              </div>
              <div className="max-w-md">
                <p className="text-sm font-semibold text-gray-300">No notes found</p>
                <p className="text-xs text-gray-400 mt-1">
                  {searchQuery
                    ? `No notes matching "${searchQuery}"`
                    : `No permanent notes recorded yet for ${activeDomainTab === 'all' ? 'any domain' : activeDomainTab}. As the Autonomous Agent explores websites, it will autonomously remember selectors, cookies, and page tips here!`}
                </p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-3.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg text-xs font-medium border border-purple-500/30 transition-colors"
              >
                + Add your first note
              </button>
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isEditing = editingNoteId === note.id;

              return (
                <div
                  key={note.id}
                  className="bg-[#121622] hover:bg-[#151a29] border border-[#1d2334] rounded-xl p-3.5 transition-colors group shadow-sm"
                >
                  {isEditing ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-purple-300">
                          Edit Note ({note.domain})
                        </span>
                        <button
                          onClick={() => setEditingNoteId(null)}
                          className="text-gray-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Title (Optional)"
                        className="w-full bg-[#0a0d14] text-xs text-white px-3 py-1 rounded-lg border border-[#1f2638] outline-none"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                        className="w-full bg-[#0a0d14] text-xs text-white p-2.5 rounded-lg border border-[#1f2638] focus:border-purple-500 outline-none resize-none font-mono"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingNoteId(null)}
                          className="px-2.5 py-1 bg-[#1a202c] text-gray-300 rounded text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(note.id)}
                          className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Changes</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Note Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#1a2236] text-indigo-300 border border-indigo-500/20">
                            {note.domain}
                          </span>

                          <span
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              note.source === 'agent'
                                ? 'bg-purple-950/60 text-purple-300 border border-purple-500/30'
                                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {note.source === 'agent' ? (
                              <>
                                <Bot className="w-2.5 h-2.5" />
                                <span>AI Agent</span>
                              </>
                            ) : (
                              <>
                                <User className="w-2.5 h-2.5" />
                                <span>User</span>
                              </>
                            )}
                          </span>

                          {note.title && (
                            <span className="text-xs font-semibold text-gray-200">
                              {note.title}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] text-gray-500 flex items-center gap-1 mr-1">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(note.updatedAt).toLocaleDateString()}
                          </span>
                          <button
                            onClick={() => handleStartEdit(note)}
                            className="p-1 text-gray-400 hover:text-white hover:bg-[#1f2638] rounded transition-colors"
                            title="Edit note"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(note.id)}
                            className="p-1 text-gray-400 hover:text-red-400 hover:bg-[#1f2638] rounded transition-colors"
                            title="Delete note"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Note Content */}
                      <p className="text-xs text-gray-300 font-mono bg-[#0b0e15] p-2.5 rounded-lg border border-[#181f2f] whitespace-pre-wrap select-text leading-relaxed">
                        {note.content}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[#1c2233] bg-[#111622] flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>These notes are automatically injected into the Vision AI's prompt whenever you visit the corresponding website.</span>
          </div>
          {activeDomainTab !== 'all' && (allNotesMap[activeDomainTab] || []).length > 0 && (
            <button
              onClick={() => handleClearDomain(activeDomainTab)}
              className="text-[11px] text-red-400 hover:text-red-300 hover:underline transition-colors shrink-0 ml-2"
            >
              Clear all {activeDomainTab} notes
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
