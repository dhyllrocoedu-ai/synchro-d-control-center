import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Globe, AlertTriangle, ListChecks, Clock, Wallet, FileCheck } from 'lucide-react';
import type { Approval, Domain, Task } from '@/hooks/useApi';
import {
  CHART_COLORS,
  annualSpend,
  domainStatusBreakdown,
  domainsExpiringTimeline,
  expiringWithin,
  formatCurrency,
  forwardRange,
  isOverdue,
  rangeSpanDays,
  taskStatusBreakdown,
  type DateRange,
} from '@/lib/analytics';
import { AXIS_COLOR, ChartFrame, GRID_COLOR, Panel, StatCard, tooltipProps } from './shared';

export function OverviewTab({
  domains,
  tasks,
  approvals,
  range,
}: {
  domains: Domain[];
  tasks: Task[];
  approvals: Approval[];
  range: DateRange;
}) {
  const spanDays = rangeSpanDays(range);
  const expiring = expiringWithin(domains, spanDays);
  const openTasks = tasks.filter((t) => t.status !== 'DONE').length;
  const overdue = tasks.filter(isOverdue).length;
  const pending = approvals.filter((a) => a.status === 'PENDING').length;
  const critical = domains.filter((d) => d.status === 'ERROR' || d.status === 'CRITICAL' || d.status === 'EXPIRED').length;
  const monthly = annualSpend(domains) / 12;

  const statusData = domainStatusBreakdown(domains);
  const timeline = domainsExpiringTimeline(domains, forwardRange(range));

  const taskBuckets = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED']
    .map((name, i) => ({
      name: name.replace('_', ' '),
      value: tasks.filter((t) => t.status === name).length,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))
    .filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Domains" value={domains.length} icon={Globe} tone="primary" hint={`${domains.filter((d) => d.monitoringEnabled).length} monitored`} />
        <StatCard label={`Expiring (${spanDays}d)`} value={expiring.length} icon={Clock} tone={expiring.length ? 'warning' : 'default'} hint={formatCurrency(expiring.reduce((s, d) => s + (d.pricePerYear || 0), 0))} />
        <StatCard label="Critical / Error" value={domains.filter((d) => d.status === 'CRITICAL' || d.status === 'ERROR').length} icon={AlertTriangle} tone="destructive" hint={`${domains.filter((d) => d.status === 'EXPIRED').length} expired`} />
        <StatCard label="Open Tasks" value={openTasks} icon={ListChecks} tone="primary" hint={`${tasks.filter(isOverdue).length} overdue`} />
        <StatCard label="Pending Approval" value={approvals.filter((a) => a.status === 'PENDING').length} icon={FileCheck} tone="warning" hint={`${approvals.length} total`} />
        <StatCard label="Monthly Spend" value={formatCurrency(annualSpend(domains) / 12)} icon={Wallet} hint={`${formatCurrency(annualSpend(domains))}/yr`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Domain Status" description="Distribution across the portfolio" className="lg:col-span-1">
          {domains.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No domains</div>
          ) : (
            <ChartFrame>
              <PieChart>
                <Pie data={domainStatusBreakdown(domains)} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
                  {domainStatusBreakdown(domains).map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip {...tooltipProps} />
              </PieChart>
            </ChartFrame>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {domainStatusBreakdown(domains).map((s) => (
              <span key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name} <span className="text-foreground">{s.value}</span>
              </span>
            ))}
          </div>
        </Panel>

        <Panel title="Upcoming Expirations" description={`Renewals in the next ${spanDays} days`} className="lg:col-span-2">
          <ChartFrame>
            <AreaChart data={domainsExpiringTimeline(domains, forwardRange(range))}>
              <defs>
                <linearGradient id="expFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip {...tooltipProps} />
              <Area type="monotone" dataKey="count" stroke={CHART_COLORS[0]} strokeWidth={2} fill="url(#expFill)" name="Expiring" />
            </AreaChart>
          </ChartFrame>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Task Pipeline" description="Tasks by status">
          {tasks.length === 0 ? (
            <div className="flex h-[264px] items-center justify-center text-sm text-muted-foreground">No tasks</div>
          ) : (
            <ChartFrame height={264}>
              <BarChart data={taskStatusBreakdown(tasks)}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {taskStatusBreakdown(tasks).map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
          )}
        </Panel>

        <Panel title="Expiration Focus" description={`${expiring.length} domain(s) need attention`}>
          {expiring.length === 0 ? (
            <div className="flex h-[264px] items-center justify-center text-sm text-muted-foreground">Nothing expiring in this window</div>
          ) : (
            <ul className="max-h-[264px] space-y-2 overflow-auto pr-1">
              {expiring.slice(0, 8).map((d) => {
                const days = Math.ceil(((d.expiryDate || 0) * 1000 - Date.now()) / (24 * 60 * 60 * 1000));
                return (
                  <li key={d.id} className="flex items-center justify-between rounded-lg border bg-accent/20 px-3 py-2 text-sm">
                    <span className="font-mono">{d.name}</span>
                    <span className={days <= 14 ? 'text-rose-400' : 'text-amber-400'}>{days}d</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
