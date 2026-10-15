import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Domain } from '@/hooks/useApi';
import {
  CHART_COLORS,
  domainStatusBreakdown,
  domainTypeBreakdown,
  expiringWithin,
  formatCurrency,
  rangeSpanDays,
  registrarBreakdown,
  tldBreakdown,
  type DateRange,
} from '@/lib/analytics';
import { AXIS_COLOR, ChartFrame, GRID_COLOR, Panel, tooltipProps } from './shared';

const statusVariant = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return 'success' as const;
    case 'EXPIRING':
      return 'warning' as const;
    case 'EXPIRED':
    case 'ERROR':
    case 'CRITICAL':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
};

export function DomainsTab({ domains, range }: { domains: Domain[]; range: DateRange }) {
  const spanDays = rangeSpanDays(range);
  const expiring = expiringWithin(domains, spanDays);
  const registrars = registrarBreakdown(domains);
  const tlds = tldBreakdown(domains);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="By Registrar" description="Domains per registrar">
        {registrars.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No data</div>
        ) : (
          <ChartFrame>
            <BarChart data={registrars} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={96} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipProps} />
              <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[0, 6, 6, 0]} name="Domains" />
            </BarChart>
          </ChartFrame>
        )}
      </Panel>

      <Panel title="By TLD" description="Top-level domain distribution">
        {tlds.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No data</div>
        ) : (
          <ChartFrame>
            <BarChart data={tlds} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={96} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipProps} />
              <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[0, 6, 6, 0]} name="Domains" />
            </BarChart>
          </ChartFrame>
        )}
      </Panel>

      <Panel title="By Type" description="Managed vs monitored">
        <ChartFrame height={240}>
          <PieChart>
            <Pie data={domainTypeBreakdown(domains)} dataKey="value" nameKey="name" outerRadius={90} stroke="none">
              {domainTypeBreakdown(domains).map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip {...tooltipProps} />
          </PieChart>
        </ChartFrame>
      </Panel>

      <Panel title="By Status" description="Operational status mix">
        <ChartFrame height={240}>
          <PieChart>
            <Pie data={domainStatusBreakdown(domains)} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2} stroke="none">
              {domainStatusBreakdown(domains).map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip {...tooltipProps} />
          </PieChart>
        </ChartFrame>
      </Panel>

      <Panel title={`Renewal Window (${spanDays}d)`} description={`${expiring.length} domain(s) due`} className="lg:col-span-2">
        <ScrollArea className="h-[280px]">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="pb-3 font-medium">Domain</th>
                <th className="pb-3 font-medium">Registrar</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 text-right font-medium">Days Left</th>
                <th className="pb-3 text-right font-medium">Renewal</th>
              </tr>
            </thead>
            <tbody>
              {expiring.map((d) => (
                <tr key={d.id} className="border-b">
                  <td className="py-3 font-mono text-sm">{d.name}</td>
                  <td className="py-3 text-sm text-muted-foreground">{d.registrar || '—'}</td>
                  <td className="py-3">
                    <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
                  </td>
                  <td className="py-3 text-right text-sm">{Math.ceil(((d.expiryDate || 0) * 1000 - Date.now()) / 86400000)}d</td>
                  <td className="py-3 text-right text-sm text-muted-foreground">{formatCurrency(d.pricePerYear || 0, d.currency)}</td>
                </tr>
              ))}
              {expiring.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    Nothing renewing in this window
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
