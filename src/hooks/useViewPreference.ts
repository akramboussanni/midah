import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ViewType } from '../components/ViewToggle';

const VIEW_PREFERENCE_KEY = 'preferred_view';

export const useViewPreference = () => {
  const [view, setView] = useState<ViewType>('list');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadViewPreference();
  }, []);

  const loadViewPreference = async () => {
    try {
      const savedView = await invoke<string>('get_setting', { key: VIEW_PREFERENCE_KEY });
      if (savedView && (savedView === 'grid' || savedView === 'list')) {
        setView(savedView as ViewType);
      }
    } catch (error) {
      console.error('Failed to load view preference:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateView = async (newView: ViewType) => {
    try {
      setView(newView);
      await invoke('save_setting', { 
        key: VIEW_PREFERENCE_KEY, 
        value: newView 
      });
    } catch (error) {
      console.error('Failed to save view preference:', error);
    }
  };

  return {
    view,
    updateView,
    isLoading
  };
};
