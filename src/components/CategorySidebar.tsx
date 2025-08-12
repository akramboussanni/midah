import React, { useState } from 'react';
import { FolderOpen, Folder, Music, Plus } from 'lucide-react';

interface CategorySidebarProps {
  categories: string[];
  selectedCategory: string;
  onCategorySelect: (category: string) => void;
  soundCounts: Record<string, number>;
  onCreateCategory: (categoryName: string) => void;
}

export const CategorySidebar: React.FC<CategorySidebarProps> = ({
  categories,
  selectedCategory,
  onCategorySelect,
  soundCounts,
  onCreateCategory,
}) => {
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const allCategories = ['All', ...Array.from(new Set(categories)).sort()];

  return (
    <div className="w-64 border-r border-gray-800 h-full overflow-y-auto" style={{ background: '#0a0d13' }}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
            <Music className="h-5 w-5" />
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
          {allCategories.map((category) => {
            const isSelected = selectedCategory === category;
            const count = category === 'All' 
              ? Object.values(soundCounts).reduce((sum, count) => sum + count, 0)
              : soundCounts[category] || 0;
            
            return (
              <button
                key={category}
                onClick={() => onCategorySelect(category)}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors duration-200 text-left ${
                  isSelected
                    ? 'bg-gray-800/50 text-white'
                    : 'text-gray-300 hover:bg-gray-800/30 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-3">
                  {isSelected ? (
                    <FolderOpen className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <Folder className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="font-mono text-sm truncate">
                    {category === 'All' ? 'All Sounds' : category || 'Uncategorized'}
                  </span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  isSelected 
                    ? 'bg-gray-700 text-white' 
                    : 'bg-gray-800 text-gray-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
