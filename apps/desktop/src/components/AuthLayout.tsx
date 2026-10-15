'use client';

import { NetworkBackground } from './NetworkBackground';
import { AuroraBackground } from './AuroraBackground';
import { cn } from '@/lib/utils';

interface AuthLayoutProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Persistent animated backdrop for the public/auth routes. Rendered OUTSIDE
 * the route transition boundary so it stays mounted (and never re-animates or
 * re-initialises its canvas) while navigating between auth pages.
 */
export function AuthBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 [background:radial-gradient(ellipse_at_center,hsl(var(--primary)/0.10),transparent_55%)]" />
      <AuroraBackground />
      <NetworkBackground
        nodeCount={26}
        lineCount={26}
        particleCount={12}
        respectReducedMotion={true}
        blur={1.5}
      />
    </div>
  );
}

export function AuthLayout({ children, className }: AuthLayoutProps) {
  return (
    <div className={cn('relative h-full w-full flex items-center justify-center overflow-hidden', className)}>
      <div className="relative z-10 w-full h-full flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
