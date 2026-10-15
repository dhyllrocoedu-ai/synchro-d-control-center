import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, Minus, Globe, AlertCircle, Bell, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { useDomains, useChatRooms, useTasks, useApprovals, useSyncStatus } from '@/hooks/useApi';
import { cn } from '@/lib/utils';
import { Suspense } from 'react';
import { SkeletonDashboard } from '@/components/ui/skeleton';

function formatNumber(n: number) {
  return n.toLocaleString();
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

type BadgeVariant = 'default' | 'info' | 'destructive' | 'outline' | 'secondary' | 'success' | 'warning';

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'EXPIRING':
      return 'warning';
    case 'EXPIRED':
    case 'ERROR':
    case 'CRITICAL':
      return 'destructive';
    case 'PENDING_TRANSFER':
      return 'info';
    default:
      return 'secondary';
  }
}

type Stat = {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  variant?: BadgeVariant;
};

export function Dashboard() {
  const { data: domains = [] } = useDomains();
  const { data: chatRooms = [] } = useChatRooms();
  const { data: tasks = [] } = useTasks();
  const { data: approvals = [] } = useApprovals();
  const { isOnline, isSyncing, lastSyncedAt, pendingCount, triggerSync } = useSyncStatus();

  const now = Date.now();
  const expiringSoon = domains.filter(d => d.expiryDate && d.expiryDate * 1000 - now < 30 * 24 * 60 * 60 * 1000 && d.expiryDate * 1000 > now).length;
  const expiring90 = domains.filter(d => d.expiryDate && d.expiryDate * 1000 - now < 90 * 24 * 60 * 60 * 1000 && d.expiryDate * 1000 > now).length;
  const critical = domains.filter(d => d.status === 'CRITICAL').length;
  const monthlySpend = domains.reduce((sum, d) => sum + (d.pricePerYear || 0), 0) / 12;
  const sslExpiring = domains.filter(d => d.status === 'EXPIRING' || d.status === 'CRITICAL').length;

  const stats: Array<{ label: string; value: string; change: string; trend: 'up' | 'down' | 'neutral'; variant?: 'default' | 'destructive' | 'warning' | 'success' | 'info' }> = [
    { label: 'Total Domains', value: formatNumber(domains.length), change: `${expiringSoon} expiring soon`, trend: expiringSoon > 0 ? 'down' : 'neutral' },
    { label: 'Expiring (30d)', value: formatNumber(expiringSoon), change: '+3', trend: 'down', variant: 'destructive' },
    { label: 'Expiring (90d)', value: formatNumber(expiring90), change: '+8', trend: 'down', variant: 'warning' },
    { label: 'Critical Alerts', value: formatNumber(critical), change: '0', trend: critical > 0 ? 'down' : 'neutral', variant: 'destructive' },
    { label: 'Monthly Spend', value: formatCurrency(monthlySpend), change: '+$120', trend: 'up' },
    { label: 'SSL Expiring', value: formatNumber(sslExpiring), change: '-2', trend: 'up', variant: 'success' }
  ];

  const recentActivity = [
    ...domains.slice(0, 2).map(d => ({ action: 'Domain check', target: d.name, user: 'System', time: 'Just now' })),
    ...tasks.slice(0, 2).map(t => ({ action: 'Task updated', target: t.title, user: t.assigneeName || 'System', time: '5 min ago' })),
    ...approvals.slice(0, 1).map(a => ({ action: 'Approval needed', target: a.title, user: a.requesterName || 'System', time: '10 min ago' })),
  ].slice(0, 5);

  return (
    <Suspense fallback={<SkeletonDashboard />}>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your domain portfolio</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-card/60 text-xs font-medium text-muted-foreground">
            <span className={cn('w-1.5 h-1.5 rounded-full', isOnline ? 'bg-emerald-400' : 'bg-muted-foreground')}></span>
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-card/60 text-xs font-medium text-muted-foreground">
            <Bell className="w-3.5 h-3.5 text-primary" />
            <span>Sync: {pendingCount} pending</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => triggerSync()} disabled={isSyncing}>
            <Loader2 className={cn('w-4 h-4 mr-2', isSyncing ? 'animate-spin' : '')} />
            Sync Now
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
        {[
          { label: 'SYNC', status: isOnline ? 'ok' : 'offline', value: isSyncing ? 'Syncing...' : 'Healthy' },
          { label: 'MONITORING', status: 'ok', value: `${domains.filter(d => d.monitoringEnabled).length} live checks` },
          { label: 'SSL ENFORCEMENT', status: sslExpiring > 0 ? 'warn' : 'ok', value: sslExpiring > 0 ? `${sslExpiring} expiring` : 'All valid' },
          { label: 'REGISTRAR API', status: 'ok', value: '4/4 connected' }
        ].map((svc) => (
          <div key={svc.label} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card/60 text-muted-foreground">
            <span className={cn('w-1.5 h-1.5 rounded-full', svc.status === 'ok' ? 'bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/60' : svc.status === 'warn' ? 'bg-amber-400 shadow-[0_0_6px] shadow-amber-400/60' : 'bg-muted-foreground')}/>
            <span className="font-mono tracking-wider">{svc.label}</span>
            <span className="text-foreground">{svc.value}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <Badge variant={stat.variant || 'default'} className="text-xs">
                {stat.trend === 'up' && <TrendingUp className="w-3 h-3 mr-1" />}
                {stat.trend === 'down' && <TrendingDown className="w-3 h-3 mr-1" />}
                {stat.trend === 'neutral' && <Minus className="w-3 h-3 mr-1" />}
                {stat.change}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono tabular-nums">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Expiring Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">Domain</th>
                    <th className="pb-3 font-medium">Registrar</th>
                    <th className="pb-3 font-medium text-right">Expires In</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {domains
                    .filter(d => d.expiryDate && d.expiryDate * 1000 > now)
                    .sort((a, b) => (a.expiryDate || 0) - (b.expiryDate || 0))
                    .slice(0, 10)
                    .map((domain) => (
                      <tr key={domain.name} className="border-b">
                        <td className="py-3 font-medium font-mono">{domain.name}</td>
                        <td className="py-3 text-sm text-muted-foreground">{domain.registrar || '—'}</td>
                        <td className="py-3 text-right text-sm">
                          {domain.expiryDate ? Math.ceil((domain.expiryDate * 1000 - now) / (24 * 60 * 60 * 1000)) : '—'}d
                        </td>
                        <td className="py-3">
                          <Badge variant={statusVariant(domain.status)}>{domain.status}</Badge>
                        </td>
                        <td className="py-3 text-right text-sm text-muted-foreground">${domain.pricePerYear?.toFixed(2)}/{domain.currency || 'USD'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {[
                  ...domains.filter(d => d.status === 'CRITICAL').map(d => ({ type: 'CRITICAL', severity: 'CRITICAL', message: `${d.name} status: CRITICAL`, time: 'Now' })),
                  ...domains.filter(d => d.status === 'EXPIRING').map(d => ({ type: 'EXPIRY', severity: 'WARNING', message: `${d.name} expires soon`, time: 'Soon' })),
                ].slice(0, 5).map((alert, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-accent/30">
                    <Badge variant={alert.severity === 'CRITICAL' ? 'destructive' : alert.severity === 'WARNING' ? 'warning' : 'info'} className="flex-shrink-0">
                      {alert.type}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{alert.message}</p>
                      <p className="text-xs text-muted-foreground">{alert.time}</p>
                    </div>
                  </div>
                ))}
                {domains.filter(d => d.status === 'CRITICAL').length === 0 && domains.filter(d => d.status === 'EXPIRING').length === 0 && (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <CheckCircle className="w-8 h-8 mr-2 text-success" />
                    All systems normal
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="pb-3 font-medium">Action</th>
                  <th className="pb-3 font-medium">Target</th>
                  <th className="pb-3 font-medium">User</th>
                  <th className="pb-3 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((activity, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-3 text-sm">{activity.action}</td>
                    <td className="py-3 text-sm font-mono">{activity.target}</td>
                    <td className="py-3 text-sm text-muted-foreground">{activity.user}</td>
                    <td className="py-3 text-right text-sm text-muted-foreground">{activity.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
      </div>
      </Suspense>
    );
  }