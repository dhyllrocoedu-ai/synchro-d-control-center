import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { FileCheck, Clock, Check, X, Loader2 } from 'lucide-react';
import { useApprovals, useCreateApproval, useApproveApproval, useRejectApproval } from '@/hooks/useApi';
import { toast } from 'react-hot-toast';

const typeColors = {
  RENEWAL: 'default',
  TRANSFER: 'warning',
  DNS_CHANGE: 'info',
  DELETE: 'destructive',
  CUSTOM: 'secondary'
} as const;

export function Approvals() {
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newApproval, setNewApproval] = useState({
    type: 'RENEWAL' as 'RENEWAL' | 'TRANSFER' | 'DNS_CHANGE' | 'DELETE' | 'CUSTOM',
    title: '',
    description: '',
    domainId: '',
    metadata: {} as any,
  });

  const { data: approvals = [], isLoading, refetch } = useApprovals();
  const createApproval = useCreateApproval();
  const approveApproval = useApproveApproval();
  const rejectApproval = useRejectApproval();

  const handleCreateApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createApproval.mutateAsync(newApproval);
      toast.success('Approval request created');
      setShowCreateDialog(false);
      setNewApproval({ type: 'RENEWAL', title: '', description: '', domainId: '', metadata: {} });
      refetch();
    } catch {
      toast.error('Failed to create approval');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveApproval.mutateAsync({ id, comment });
      toast.success('Approved');
      setSelectedApproval(null);
      setComment('');
      refetch();
    } catch {
      toast.error('Failed to approve');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectApproval.mutateAsync({ id, comment });
      toast.success('Rejected');
      setSelectedApproval(null);
      setComment('');
      refetch();
    } catch {
      toast.error('Failed to reject');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
          <p className="text-muted-foreground">Review and approve domain actions</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button><FileCheck className="w-4 h-4 mr-2" /> Request Approval</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Approval Request</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateApproval}>
              <div className="grid gap-4 py-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="Renew example.com for 1 year"
                    value={newApproval.title}
                    onChange={e => setNewApproval({ ...newApproval, title: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="type">Type</Label>
                  <select
                    id="type"
                    value={newApproval.type}
                    onChange={e => setNewApproval({ ...newApproval, type: e.target.value as any })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  >
                    <option value="RENEWAL">Renewal</option>
                    <option value="TRANSFER">Transfer</option>
                    <option value="DNS_CHANGE">DNS Change</option>
                    <option value="DELETE">Delete</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Details about this request..."
                    value={newApproval.description}
                    onChange={e => setNewApproval({ ...newApproval, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="domainId">Domain ID</Label>
                  <Input
                    id="domainId"
                    placeholder="domain-uuid"
                    value={newApproval.domainId}
                    onChange={e => setNewApproval({ ...newApproval, domainId: e.target.value })}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={createApproval.isPending}>
                  {createApproval.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Request Approval
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-300px)]">
              <div className="space-y-3">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : approvals.filter(a => a.status === 'PENDING').length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <FileCheck className="w-12 h-12 mb-3 opacity-30" />
                    <p>No pending approvals</p>
                  </div>
                ) : (
                  approvals.filter(a => a.status === 'PENDING').map((approval) => (
                    <div
                      key={approval.id}
                      className={`p-4 border rounded-lg transition-colors cursor-pointer ${
                        selectedApproval === approval.id
                          ? 'bg-primary/5 border-primary'
                          : 'hover:bg-accent/50'
                      }`}
                      onClick={() => setSelectedApproval(approval.id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{approval.title}</h4>
                            <Badge variant={typeColors[approval.type as keyof typeof typeColors]}>
                              {approval.type}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{approval.domainId}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span>Requested by {approval.requesterId.slice(0, 8)}</span>
                            <span>•</span>
                            <span>{new Date(approval.createdAt * 1000).toLocaleDateString()}</span>
                          </div>
                          <div className="mt-2">
                            <Badge variant="warning">{approval.status}</Badge>
                          </div>
                        </div>
                      </div>
                      {selectedApproval === approval.id && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <span className="text-muted-foreground">Cost:</span>
                            <span>${approval.metadata?.cost || 'N/A'}</span>
                            <span className="text-muted-foreground">Years:</span>
                            <span>{approval.metadata?.years || 'N/A'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedApproval ? 'Approval Details' : 'Select an approval'}</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedApproval ? (
              (() => {
                const approval = approvals.find(a => a.id === selectedApproval);
                if (!approval) return <div>Not found</div>;
                return (
                  <div className="space-y-4">
                    <div>
                      <Label>Type</Label>
                      <Badge variant={typeColors[approval.type as keyof typeof typeColors]}>
                        {approval.type}
                      </Badge>
                    </div>
                    <div>
                      <Label>Domain</Label>
                      <p className="font-medium font-mono">{approval.domainId}</p>
                    </div>
                    <div>
                      <Label>Requested By</Label>
                      <p>{approval.requesterId}</p>
                    </div>
                    <div>
                      <Label>Created</Label>
                      <p>{new Date(approval.createdAt * 1000).toLocaleString()}</p>
                    </div>
                    {approval.decidedAt && (
                      <>
                        <Separator />
                        <div>
                          <Label>Decided By</Label>
                          <p>{approval.approverId || '—'}</p>
                        </div>
                        <div>
                          <Label>Decided At</Label>
                          <p>{new Date(approval.decidedAt * 1000).toLocaleString()}</p>
                        </div>
                        {approval.metadata?.rejectionReason && (
                          <div>
                            <Label>Rejection Reason</Label>
                            <p className="text-destructive">{approval.metadata.rejectionReason}</p>
                          </div>
                        )}
                      </>
                    )}
                    {approval.metadata && (
                      <>
                        <Separator />
                        <div>
                          <Label className="font-medium">Metadata</Label>
                          <pre className="text-xs text-muted-foreground bg-muted p-2 rounded">
                            {JSON.stringify(approval.metadata, null, 2)}
                          </pre>
                        </div>
                      </>
                    )}

                    {approval.status === 'PENDING' && (
                      <div className="pt-4 border-t">
                        <Label>Comment (optional)</Label>
                        <Textarea
                          value={comment}
                          onChange={e => setComment(e.target.value)}
                          placeholder="Add a comment..."
                          className="mt-1"
                          rows={3}
                        />
                        <div className="flex gap-2 mt-4">
                          <Button variant="destructive" onClick={() => handleReject(approval.id)} className="flex-1" disabled={rejectApproval.isPending}>
                            {rejectApproval.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Reject
                          </Button>
                          <Button onClick={() => handleApprove(approval.id)} className="flex-1" disabled={approveApproval.isPending}>
                            {approveApproval.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Approve
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                Click on a pending approval to review details
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}