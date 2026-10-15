import type { Domain, Task } from '@/hooks/useApi';

export type RangePreset = '7d' | '30d' | '90d' | 'custom';

export interface DateRange {
  preset: RangePreset;
  from: number;
  to: number;
}

const DAY = 24 * 60 * 60 * 1000;

export const RANGE_DAYS: Record<Exclude<RangePreset, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export function presetRange(preset: Exclude<RangePreset, 'custom'>, now = Date.now()): DateRange {
  return { preset, from: now - RANGE_DAYS[preset] * DAY, to: now };
}

export function customRange(from: number, to: number): DateRange {
  return { preset: 'custom', from, to };
}

export function rangeSpanDays(range: DateRange): number {
  return Math.max(1, Math.round((range.to - range.from) / DAY));
}

export function forwardRange(range: DateRange, now = Date.now()): DateRange {
  return { preset: range.preset, from: now, to: now + rangeSpanDays(range) * DAY };
}

export function inRange(value: number | undefined | null, range: DateRange): boolean {
  if (value == null) return false;
  return value >= range.from && value <= range.to;
}

export const dayMs = DAY;

export const tldOf = (name: string): string => {
  const parts = name.split('.');
  return parts.length > 1 ? parts.slice(-2).join('.') : name;
};

export const daysUntil = (unixSeconds?: number | null): number | null =>
  unixSeconds ? Math.ceil((unixSeconds * 1000 - Date.now()) / DAY) : null;

export function formatCurrency(value: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    }).format(value || 0);
  } catch {
    return `$${(value || 0).toFixed(2)}`;
  }
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

export const CHART_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#a78bfa',
  '#60a5fa',
];

// ---- Domain aggregations -------------------------------------------------

export interface Slice {
  name: string;
  value: number;
  color: string;
}

export function domainStatusBreakdown(domains: Domain[]): Slice[] {
  const counts = new Map<string, number>();
  for (const d of domains) counts.set(d.status, (counts.get(d.status) || 0) + 1);
  return [...counts.entries()].map(([name, value], i) => ({
    name,
    value,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

export function domainTypeBreakdown(domains: Domain[]): Slice[] {
  const counts = new Map<string, number>();
  for (const d of domains) counts.set(d.type, (counts.get(d.type) || 0) + 1);
  return [...counts.entries()].map(([name, value], i) => ({
    name,
    value,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

export function registrarBreakdown(domains: Domain[], limit = 8): { name: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const d of domains) {
    const key = d.registrar?.trim() || 'Unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function tldBreakdown(domains: Domain[], limit = 8): { name: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const d of domains) {
    const tld = tldOf(d.name);
    counts.set(tld, (counts.get(tld) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name: `.${name.split('.').pop()}`, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function domainsExpiringTimeline(
  domains: Domain[],
  range: DateRange
): { label: string; count: number }[] {
  const buckets: { label: string; start: number; end: number }[] = [];
  const cursor = new Date(range.from);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= range.to) {
    const start = Math.max(cursor.getTime(), range.from);
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const end = Math.min(next.getTime(), range.to);
    if (end > start) {
      buckets.push({ label: cursor.toLocaleString('en-US', { month: 'short' }), start, end });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return buckets.map((b) => ({
    label: b.label,
    count: domains.filter((d) => {
      const exp = d.expiryDate ? d.expiryDate * 1000 : null;
      return exp != null && exp >= b.start && exp < b.end;
    }).length,
  }));
}

export function expiringWithin(domains: Domain[], days: number): Domain[] {
  const now = Date.now();
  return domains
    .filter((d) => d.expiryDate && d.expiryDate * 1000 > now && d.expiryDate * 1000 - now <= days * DAY)
    .sort((a, b) => (a.expiryDate || 0) - (b.expiryDate || 0));
}

export function annualSpend(domains: Domain[]): number {
  return domains.reduce((sum, d) => sum + (d.pricePerYear || 0), 0);
}

export interface CurrencyTotal {
  currency: string;
  yearly: number;
  monthly: number;
  count: number;
}

export function spendByCurrency(domains: Domain[]): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const d of domains) {
    const currency = d.currency || 'USD';
    const entry = map.get(currency) || { currency, yearly: 0, monthly: 0, count: 0 };
    entry.yearly += d.pricePerYear || 0;
    entry.monthly = entry.yearly / 12;
    entry.count += 1;
    map.set(currency, entry);
  }
  return [...map.values()].sort((a, b) => b.yearly - a.yearly);
}

export function spendByRegistrar(domains: Domain[], limit = 8) {
  const map = new Map<string, number>();
  for (const d of domains) {
    const key = d.registrar || 'Unknown';
    map.set(key, (map.get(key) || 0) + (d.pricePerYear || 0));
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function renewalCost(domains: Domain[], days: number): number {
  return expiringWithin(domains, days).reduce((sum, d) => sum + (d.pricePerYear || 0), 0);
}

// ---- Tasks aggregations --------------------------------------------------

export function taskStatusBreakdown(tasks: Task[]): Slice[] {
  const counts = new Map<string, number>();
  for (const t of tasks) counts.set(t.status, (counts.get(t.status) || 0) + 1);
  return [...counts.entries()].map(([name, value], i) => ({
    name,
    value,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

export function taskPriorityBreakdown(tasks: Task[]): { name: string; value: number }[] {
  const order = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
  const counts = new Map<string, number>();
  for (const t of tasks) counts.set(t.priority, (counts.get(t.priority) || 0) + 1);
  return order.filter((p) => counts.has(p)).map((name) => ({ name, value: counts.get(name) || 0 }));
}

export function tasksByAssignee(tasks: Task[], limit = 8): { name: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    const key = t.assigneeName || 'Unassigned';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'DONE') return false;
  return task.dueDate * 1000 < Date.now();
}

// ---- Monitoring aggregations --------------------------------------------

export interface MonitoringStats {
  total: number;
  monitored: number;
  coverage: number;
  healthy: number;
  expiringSoon: number;
  expired: number;
  error: number;
  sslAtRisk: number;
}

export function monitoringStats(domains: Domain[], sslWindowDays = 30): MonitoringStats {
  const now = Date.now();
  const total = domains.length;
  const monitored = domains.filter((d) => d.monitoringEnabled).length;
  const healthy = domains.filter((d) => d.status === 'ACTIVE').length;
  const expired = domains.filter((d) => d.status === 'EXPIRED').length;
  const error = domains.filter((d) => d.status === 'ERROR').length;
  const expiringSoon = domains.filter(
    (d) => d.expiryDate && d.expiryDate * 1000 > now && d.expiryDate * 1000 - now <= sslWindowDays * DAY
  ).length;
  const sslAtRisk = domains.filter((d) => d.status === 'EXPIRING' || d.status === 'CRITICAL').length;
  return {
    total,
    monitored,
    coverage: total > 0 ? monitored / total : 0,
    healthy,
    expiringSoon,
    expired,
    error,
    sslAtRisk,
  };
}
