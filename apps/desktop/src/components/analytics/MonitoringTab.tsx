import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { Activity, ShieldCheck, ShieldAlert, Gauge, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Domain } from '@/hooks/useApi';
import { CHART_COLORS, daysUntil, monitoringStats } from '@/lib/analytics';
import { ChartFrame, Panel, StatCard, tooltipProps } from './shared';

export function MonitoringTab({ domains }: { domains: Domain[] }) {
  const stats = monitoringStats(domains);
  const coveragePct = Math.round(stats.coverage * 100);

  const statusData = [
    { name: 'Healthy', value: stats.healthy, color: '#34d399' },
    { name: 'Expiring', value: stats.expiringSoon, color: '#fbbf24' },
    { name: 'Expired', value: stats.expired, color: '#fb7185' },
    { name: 'Error', value: stats.error, color: '#f43f5e' },
    {
      name: 'Other',
      value: Math.max(0, stats.total - stats.healthy - stats.expiringSoon - stats.expired - stats.error),
      color: CHART_COLORS[0],
    },
  ].filter((s) => s.value > 0);

  const attention = domains
    .filter((d) => d.status === 'CRITICAL' || d.status === 'ERROR' || d.status === 'EXPIRING')
    .sort((a, b) => (a.expiryDate || 0) - (b.expiryDate || 0));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Monitored Domains" value={stats.monitored} icon={Activity} tone="primary" hint={`of ${stats.total} total`} />
        <StatCard label="Coverage" value={`${coveragePct}%`} icon={Gauge} tone={coveragePct >= 80 ? 'success' : coveragePct >= 50 ? 'warning' : 'destructive'} hint={`${stats.total - stats.monitored} unmonitored`} />
        <StatCard label="Healthy" value={stats.healthy} icon={ShieldCheck} tone="success" hint="status: active" />
        <StatCard label="At Risk" value={stats.sslAtRisk + stats.error} icon={ShieldAlert} tone="destructive" hint={`${stats.error} error · ${stats.sslAtRisk} expiring`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Monitoring Coverage" description="Share of portfolio under active checks">
          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold font-mono tabular-nums">{coveragePct}%</span>
              <span className="text-sm text-muted-foreground">
                {stats.monitored} / {stats.total} domains
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500 transition-all"
                style={{ width: `${coveragePct}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 text-center">
              <div className="rounded-lg border bg-card/60 p-3">
                <p className="text-lg font-semibold font-mono">{stats.total - stats.monitored}</p>
                <p className="text-xs text-muted-foreground">Unmonitored</p>
              </div>
              <div className="rounded-lg border bg-card/60 p-3">
                <p className="text-lg font-semibold font-mono">{stats.expiringSoon}</p>
                <p className="text-xs text-muted-foreground">Expiring 30d</p>
              </div>
              <div className="rounded-lg border bg-card/60 p-3">
                <p className="text-lg font-semibold font-mono">{stats.expired}</p>
                <p className="text-xs text-muted-foreground">Expired</p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Status Health" description="Portfolio status distribution">
          {statusData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No domains</div>
          ) : (
            <>
              <ChartFrame height={240}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="none">
                    {statusData.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipProps} />
                </PieChart>
              </ChartFrame>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                {statusData.map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.name} <span className="text-foreground">{s.value}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Needs Attention" description="Critical, error, and expiring domains">
        <ScrollArea className="h-[300px]">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="pb-3 font-medium">Domain</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Monitoring</th>
                <th className="pb-3 text-right font-medium">Days Left</th>
              </tr>
            </thead>
            <tbody>
              {attention.map((d) => {
                const days = daysUntil(d.expiryDate);
                return (
                  <tr key={d.id} className="border-b">
                    <td className="py-3 font-mono text-sm">{d.name}</td>
                    <td className="py-3">
                      <Badge variant={d.status === 'CRITICAL' || d.status === 'ERROR' ? 'destructive' : 'warning'}>{d.status}</Badge>
                    </td>
                    <td className="py-3 text-sm text-muted-foreground">
                      {d.monitoringEnabled ? (
                        <span className="text-emerald-400">Enabled</span>
                      ) : (
                        <span className="text-muted-foreground">Disabled</span>
                      )}
                    </td>
                    <td className="py-3 text-right text-sm">{days == null ? '—' : `${days}d`}</td>
                  </tr>
                );
              })}
              {attention.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    <AlertTriangle className="mx-auto mb-2 h-5 w-5 opacity-60" />
                    All monitored domains are healthy
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </Panel>
    </div>
  );
}
