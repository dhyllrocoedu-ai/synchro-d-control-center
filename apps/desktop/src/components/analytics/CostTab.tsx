import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from 'recharts';
import { Wallet, CalendarClock, Coins, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Domain } from '@/hooks/useApi';
import {
  CHART_COLORS,
  annualSpend,
  formatCurrency,
  renewalCost,
  spendByCurrency,
  spendByRegistrar,
} from '@/lib/analytics';
import { AXIS_COLOR, ChartFrame, GRID_COLOR, Panel, StatCard, tooltipProps } from './shared';

export function CostTab({ domains, subscriptions }: { domains: Domain[]; subscriptions: any[] }) {
  const yearly = annualSpend(domains);
  const monthly = yearly / 12;
  const byCurrency = spendByCurrency(domains);
  const byRegistrar = spendByRegistrar(domains);
  const primaryCurrency = byCurrency[0]?.currency || 'USD';
  const avg = domains.length ? yearly / domains.length : 0;

  const renewalBuckets = [
    { label: '30d', value: renewalCost(domains, 30) },
    { label: '60d', value: renewalCost(domains, 60) },
    { label: '90d', value: renewalCost(domains, 90) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Annual Spend" value={formatCurrency(yearly, primaryCurrency)} icon={Wallet} tone="primary" hint={`${domains.length} domains`} />
        <StatCard label="Monthly Spend" value={formatCurrency(monthly, primaryCurrency)} icon={TrendingUp} hint="normalized / month" />
        <StatCard label="Avg / Domain" value={formatCurrency(avg, primaryCurrency)} icon={Coins} hint="per year" />
        <StatCard label="Renewals (90d)" value={formatCurrency(renewalCost(domains, 90), primaryCurrency)} icon={CalendarClock} tone="warning" hint={`${renewalCost(domains, 30)} in 30d`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Spend by Currency" description="Annualized totals">
          <ChartFrame height={240}>
            <BarChart data={byCurrency.map((c, i) => ({ ...c, color: CHART_COLORS[i % CHART_COLORS.length] }))}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="currency" tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip {...tooltipProps} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="yearly" radius={[6, 6, 0, 0]} name="Yearly">
                {byCurrency.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartFrame>
          <div className="mt-4 space-y-2">
            {byCurrency.map((c) => (
              <div key={c.currency} className="flex items-center justify-between rounded-lg border bg-card/60 px-3 py-2 text-sm">
                <span className="font-medium">{c.currency}</span>
                <span className="text-muted-foreground">{c.count} domains</span>
                <span className="font-mono">{formatCurrency(c.yearly, c.currency)}/yr</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Spend by Registrar" description="Where the budget goes">
          {byRegistrar.length === 0 ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ChartFrame height={320}>
              <BarChart data={byRegistrar} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} name="Yearly" />
              </BarChart>
            </ChartFrame>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Renewal Forecast" description="Cost due in upcoming windows">
          <div className="grid grid-cols-3 gap-3">
            {renewalBuckets.map((b) => (
              <div key={b.label} className="rounded-lg border bg-card/60 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{b.label}</p>
                <p className="mt-2 text-lg font-bold font-mono">{formatCurrency(b.value)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Subscription Status" description="Active billing plans">
          {subscriptions.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No billing subscriptions available. Renewal signals are derived from domain records.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-card/60 p-3 text-center">
                  <p className="text-lg font-semibold font-mono">{domains.filter((d) => d.autoRenew).length}</p>
                  <p className="text-xs text-muted-foreground">Auto-renew on</p>
                </div>
                <div className="rounded-lg border bg-card/60 p-3 text-center">
                  <p className="text-lg font-semibold font-mono">{domains.filter((d) => !d.autoRenew).length}</p>
                  <p className="text-xs text-muted-foreground">Manual renewal</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(
                subscriptions.reduce<Record<string, number>>((acc, s) => {
                  acc[s.status || 'ACTIVE'] = (acc[s.status || 'ACTIVE'] || 0) + 1;
                  return acc;
                }, {})
              ).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between rounded-lg border bg-card/60 px-3 py-2">
                  <Badge variant={status === 'ACTIVE' ? 'success' : status === 'PAST_DUE' ? 'destructive' : 'secondary'}>{status}</Badge>
                  <span className="font-mono text-sm">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {yearly === 0 && (
        <div className="rounded-lg border bg-card/60 p-4 text-center text-sm text-muted-foreground">
          <TrendingUp className="mx-auto mb-2 h-5 w-5 opacity-60" />
          No pricing data yet — add price-per-year to domains to populate cost analytics.
        </div>
      )}
    </div>
  );
}
