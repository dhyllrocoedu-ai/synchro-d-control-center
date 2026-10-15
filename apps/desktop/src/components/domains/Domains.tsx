import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Check, X, Circle, Plus, Search, Filter, Loader2 } from 'lucide-react';
import { useDomains, useCreateDomain, useCheckDomainNow } from '@/hooks/useApi';
import { toast } from 'react-hot-toast';
import { Suspense } from 'react';
import { SkeletonDomainList } from '@/components/ui/skeleton';

function formatDate(ts?: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusVariant(status: string) {
  return status === 'CRITICAL' ? 'destructive' : status === 'EXPIRING' ? 'warning' : status === 'EXPIRED' ? 'destructive' : 'success';
}

export function Domains() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDomain, setNewDomain] = useState({ name: '', type: 'MONITORED' as 'MANAGED' | 'MONITORED', registrar: '' });

  const { data: domains = [], isLoading, refetch } = useDomains({ search, type: filterType, status: filterStatus });
  const createDomain = useCreateDomain();
  const checkNow = useCheckDomainNow();

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createDomain.mutateAsync(newDomain);
      toast.success('Domain added');
      setShowAddDialog(false);
      setNewDomain({ name: '', type: 'MONITORED', registrar: '' });
      refetch();
    } catch (err) {
      toast.error('Failed to add domain');
    }
  };

  const handleCheckNow = async (id: string) => {
    try {
      await checkNow.mutateAsync(id);
      toast.success('Check initiated');
      refetch();
    } catch {
      toast.error('Check failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Domains</h1>
          <p className="text-muted-foreground">Manage and monitor your domain portfolio</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Domain</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Domain</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddDomain}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">Domain Name</Label>
                    <Input
                      id="name"
                      placeholder="example.com"
                      value={newDomain.name}
                      onChange={e => setNewDomain({ ...newDomain, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="type">Type</Label>
                    <select
                      id="type"
                      value={newDomain.type}
                      onChange={e => setNewDomain({ ...newDomain, type: e.target.value as 'MANAGED' | 'MONITORED' })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="MANAGED">Managed</option>
                      <option value="MONITORED">Monitored</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="registrar">Registrar</Label>
                    <Input
                      id="registrar"
                      placeholder="Namecheap, Cloudflare, etc."
                      value={newDomain.registrar}
                      onChange={e => setNewDomain({ ...newDomain, registrar: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={createDomain.isPending}>
                  {createDomain.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Add Domain
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>All Domains ({domains.length})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search domains..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm w-40"
              >
                <option value="all">All Types</option>
                <option value="MANAGED">Managed</option>
                <option value="MONITORED">Monitored</option>
              </select>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm w-40"
              >
                <option value="all">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRING">Expiring</option>
                <option value="CRITICAL">Critical</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <Suspense fallback={<SkeletonDomainList items={5} />}>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-350px)]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="pb-3 font-medium">Domain</th>
                      <th className="pb-3 font-medium">Type</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Registrar</th>
                      <th className="pb-3 font-medium">Expires</th>
                      <th className="pb-3 font-medium">Price</th>
                      <th className="pb-3 font-medium">Auto-Renew</th>
                      <th className="pb-3 font-medium">Monitoring</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-muted-foreground">
                          No domains found. Click "Add Domain" to get started.
                        </td>
                      </tr>
                    ) : (
                      domains.map((domain) => (
                        <tr key={domain.id} className="border-b hover:bg-accent/50 transition-colors">
                          <td className="py-4">
                            <Link to={`/domains/${domain.id}`} className="font-mono text-sm font-medium hover:underline">
                              {domain.name}
                            </Link>
                          </td>
                          <td className="py-4">
                            <Badge variant={domain.type === 'MANAGED' ? 'default' : 'secondary'}>
                              {domain.type}
                            </Badge>
                          </td>
                          <td className="py-4">
                            <Badge variant={statusVariant(domain.status)}>
                              {domain.status}
                            </Badge>
                          </td>
                          <td className="py-4 text-sm text-muted-foreground">{domain.registrar || '—'}</td>
                          <td className="py-4 text-sm">{domain.expiryDate ? formatDate(domain.expiryDate) : '—'}</td>
                          <td className="py-4 text-sm text-muted-foreground">${domain.pricePerYear?.toFixed(2)}/{domain.currency || 'USD'}</td>
                          <td className="py-4 text-center">
                            {domain.autoRenew ? (
                              <Check className="w-4 h-4 mx-auto text-success" aria-label="Auto-renew enabled" />
                            ) : (
                              <X className="w-4 h-4 mx-auto text-muted-foreground" aria-label="Auto-renew disabled" />
                            )}
                          </td>
                          <td className="py-4 text-center">
                            {domain.monitoringEnabled ? (
                              <Circle className="w-4 h-4 mx-auto text-success fill-success" aria-label="Monitoring on" />
                            ) : (
                              <Circle className="w-4 h-4 mx-auto text-destructive" aria-label="Monitoring off" />
                            )}
                          </td>
                          <td className="py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link to={`/domains/${domain.id}`} className="text-sm text-primary hover:underline">View</Link>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCheckNow(domain.id)}
                                disabled={checkNow.isPending}
                                aria-label="Run check now"
                              >
                                {checkNow.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Circle className="w-4 h-4" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </CardContent>
        </Suspense>
      </Card>
      </div>
    );
  }