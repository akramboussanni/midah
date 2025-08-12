import React, { createContext, useContext, useState, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface DependencyStatus {
  available: boolean;
  path?: string;
  success?: boolean;
  error?: string;
}

export interface DependenciesStatus {
  "yt-dlp": DependencyStatus;
  ffmpeg: DependencyStatus;
}

interface DependencyContextType {
  dependencies: DependenciesStatus | null;
  isChecking: boolean;
  isDownloading: boolean;
  error: string | null;
  justDownloaded: boolean;
  hasCheckedDependencies: boolean;
  downloadDependencies: () => Promise<void>;
  checkDependencies: () => Promise<void>;
  checkDependenciesIfNeeded: () => Promise<void>;
  areAllDependenciesAvailable: () => boolean;
  getMissingDependencies: () => string[];
}

const DependencyContext = createContext<DependencyContextType | undefined>(undefined);

export const useDependencies = () => {
  const context = useContext(DependencyContext);
  if (context === undefined) {
    throw new Error('useDependencies must be used within a DependencyProvider');
  }
  return context;
};

interface DependencyProviderProps {
  children: ReactNode;
}

export const DependencyProvider: React.FC<DependencyProviderProps> = ({ children }) => {
  const [dependencies, setDependencies] = useState<DependenciesStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justDownloaded, setJustDownloaded] = useState(false);
  const [hasCheckedDependencies, setHasCheckedDependencies] = useState(false);

  const checkDependencies = async () => {
    if (isChecking) {
      console.log('Dependency check already in progress, skipping...');
      return;
    }
    
    setIsChecking(true);
    setError(null);
    
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Dependency check timed out')), 45000);
      });
      
      const result = await Promise.race([
        invoke<DependenciesStatus>('check_dependencies'),
        timeoutPromise
      ]);
      
      console.log('Dependency check result:', result);
      setDependencies(result);
    } catch (err) {
      console.error('Dependency check failed:', err);
      setError(err instanceof Error ? err.message : String(err));
      setDependencies({
        "yt-dlp": { available: false, error: 'Check failed' },
        ffmpeg: { available: false, error: 'Check failed' }
      });
    } finally {
      setIsChecking(false);
    }
  };

  const downloadDependencies = async () => {
    setIsDownloading(true);
    setError(null);
    setJustDownloaded(false);
    
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Download timed out')), 45000);
      });
      
      const result = await Promise.race([
        invoke<DependenciesStatus>('download_dependencies'),
        timeoutPromise
      ]);
      
      setDependencies(result);
      
      const failedDeps = Object.entries(result).filter(([_, status]) => 
        status.available === false
      );
      
      if (failedDeps.length > 0) {
        const errorMessages = failedDeps.map(([name, status]) => 
          `${name}: ${status.error}`
        ).join(', ');
        setError(`Failed to download some dependencies: ${errorMessages}`);
      } else {
        setJustDownloaded(true);
        setTimeout(() => {
          checkDependencies();
        }, 500);
      }
    } catch (err) {
      console.error('Download failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDownloading(false);
    }
  };

  const areAllDependenciesAvailable = () => {
    if (!dependencies) return false;
    return dependencies["yt-dlp"].available && dependencies.ffmpeg.available;
  };

  const getMissingDependencies = () => {
    if (!dependencies) return [];
    
    const missing = [];
    if (!dependencies["yt-dlp"].available) missing.push('yt-dlp');
    if (!dependencies.ffmpeg.available) missing.push('ffmpeg');
    return missing;
  };

  const checkDependenciesIfNeeded = async () => {
    if (hasCheckedDependencies) {
      console.log('Dependencies already checked, skipping...');
      return;
    }
    
    console.log('Checking dependencies for the first time...');
    setTimeout(async () => {
      await checkDependencies();
      setHasCheckedDependencies(true);
    }, 0);
  };



  const value: DependencyContextType = {
    dependencies,
    isChecking,
    isDownloading,
    error,
    justDownloaded,
    hasCheckedDependencies,
    downloadDependencies,
    checkDependencies,
    checkDependenciesIfNeeded,
    areAllDependenciesAvailable,
    getMissingDependencies,
  };

  return (
    <DependencyContext.Provider value={value}>
      {children}
    </DependencyContext.Provider>
  );
}; 