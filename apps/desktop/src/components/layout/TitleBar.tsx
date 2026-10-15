import { useEffect, useState, type CSSProperties } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { logoUrl } from '@/lib/assets';
import { isElectron } from '@/lib/platform';

const dragRegion: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDragRegion: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

const controlClass =
  'flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none';

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI.window.isMaximized().then(setMaximized).catch(() => {});
    return window.electronAPI.window.onMaximizedChange(setMaximized);
  }, []);

  if (!isElectron) return null;

  const { minimize, maximize, close } = window.electronAPI.window;

  return (
    <div
      className="relative z-50 flex h-9 shrink-0 select-none items-center justify-between border-b border-border bg-card/80 backdrop-blur"
      style={dragRegion}
    >
      <div className="pointer-events-none flex items-center gap-2 pl-3">
        <img src={logoUrl} alt="Synchro-D" className="h-4 w-auto object-contain" />
        <span className="text-xs font-semibold tracking-tight text-foreground">
          Synchro<span className="text-primary">-D</span>
        </span>
      </div>

      <div className="flex h-full items-stretch" style={noDragRegion}>
        <button onClick={() => minimize()} aria-label="Minimize" className={controlClass}>
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={() => maximize()}
          aria-label={maximized ? 'Restore' : 'Maximize'}
          className={controlClass}
        >
          {maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => close()}
          aria-label="Close"
          className={`${controlClass} hover:bg-destructive hover:text-white`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
