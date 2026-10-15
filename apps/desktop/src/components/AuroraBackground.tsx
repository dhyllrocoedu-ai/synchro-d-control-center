import type { CSSProperties } from 'react';

const blobs: { style: CSSProperties }[] = [
  {
    style: {
      top: '-12%',
      left: '-8%',
      width: '55vw',
      height: '55vw',
      background: 'radial-gradient(circle at center, hsl(217 91% 60% / 0.55), transparent 70%)',
      animationDelay: '0s',
      animationDuration: '30s',
    },
  },
  {
    style: {
      top: '8%',
      right: '-12%',
      width: '50vw',
      height: '50vw',
      background: 'radial-gradient(circle at center, hsl(262 83% 58% / 0.5), transparent 70%)',
      animationDelay: '-8s',
      animationDuration: '34s',
    },
  },
  {
    style: {
      bottom: '-18%',
      left: '18%',
      width: '48vw',
      height: '48vw',
      background: 'radial-gradient(circle at center, hsl(189 94% 43% / 0.45), transparent 70%)',
      animationDelay: '-14s',
      animationDuration: '38s',
    },
  },
  {
    style: {
      bottom: '-8%',
      right: '8%',
      width: '42vw',
      height: '42vw',
      background: 'radial-gradient(circle at center, hsl(262 83% 58% / 0.4), transparent 70%)',
      animationDelay: '-20s',
      animationDuration: '32s',
    },
  },
];

export function AuroraBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-25 animate-aurora-pulse motion-reduce:animate-none"
      aria-hidden="true"
    >
      {blobs.map((blob, i) => (
        <div
          key={i}
          className="absolute rounded-full blur-[64px] will-change-transform animate-aurora-drift motion-reduce:animate-none"
          style={blob.style}
        />
      ))}
    </div>
  );
}
