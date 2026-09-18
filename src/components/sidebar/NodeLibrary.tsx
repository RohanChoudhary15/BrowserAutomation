import React, { useState, useMemo } from 'react';
import { NODE_REGISTRY, CATEGORIES, NodeDefinition } from '../../nodes/registry';
import { NodeType, NodeCategory } from '../../types/workflow';
import { Icon } from '../common/Icon';
import { Search, ChevronLeft, ChevronRight, X, Plus } from 'lucide-react';

interface NodeLibraryProps {
  onAddNode: (type: NodeType) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const NodeLibrary: React.FC<NodeLibraryProps> = ({
  onAddNode,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<NodeCategory | 'all'>('all');

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.values(NODE_REGISTRY).filter((def) => {
      if (selectedCategory !== 'all' && def.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        def.label.toLowerCase().includes(q) ||
        def.type.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        def.category.toLowerCase().includes(q)
      );
    });
  }, [search, selectedCategory]);

  const onDragStart = (e: React.DragEvent, type: NodeType) => {
    e.dataTransfer.setData('application/autoflow-node', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  if (isCollapsed) {
    return (
      <div className="w-12 border-r border-[#1c2230] bg-[#0c0e14] flex flex-col items-center py-3 select-none">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#161a24] transition-colors"
          title="Expand Node Library"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="w-64 max-w-[85vw] absolute sm:relative left-0 top-0 bottom-0 border-r border-[#1c2230] bg-[#0c0e14] flex flex-col select-none z-20 sm:z-10 shadow-2xl sm:shadow-none">
      {/* Header */}
      <div className="p-3 border-b border-[#1c2230] flex items-center justify-between">
        <div className="font-semibold text-xs text-gray-300 uppercase tracking-wider">Node Library</div>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded text-gray-500 hover:text-white hover:bg-[#161a24] transition-colors"
          title="Collapse Sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-[#1c2230]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search nodes (e.g. click, wait)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#11141c] text-xs text-gray-200 pl-8 pr-7 py-1.5 rounded-lg border border-[#1c2230] focus:border-indigo-500 focus:outline-none placeholder-gray-500 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-2 text-gray-500 hover:text-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1 mt-2.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white font-medium'
                : 'bg-[#161a24] text-gray-400 hover:text-gray-200'
            }`}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'bg-[#161a24] text-gray-400 hover:text-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Nodes List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredNodes.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-500">No nodes found matching &quot;{search}&quot;</div>
        ) : (
          filteredNodes.map((def) => {
            const cat = CATEGORIES.find((c) => c.id === def.category) || CATEGORIES[0];
            return (
              <div
                key={def.type}
                draggable
                onDragStart={(e) => onDragStart(e, def.type)}
                onClick={() => onAddNode(def.type)}
                className="group flex items-center justify-between p-2 rounded-xl bg-[#11141c] hover:bg-[#161a24] border border-[#1c2230] hover:border-indigo-500/50 cursor-grab active:cursor-grabbing transition-all select-none shadow-sm"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: cat.color }}
                  >
                    <Icon name={def.icon} className="w-3.5 h-3.5" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-xs font-medium text-gray-200 group-hover:text-white truncate">
                      {def.label}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">{def.description}</div>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddNode(def.type);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-all shrink-0"
                  title="Add to canvas"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
