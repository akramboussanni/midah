import { Music, Download, Settings } from 'lucide-react';
import { TabType } from '../types';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Navigation = ({ activeTab, onTabChange }: NavigationProps) => {
  const tabs = [
    { id: 'sounds' as TabType, label: 'Sounds', icon: Music },
    { id: 'youtube' as TabType, label: 'YouTube', icon: Download },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings }
  ];

  return (
    <nav className="border-b border-gray-800 bg-gray-900/20">
      <div className="container mx-auto px-6">
        <div className="flex space-x-8">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`py-4 px-2 border-b-2 font-medium transition-all duration-300 ${
                activeTab === id
                  ? 'border-white text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Icon className="h-4 w-4" />
                <span className="font-mono text-sm">{label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}; 