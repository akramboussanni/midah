import React, { useState } from 'react';
import { confirm as tauriConfirm } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Folder, Layers, Plus } from 'lucide-react';

interface CategorySidebarProps {
  categories: string[];
  selectedCategory: string;
  onCategorySelect: (category: string) => void;
  soundCounts: Record<string, number>;
  onCreateCategory: (categoryName: string) => void;
  onDeleteCategory?: (categoryNameOrId: string) => void;
}

export const CategorySidebar: React.FC<CategorySidebarProps> = ({
  categories,
  selectedCategory,
  onCategorySelect,
  soundCounts,
  onCreateCategory,
  onDeleteCategory,
}) => {
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const baseCategories = Array.from(new Set(categories)).sort();
  const hasUncategorized = baseCategories.includes('Uncategorized');
  const pinned = ['All', ...(hasUncategorized ? ['Uncategorized'] : [])];
  const others = baseCategories.filter(c => c !== 'Uncategorized');

  return (
    <div className="w-64 border-r border-gray-800 h-full overflow-y-auto" style={{ background: '#0a0d13' }}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-mono text-white flex items-center space-x-2">
            <Layers className="h-5 w-5" />
            <span>Categories</span>
          </h3>
          <button
            onClick={() => {
              setShowNewCategoryInput(true);
              setNewCategoryName('');
            }}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded transition-colors duration-200"
            title="Create new category"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {showNewCategoryInput && (
          <div className="mb-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700/30">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category name..."
              className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded font-mono text-white placeholder-gray-400 mb-2"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newCategoryName.trim()) {
                  onCreateCategory(newCategoryName.trim());
                  setShowNewCategoryInput(false);
                  setNewCategoryName('');
                }
              }}
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  if (newCategoryName.trim()) {
                    onCreateCategory(newCategoryName.trim());
                    setShowNewCategoryInput(false);
                    setNewCategoryName('');
                  }
                }}
                className="flex-1 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewCategoryInput(false);
                  setNewCategoryName('');
                }}
                className="flex-1 px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        <div className="space-y-1">
          {[...pinned].map((category) => {
            const isSelected = selectedCategory === category;
            const count = soundCounts[category] || 0;
            
            return (
              <div key={category} className={`flex items-center justify-between p-2 rounded-lg transition-colors duration-200 ${
                isSelected ? 'bg-gray-800/50' : 'hover:bg-gray-800/30'
              }`}>
                <button
                  onClick={() => onCategorySelect(category)}
                  className={`flex-1 flex items-center gap-3 text-left ${isSelected ? 'text-white' : 'text-gray-300 hover:text-white'}`}
                >
                  {isSelected ? (
                    <FolderOpen className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <Folder className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="font-mono text-sm truncate">
                    {category === 'All' ? 'All Sounds' : category || 'Uncategorized'}
                  </span>
                </button>
                <span className={`text-xs px-2 py-1 rounded-full mr-2 ${
                  isSelected ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'
                }`}>
                  {count}
                </span>
                {category !== 'All' && category !== 'Uncategorized' && onDeleteCategory && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const confirmed = await tauriConfirm(`Delete category "${category}"?`, {
                        title: 'Delete category',
                        kind: 'warning',
                        okLabel: 'Delete',
                        cancelLabel: 'Cancel',
                      });
                      if (!confirmed) return;
                      onDeleteCategory(category);
                    }}
                    className="p-1 rounded hover:bg-red-900/30 text-red-400 hover:text-red-300"
                    title="Delete category"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          {others.length > 0 && (
            <div className="my-3 border-t border-gray-800" />
          )}
          {others.map((category) => {
            const isSelected = selectedCategory === category;
            const count = soundCounts[category] || 0;

            return (
              <div key={category} className={`flex items-center justify-between p-2 rounded-lg transition-colors duration-200 ${
                isSelected ? 'bg-gray-800/50' : 'hover:bg-gray-800/30'
              }`}>
                <button
                  onClick={() => onCategorySelect(category)}
                  className={`flex-1 flex items-center gap-3 text-left ${isSelected ? 'text-white' : 'text-gray-300 hover:text-white'}`}
                >
                  {isSelected ? (
                    <FolderOpen className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <Folder className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="font-mono text-sm truncate">
                    {category}
                  </span>
                </button>
                <span className={`text-xs px-2 py-1 rounded-full mr-2 ${
                  isSelected ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'
                }`}>
                  {count}
                </span>
                {onDeleteCategory && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const confirmed = await tauriConfirm(`Delete category "${category}"?`, {
                        title: 'Delete category',
                        kind: 'warning',
                        okLabel: 'Delete',
                        cancelLabel: 'Cancel',
                      });
                      if (!confirmed) return;
                      onDeleteCategory(category);
                    }}
                    className="p-1 rounded hover:bg-red-900/30 text-red-400 hover:text-red-300"
                    title="Delete category"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
