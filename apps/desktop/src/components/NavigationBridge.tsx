import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Listens for navigation requests coming from the Electron main process
 * (tray menu, native notifications, etc.) and routes the renderer there.
 */
export function NavigationBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = window.electronAPI?.app?.onNavigate?.((route) => {
      if (typeof route === 'string' && route.length > 0) {
        navigate(route);
      }
    });
    return () => unsubscribe?.();
  }, [navigate]);

  return null;
}
