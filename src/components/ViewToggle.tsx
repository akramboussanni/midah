import { Grid, List } from 'lucide-react';

export type ViewType = 'grid' | 'list';

interface ViewToggleProps {
  view: ViewType;
  onViewChange: (view: ViewType) => void;
  isLoading?: boolean;
}

export const ViewToggle = ({ view, onViewChange, isLoading = false }: ViewToggleProps) => {
  if (isLoading) {
    return (
      <div className="flex rounded-lg bg-gray-800/50 border border-gray-700">
        <div className="p-2 rounded-l-lg bg-gray-700/50 animate-pulse">
          <div className="h-4 w-4 bg-gray-600 rounded"></div>
        </div>
        <div className="p-2 rounded-r-lg bg-gray-700/50 animate-pulse">
          <div className="h-4 w-4 bg-gray-600 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex rounded-lg bg-gray-800/50 border border-gray-700">
      <button
        onClick={() => onViewChange('grid')}
        className={`p-2 rounded-l-lg transition-colors duration-200 ${
          view === 'grid'
            ? 'bg-gray-700 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
        }`}
        title="Grid View"
      >
        <Grid className="h-4 w-4" />
      </button>
      <button
        onClick={() => onViewChange('list')}
        className={`p-2 rounded-r-lg transition-colors duration-200 ${
          view === 'list'
            ? 'bg-gray-700 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
        }`}
        title="List View"
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
};
