import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt?: number;
  pendingCount: number;
  conflictCount: number;
  vectorClock: Record<string, number>;
}

interface SyncContextType {
  status: SyncStatus;
  triggerSync: () => Promise<boolean>;
  setStatus: (status: Partial<SyncStatus>) => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    conflictCount: 0,
    vectorClock: {}
  });

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.sync.onStatusChange((newStatus: SyncStatus) => {
      setStatus(newStatus);
    });

    window.electronAPI.sync.getStatus().then(setStatus);

    return unsubscribe;
  }, []);

  const triggerSync = async (): Promise<boolean> => {
    if (!window.electronAPI) return false;
    setStatus(prev => ({ ...prev, isSyncing: true }));
    try {
      await window.electronAPI.sync.triggerSync();
      return true;
    } finally {
      setStatus(prev => ({ ...prev, isSyncing: false }));
    }
  };

  const updateStatus = (partial: Partial<SyncStatus>) =>
    setStatus(prev => ({ ...prev, ...partial }));

  return (
    <SyncContext.Provider value={{ status, triggerSync, setStatus: updateStatus }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncStatusProvider');
  }
  return context;
}