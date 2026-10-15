'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface Line {
  from: number;
  to: number;
  progress: number;
  speed: number;
  active: boolean;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const COLORS = {
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  accent: '#06b6d4',
};

// Cap the device pixel ratio so software/JIT rendering stays cheap on hi-dpi
// displays, and throttle to ~30fps to keep the main thread responsive.
const DPR_CAP = 1.5;
const FRAME_MS = 1000 / 30;
const dprNow = () => Math.min(window.devicePixelRatio || 1, DPR_CAP);

export function NetworkBackground({
  className = '',
  nodeCount = 40,
  lineCount = 60,
  particleCount = 30,
  respectReducedMotion = true,
  blur = 0,
}: {
  className?: string;
  nodeCount?: number;
  lineCount?: number;
  particleCount?: number;
  respectReducedMotion?: boolean;
  blur?: number;
} = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const nodesRef = useRef<{ x: number; y: number; vx: number; vy: number; radius: number }[]>([]);
  const linesRef = useRef<{ from: number; to: number; progress: number; speed: number; active: boolean; color: string }[]>([]);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const lastTimeRef = useRef<number>(0);
  const lastDrawRef = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(true);

  const initializeNodes = useCallback((width: number, height: number) => {
    const nodes: { x: number; y: number; vx: number; vy: number; radius: number }[] = [];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 2 + 1.5,
      });
    }
    nodesRef.current = nodes;
  }, [nodeCount]);

  const initializeLines = useCallback(() => {
    const nodes = nodesRef.current;
    const lines: { from: number; to: number; progress: number; speed: number; active: boolean; color: string }[] = [];
    
    for (let i = 0; i < lineCount; i++) {
      const from = Math.floor(Math.random() * nodes.length);
      let to = Math.floor(Math.random() * nodes.length);
      while (to === from && nodes.length > 1) {
        to = Math.floor(Math.random() * nodes.length);
      }
      
      lines.push({
        from,
        to,
        progress: Math.random(),
        speed: 0.002 + Math.random() * 0.003,
        active: true,
        color: Math.random() > 0.5 ? COLORS.primary : COLORS.secondary,
      });
    }
    linesRef.current = lines;
  }, [lineCount]);

  const initializeParticles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width / dprNow();
    const height = canvas.height / dprNow();
    
    const particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: Math.random() * 100,
        maxLife: 100 + Math.random() * 200,
        color: ['rgba(59, 130, 246, 0.6)', 'rgba(139, 92, 246, 0.6)', 'rgba(6, 182, 212, 0.6)'][Math.floor(Math.random() * 3)],
        size: Math.random() * 2 + 1,
      });
    }
    particlesRef.current = particles;
  }, [particleCount]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      const dpr = dprNow();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    }
  }, []);

  useEffect(() => {
    if (respectReducedMotion) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [respectReducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      resizeCanvas();
      initializeNodes(canvas.width / dprNow(), canvas.height / dprNow());
      initializeLines();
      initializeParticles();
      if (prefersReducedMotion) animate(performance.now());
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    function animate(timestamp: number) {
      if (!isVisibleRef.current) {
        if (!prefersReducedMotion) animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const dt = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      const dtSec = Math.min(dt / 1000, 0.1);

      // Throttle rendering to ~30fps.
      if (!prefersReducedMotion && timestamp - lastDrawRef.current < FRAME_MS) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      lastDrawRef.current = timestamp;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = dprNow();
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const nodes = nodesRef.current;
      const lines = linesRef.current;
      const particles = particlesRef.current;

      // Update and draw nodes (cheap: two solid arcs, no per-node gradients)
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;

        // Bounce off edges
        if (node.x <= node.radius || node.x >= width - node.radius) {
          node.vx *= -1;
          node.x = Math.max(node.radius, Math.min(width - node.radius, node.x));
        }
        if (node.y <= node.radius || node.y >= height - node.radius) {
          node.vy *= -1;
          node.y = Math.max(node.radius, Math.min(height - node.radius, node.y));
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 2.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.16)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
      }

      // Update and draw lines (routing paths) with a travelling packet
      ctx.lineWidth = 1.5;
      for (const line of lines) {
        if (!line.active) continue;

        const fromNode = nodes[line.from];
        const toNode = nodes[line.to];
        if (!fromNode || !toNode) continue;

        line.progress += line.speed * dtSec * 30;
        if (line.progress > 1) line.progress = 0;

        const isPrimary = line.color === COLORS.primary;

        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.strokeStyle = isPrimary ? 'rgba(59, 130, 246, 0.16)' : 'rgba(139, 92, 246, 0.16)';
        ctx.stroke();

        const x = fromNode.x + (toNode.x - fromNode.x) * line.progress;
        const y = fromNode.y + (toNode.y - fromNode.y) * line.progress;

        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = line.color;
        ctx.fill();
      }

      // Draw drifting particles (solid dots with alpha, no gradients)
      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 0.4;

        if (
          particle.life <= 0 ||
          particle.x < 0 || particle.x > width ||
          particle.y < 0 || particle.y > height
        ) {
          particle.x = Math.random() * width;
          particle.y = Math.random() * height;
          particle.life = particle.maxLife;
        }

        const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
        ctx.globalAlpha = alpha * 0.55;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!prefersReducedMotion) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    if (prefersReducedMotion) {
      animate(0);
    } else {
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [prefersReducedMotion, resizeCanvas, initializeNodes, initializeLines, initializeParticles]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      setIsVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  if (!isVisible || prefersReducedMotion) {
    return (
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{
          filter: blur > 0 ? `blur(${blur}px)` : undefined,
          opacity: prefersReducedMotion ? 0.6 : 1,
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={blur > 0 ? { filter: `blur(${blur}px)` } : undefined}
      aria-hidden="true"
    />
  );
}