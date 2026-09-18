import React, { useState, useRef, useEffect } from 'react';
import { NODE_REGISTRY, CATEGORIES } from '../../nodes/registry';
import { NodeType } from '../../types/workflow';
import { Icon } from '../common/Icon';
import { Search, X } from 'lucide-react';

interface QuickAddModalProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onSelectNode: (type: NodeType) => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  position,
  onClose,
  onSelectNode,
}) => {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('pointerdown', handleClickOutside as any, { capture: true });
      window.addEventListener('mousedown', handleClickOutside, { capture: true });
    }
    return () => {
      window.removeEventListener('pointerdown', handleClickOutside as any, { capture: true });
      window.removeEventListener('mousedown', handleClickOutside, { capture: true });
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = Object.values(NODE_REGISTRY).filter((n) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      n.label.toLowerCase().includes(q) ||
      n.type.toLowerCase().includes(q) ||
      n.description.toLowerCase().includes(q) ||
      n.category.toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* Invisible backdrop to capture canvas clicks */}
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onMouseDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={containerRef}
        style={{
          left: `${Math.min(position.x, window.innerWidth - 300)}px`,
          top: `${Math.min(position.y, window.innerHeight - 360)}px`,
        }}
        className="fixed z-50 w-72 bg-[#11141c] border border-[#232a3b] rounded-2xl shadow-2xl p-2 text-xs select-none backdrop-blur-xl animate-in zoom-in-95 duration-100"
      >
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Add node (e.g. click)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered.length > 0) {
              onSelectNode(filtered[0].type);
              onClose();
            }
            if (e.key === 'Escape') onClose();
          }}
          className="w-full bg-[#161a24] text-gray-200 pl-8 pr-6 py-1.5 rounded-lg border border-[#232a3b] focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1">
        {filtered.map((def) => {
          const cat = CATEGORIES.find((c) => c.id === def.category) || CATEGORIES[0];
          return (
            <div
              key={def.type}
              onClick={() => {
                onSelectNode(def.type);
                onClose();
              }}
              className="flex items-center gap-2 p-2 rounded-xl hover:bg-[#1c2230] cursor-pointer transition-colors"
            >
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: cat.color }}
              >
                <Icon name={def.icon} className="w-3 h-3" />
              </div>
              <div className="overflow-hidden">
                <div className="font-semibold text-gray-200 truncate">{def.label}</div>
                <div className="text-[10px] text-gray-500 truncate">{def.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </>
);
};
