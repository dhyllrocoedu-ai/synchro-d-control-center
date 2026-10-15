import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, FileText, Globe, Shield, Key, Server, Clock, Loader2, AlertCircle, CheckCircle, FileCheck, Check } from 'lucide-react';
import { useDomains, useCheckDomainNow } from '@/hooks/useApi';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

function formatDate(ts?: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function statusVariant(status: string) {
  return status === 'CRITICAL' ? 'destructive' : status === 'EXPIRING' ? 'warning' : status === 'EXPIRED' ? 'destructive' : 'success';
}

const mockDomain = {
  id: '1',
  name: 'example.com',
  type: 'MANAGED',
  status: 'ACTIVE',
  registrar: 'Namecheap',
  registrarDomainId: 'nc-12345',
  nameservers: ['ns1.namecheap.com', 'ns2.namecheap.com'],
  expiryDate: Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60,
  autoRenew: true,
  monitoringEnabled: true,
  checkInterval: 3600,
  pricePerYear: 12.98,
  currency: 'USD',
  dnsRecords: [
    { type: 'A', name: '@', value: '192.0.2.1', ttl: 3600 },
    { type: 'AAAA', name: '@', value: '2001:db8::1', ttl: 3600 },
    { type: 'CNAME', name: 'www', value: 'example.com', ttl: 3600 },
    { type: 'MX', name: '@', value: 'mail.example.com', ttl: 3600, priority: 10 },
    { type: 'TXT', name: '@', value: 'v=spf1 include:_spf.google.com ~all', ttl: 3600 }
  ],
  ssl: {
    issuer: 'Let\'s Encrypt',
    validFrom: '2024-12-01',
    validTo: '2025-03-01',
    san: ['example.com', 'www.example.com'],
    fingerprint: 'SHA256:ABC123...'
  },
  whois: {
    registrar: 'Namecheap',
    creationDate: '2020-01-15',
    expiryDate: '2025-03-15',
    updatedDate: '2024-01-15',
    status: 'clientTransferProhibited',
    nameServers: ['ns1.namecheap.com', 'ns2.namecheap.com']
  },
  checks: [
    { type: 'WHOIS', status: 'OK', checkedAt: '2025-01-10 10:00', data: 'Registrar: Namecheap, Status: Active' },
    { type: 'DNS', status: 'OK', checkedAt: '2025-01-10 09:30', data: 'All records resolved correctly' },
    { type: 'SSL', status: 'WARNING', checkedAt: '2025-01-10 09:00', data: 'Expires in 49 days' },
    { type: 'EXPIRY', status: 'OK', checkedAt: '2025-01-10 08:00', data: 'Expires in 64 days' }
  ],
  activity: [
    { action: 'Domain renewed', user: 'John D.', time: '2025-01-08', details: 'Renewed for 1 year ($12.98)' },
    { action: 'Nameservers updated', user: 'Sarah M.', time: '2025-01-05', details: 'Changed to Cloudflare' },
    { action: 'SSL certificate renewed', user: 'Auto', time: '2024-12-01', details: 'Let\'s Encrypt auto-renewal' },
    { action: 'Task completed', user: 'Mike R.', time: '2024-11-28', details: 'DNS migration completed' }
  ]
};

export function DomainDetail() {
  const { id } = useParams();
  const { data: domains = [], refetch } = useDomains();
  const checkNow = useCheckDomainNow();
  
  // Use mock data for now, but in real app would fetch by ID
  const domain = (domains.find(d => d.id === id) || mockDomain) as typeof mockDomain;

  const handleCheckNow = async () => {
    if (!domain?.id) return;
    try {
      await checkNow.mutateAsync(domain.id);
      toast.success('Check initiated');
      refetch();
    } catch {
      toast.error('Check failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/domains" className="text-sm text-muted-foreground hover:underline mb-2 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Domains
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{domain.name}</h1>
          <p className="text-muted-foreground">{domain.type} • {domain.registrar}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCheckNow} disabled={checkNow.isPending}>
            {checkNow.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Check Now
          </Button>
          <Button variant="outline"><FileCheck className="w-4 h-4 mr-2" /> Request Approval</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={statusVariant(domain.status)} className="text-base px-3 py-1">
          {domain.status}
        </Badge>
        <Badge variant={domain.type === 'MANAGED' ? 'default' : 'secondary'}>
          {domain.type}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Expiry</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{domain.expiryDate ? formatDate(domain.expiryDate) : '—'}</div>
            <div className="text-sm text-muted-foreground">{domain.expiryDate ? Math.ceil((domain.expiryDate * 1000 - Date.now()) / (24 * 60 * 60 * 1000)) : '—'} days remaining</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Auto-Renew</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {domain.autoRenew ? (
                <Badge variant="success"><Check className="w-3 h-3 mr-1" /> Enabled</Badge>
              ) : (
                <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Disabled</Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monitoring</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {domain.monitoringEnabled ? (
                <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" /> Active</Badge>
              ) : (
                <Badge variant="secondary"><Server className="w-3 h-3 mr-1" /> Paused</Badge>
              )}
              <span className="text-sm text-muted-foreground">Every {domain.checkInterval / 3600}h</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="dns">DNS Records</TabsTrigger>
          <TabsTrigger value="ssl">SSL Certificate</TabsTrigger>
          <TabsTrigger value="whois">WHOIS</TabsTrigger>
          <TabsTrigger value="checks">Checks</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Registrar</span>
                  <span>{domain.registrar}</span>
                  <span className="text-muted-foreground">Registrar ID</span>
                  <span className="font-mono">{domain.registrarDomainId}</span>
                  <span className="text-muted-foreground">Price</span>
                  <span>${domain.pricePerYear}/{domain.currency}/yr</span>
                  <span className="text-muted-foreground">Check Interval</span>
                  <span>{domain.checkInterval / 3600} hours</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Nameservers</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {domain.nameservers.map((ns, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      <span className="font-mono">{ns}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="dns">
          <Card>
            <CardHeader>
              <CardTitle>DNS Records</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="pb-3 font-medium">Type</th>
                      <th className="pb-3 font-medium">Name</th>
                      <th className="pb-3 font-medium">Value</th>
                      <th className="pb-3 font-medium">TTL</th>
                      <th className="pb-3 font-medium">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domain.dnsRecords.map((record, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-3"><Badge variant="outline">{record.type}</Badge></td>
                        <td className="py-3 font-mono text-sm">{record.name}</td>
                        <td className="py-3 font-mono text-sm">{record.value}</td>
                        <td className="py-3 text-sm">{record.ttl}s</td>
                        <td className="py-3 text-sm">{record.priority || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ssl">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Certificate Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Issuer</span>
                  <span>{domain.ssl.issuer}</span>
                  <span className="text-muted-foreground">Valid From</span>
                  <span>{domain.ssl.validFrom}</span>
                  <span className="text-muted-foreground">Valid To</span>
                  <span>{domain.ssl.validTo}</span>
                  <span className="text-muted-foreground">Fingerprint</span>
                  <span className="font-mono text-xs">{domain.ssl.fingerprint}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Subject Alternative Names</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {domain.ssl.san.map((san, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      {san}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="whois">
          <Card>
            <CardHeader>
              <CardTitle>WHOIS Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Registrar</span>
                <span>{domain.whois.registrar}</span>
                <span className="text-muted-foreground">Creation Date</span>
                <span>{domain.whois.creationDate}</span>
                <span className="text-muted-foreground">Expiry Date</span>
                <span>{domain.whois.expiryDate}</span>
                <span className="text-muted-foreground">Updated Date</span>
                <span>{domain.whois.updatedDate}</span>
                <span className="text-muted-foreground">Status</span>
                <span>{domain.whois.status}</span>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium text-sm mb-2">Name Servers</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {domain.whois.nameServers.map((ns, i) => (
                    <li key={i}>{ns}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checks">
          <Card>
            <CardHeader>
              <CardTitle>Recent Checks</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="pb-3 font-medium">Type</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Checked At</th>
                      <th className="pb-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domain.checks.map((check, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-3"><Badge variant="outline">{check.type}</Badge></td>
                        <td className="py-3">
                          <Badge variant={
                            check.status === 'OK' ? 'success' :
                            check.status === 'WARNING' ? 'warning' :
                            check.status === 'CRITICAL' ? 'destructive' : 'secondary'
                          }>
                            {check.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-sm">{check.checkedAt}</td>
                        <td className="py-3 text-sm text-muted-foreground">{check.data}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {domain.activity.map((item, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 border rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.action}</span>
                        <span className="text-sm text-muted-foreground">by {item.user}</span>
                        <span className="text-xs text-muted-foreground">{item.time}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{item.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}