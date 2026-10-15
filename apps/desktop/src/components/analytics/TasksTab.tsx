import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from 'recharts';
import { ListChecks, AlertOctagon, CheckCircle2, Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Task } from '@/hooks/useApi';
import { isOverdue, taskPriorityBreakdown, taskStatusBreakdown, tasksByAssignee } from '@/lib/analytics';
import { AXIS_COLOR, ChartFrame, GRID_COLOR, Panel, StatCard, tooltipProps } from './shared';

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: '#f43f5e',
  HIGH: '#fb7185',
  MEDIUM: '#fbbf24',
  LOW: '#34d399',
};

export function TasksTab({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter((t) => t.status !== 'DONE').length;
  const done = tasks.length - open;
  const overdue = tasks.filter(isOverdue);
  const statusData = taskStatusBreakdown(tasks);
  const priorityData = taskPriorityBreakdown(tasks).map((p) => ({
    ...p,
    color: PRIORITY_COLORS[p.name] || '#6366f1',
  }));
  const assigneeData = tasksByAssignee(tasks);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Tasks" value={tasks.length} icon={ListChecks} tone="primary" />
        <StatCard label="Open" value={open} icon={Clock3} tone="warning" />
        <StatCard label="Overdue" value={overdue.length} icon={AlertOctagon} tone="destructive" />
        <StatCard
          label="Completion"
          value={`${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%`}
          icon={CheckCircle2}
          tone="success"
          hint={`${done} done`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tasks by Status" description="Pipeline distribution">
          {statusData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No tasks</div>
          ) : (
            <ChartFrame>
              <BarChart data={statusData}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {statusData.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
          )}
        </Panel>

        <Panel title="Tasks by Priority" description="Urgency mix">
          {priorityData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No tasks</div>
          ) : (
            <ChartFrame>
              <BarChart data={priorityData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {priorityData.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Workload by Assignee" description="Tasks per team member">
          {assigneeData.length === 0 ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ChartFrame height={240}>
              <BarChart data={assigneeData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} name="Tasks" />
              </BarChart>
            </ChartFrame>
          )}
        </Panel>

        <Panel title="Overdue Tasks" description={`${overdue.length} past due`}>
          <ScrollArea className="h-[240px]">
            <div className="space-y-2">
              {overdue.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border bg-accent/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.assigneeName || 'Unassigned'}</p>
                  </div>
                  <Badge variant="destructive">{t.priority}</Badge>
                </div>
              ))}
              {overdue.length === 0 && (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                  No overdue tasks
                </div>
              )}
            </div>
          </ScrollArea>
        </Panel>
      </div>
    </div>
  );
}
