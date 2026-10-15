import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export const AXIS_COLOR = '#94a3b8';
export const GRID_COLOR = '#1e293b';

export const tooltipProps = {
  contentStyle: {
    background: '#0b1220',
    border: '1px solid #1e293b',
    borderRadius: 10,
    fontSize: 12,
    color: '#e2e8f0',
    boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
  },
  labelStyle: { color: '#94a3b8', marginBottom: 4 },
  itemStyle: { color: '#e2e8f0' },
  cursor: { fill: 'rgba(99,102,241,0.08)' },
};

export function ChartFrame({
  children,
  height = 280,
}: {
  children: React.ReactElement;
  height?: number;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
}) {
  const toneClass: Record<string, string> = {
    default: 'text-foreground',
    primary: 'text-primary',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    destructive: 'text-rose-400',
  };
  const iconTone: Record<string, string> = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/15 text-primary',
    success: 'bg-emerald-500/15 text-emerald-400',
    warning: 'bg-amber-500/15 text-amber-400',
    destructive: 'bg-rose-500/15 text-rose-400',
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">{label}</p>
            <p className={cn('mt-2 text-2xl font-bold font-mono tabular-nums', toneClass[tone])}>{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          {Icon && (
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', iconTone[tone])}>
              <Icon className="h-4 w-4" />
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function EmptyState({ message, icon: Icon }: { message: string; icon?: LucideIcon }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      {Icon && <Icon className="h-6 w-6 opacity-60" />}
      <span>{message}</span>
    </div>
  );
}
