import { useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useApprovals, useDomains, useSubscriptions, useTasks } from '@/hooks/useApi';
import { presetRange, type DateRange } from '@/lib/analytics';
import { DateRangePicker } from './DateRangePicker';
import { OverviewTab } from './OverviewTab';
import { DomainsTab } from './DomainsTab';
import { MonitoringTab } from './MonitoringTab';
import { TasksTab } from './TasksTab';
import { CostTab } from './CostTab';

export function Analytics() {
  const [range, setRange] = useState<DateRange>(() => presetRange('30d'));
  const { data: domains = [], isFetching, refetch } = useDomains();
  const { data: tasks = [] } = useTasks();
  const { data: approvals = [] } = useApprovals();
  const { data: subscriptions = [] } = useSubscriptions();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <BarChart3 className="h-7 w-7 text-primary" />
            Analytics
          </h1>
          <p className="text-muted-foreground">Insights across domains, tasks, monitoring, and spend</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="cost">Cost &amp; Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab domains={domains} tasks={tasks} approvals={approvals} range={range} />
        </TabsContent>
        <TabsContent value="domains" className="mt-6">
          <DomainsTab domains={domains} range={range} />
        </TabsContent>
        <TabsContent value="monitoring" className="mt-6">
          <MonitoringTab domains={domains} />
        </TabsContent>
        <TabsContent value="tasks" className="mt-6">
          <TasksTab tasks={tasks} />
        </TabsContent>
        <TabsContent value="cost" className="mt-6">
          <CostTab domains={domains} subscriptions={subscriptions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
