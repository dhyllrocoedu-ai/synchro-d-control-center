import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, Globe, User, Calendar, Kanban, MoreHorizontal } from 'lucide-react';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask, useMoveTask } from '@/hooks/useApi';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

const columns = [
  { id: 'TODO', label: 'To Do', icon: Kanban },
  { id: 'IN_PROGRESS', label: 'In Progress', icon: Kanban },
  { id: 'REVIEW', label: 'Review', icon: Kanban },
  { id: 'DONE', label: 'Done', icon: Kanban },
  { id: 'BLOCKED', label: 'Blocked', icon: Kanban },
];

const priorityColors = {
  LOW: 'default',
  MEDIUM: 'warning',
  HIGH: 'destructive',
  URGENT: 'destructive',
} as const;

function formatDate(ts?: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type Task = {
  id: string;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  domainId?: string;
  assigneeId?: string;
  creatorId: string;
  dueDate?: number;
  domainName?: string;
  assigneeName?: string;
};

export function Tasks() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
    domainId: '',
    assigneeId: '',
    dueDate: '',
  });
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const { data: tasks = [], isLoading, refetch } = useTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const moveTask = useMoveTask();

  const tasksByStatus = columns.reduce((acc, col) => {
    acc[col.id] = tasks.filter(t => t.status === col.id);
    return acc;
  }, {} as Record<string, Task[]>);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTask.mutateAsync({
        ...newTask,
        dueDate: newTask.dueDate ? new Date(newTask.dueDate).getTime() / 1000 : undefined,
      });
      toast.success('Task created');
      setShowAddDialog(false);
      setNewTask({ title: '', description: '', priority: 'MEDIUM', domainId: '', assigneeId: '', dueDate: '' });
      refetch();
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    try {
      await updateTask.mutateAsync({
        id: editingTask.id,
        data: {
          ...editingTask,
          ...newTask,
          dueDate: newTask.dueDate ? new Date(newTask.dueDate).getTime() / 1000 : undefined,
        },
      });
      toast.success('Task updated');
      setEditingTask(null);
      setShowAddDialog(false);
      refetch();
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleMove = async (taskId: string, newStatus: string) => {
    try {
      await moveTask.mutateAsync({ id: taskId, columnId: newStatus });
    } catch {
      toast.error('Failed to move task');
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setNewTask({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      domainId: task.domainId || '',
      assigneeId: task.assigneeId || '',
      dueDate: task.dueDate ? new Date(task.dueDate * 1000).toISOString().split('T')[0] : '',
    });
    setShowAddDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await deleteTask.mutateAsync(id);
      toast.success('Task deleted');
      refetch();
    } catch {
      toast.error('Failed to delete task');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">Manage and track your team's work</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New Task</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTask ? 'Edit Task' : 'Create New Task'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={editingTask ? handleUpdateTask : handleAddTask}>
              <div className="grid gap-4 py-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="Enter task title"
                    value={newTask.title}
                    onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                    placeholder="Describe the task..."
                    value={newTask.description}
                    onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={newTask.priority} onValueChange={v => setNewTask({ ...newTask, priority: v as any })} required>
                      <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="URGENT">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="dueDate">Due Date</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={newTask.dueDate}
                      onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="domainId">Domain (optional)</Label>
                    <Input
                      id="domainId"
                      placeholder="Domain ID or name"
                      value={newTask.domainId}
                      onChange={e => setNewTask({ ...newTask, domainId: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="assigneeId">Assignee (optional)</Label>
                    <Input
                      id="assigneeId"
                      placeholder="User ID"
                      value={newTask.assigneeId}
                      onChange={e => setNewTask({ ...newTask, assigneeId: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowAddDialog(false); setEditingTask(null); }}>Cancel</Button>
                <Button type="submit" disabled={createTask.isPending || updateTask.isPending}>
                  {(createTask.isPending || updateTask.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {editingTask ? 'Save Changes' : 'Create Task'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(280px, 1fr))` }}>
        {columns.map((column) => (
          <Card key={column.id} className="flex flex-col h-[calc(100vh-300px)]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{column.label}</CardTitle>
                <Badge variant="outline" className="text-xs">{tasksByStatus[column.id]?.length || 0}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-3 min-h-[200px]" 
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const taskId = e.dataTransfer.getData('taskId');
                    if (taskId) handleMove(taskId, column.id);
                  }}>
                  {tasksByStatus[column.id]?.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={e => e.dataTransfer.setData('taskId', task.id)}
                      className="p-4 border rounded-lg bg-card hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => handleEdit(task)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-medium text-sm">{task.title}</h4>
                        <Badge variant={priorityColors[task.priority]}>{task.priority}</Badge>
                      </div>
                      {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        {task.domainName && <span className="inline-flex items-center gap-1"><Globe className="w-3 h-3" /> {task.domainName}</span>}
                        {task.assigneeName && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {task.assigneeName}</span>}
                        {task.dueDate && <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(task.dueDate)}</span>}
                      </div>
                    </div>
                  ))}
                  {(!tasksByStatus[column.id] || tasksByStatus[column.id].length === 0) && (
                    <div className="text-center text-muted-foreground py-8 text-sm">
                      Drop tasks here
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}