import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Database, Bell, Shield, Cpu, Download, Upload, Wrench, AlertTriangle, Trash, FolderOpen, CheckCircle, FileText, QrCode, Key, ShieldCheck, Eye, EyeOff, Copy, AlertCircle, X, LogOut } from 'lucide-react';
import { useSettings, useUpdateSettings, useMonitoringStatus, useOpenExternal, useShowOpenDialog, useAppVersion, useNotifications, useMarkNotificationRead } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

const mockUser = {
  name: 'John Doe',
  email: 'john@acme.com',
  role: 'ADMIN',
  avatar: 'JD'
};

export function Settings() {
  const [activeTab, setActiveTab] = useState('account');
  const [profileName, setProfileName] = useState(mockUser.name);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { logout } = useAuth();
  const navigate = useNavigate();
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // 2FA state
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  
  // Preferences state
  const [timezone, setTimezone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY');

  const { data: settings = [], isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { isPaused, toggle: toggleMonitoring } = useMonitoringStatus();
  const openExternal = useOpenExternal();
  const showOpenDialog = useShowOpenDialog();
  const { data: version } = useAppVersion();
  
  // Password change mutation
  const changePassword = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => 
      window.electronAPI?.users?.changePassword?.({ currentPassword, newPassword }),
    onSuccess: () => {
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to change password');
    }
  });
  
  // 2FA mutations
  const generate2FA = useMutation({
    mutationFn: () => window.electronAPI?.users?.generate2FA?.(),
    onSuccess: (data) => {
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setShow2FASetup(true);
    },
    onError: (error: any) => toast.error(error.message || 'Failed to generate 2FA')
  });
  
  const confirm2FA = useMutation({
    mutationFn: (token: string) => window.electronAPI?.users?.confirm2FA?.({ token }),
    onSuccess: (data) => {
      if (data.verified) {
        toast.success('2FA enabled successfully');
        setShow2FASetup(false);
        setIs2FAEnabled(true);
        setBackupCodes(data.backupCodes || []);
        setShowBackupCodes(true);
      } else {
        toast.error('Invalid token');
      }
    },
    onError: (error: any) => toast.error(error.message || 'Failed to enable 2FA')
  });
  
  const disable2FA = useMutation({
    mutationFn: (password: string) => window.electronAPI?.users?.disable2FA?.({ password }),
    onSuccess: () => {
      toast.success('2FA disabled');
      setIs2FAEnabled(false);
    },
    onError: (error: any) => toast.error(error.message || 'Failed to disable 2FA')
  });
  
  const { data: notifications = [], isLoading: notificationsLoading } = useNotifications({ limit: 20 });
  const markRead = useMarkNotificationRead();
  
  const { data: preferences } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => window.electronAPI?.preferences?.get?.(),
    staleTime: 60000,
  });
  
  const updatePreferences = useMutation({
    mutationFn: (data: Record<string, unknown>) => window.electronAPI?.preferences?.update?.(data),
    onSuccess: () => toast.success('Preferences saved'),
    onError: (error: any) => toast.error(error.message || 'Failed to save preferences')
  });

  const handleSave = async (data: Record<string, unknown>) => {
    setSaveStatus('saving');
    try {
      await updateSettings.mutateAsync(data);
      setSaveStatus('saved');
      toast.success('Settings saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      toast.error('Failed to save');
      setSaveStatus('idle');
    }
  };

  const handleBackup = async () => {
    try {
      const result = await showOpenDialog.mutateAsync({
        title: 'Select Backup Location',
        defaultPath: 'synch-cc-backup.db',
        filters: [{ name: 'Database', extensions: ['db'] }],
        properties: ['createDirectory']
      });
      if (!result.canceled && result.filePaths[0]) {
        toast.success('Backup initiated');
      }
    } catch {
      toast.error('Backup failed');
    }
  };

  const handleSavePreferences = () => {
    updatePreferences.mutate({
      timezone,
      date_format: dateFormat,
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    await changePassword.mutateAsync({ currentPassword, newPassword });
  };

  const handleGenerate2FA = async () => {
    await generate2FA.mutateAsync();
  };

  const handleConfirm2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpToken.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }
    await confirm2FA.mutateAsync(totpToken);
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm('Are you sure you want to disable 2FA?')) return;
    const password = prompt('Enter your password to confirm:');
    if (password) {
      await disable2FA.mutateAsync(password);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      toast.success('Signed out');
      navigate('/login');
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign out');
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="sync">Sync</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Manage your account settings, security, and preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <CardTitle className="text-base">Profile</CardTitle>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                    {mockUser.avatar}
                  </div>
                  <div className="flex-1">
                    <Label>Display Name</Label>
                    <Input defaultValue={profileName} className="w-64 mt-1" onChange={e => setProfileName(e.target.value)} />
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Email</Label>
                    <Input defaultValue={mockUser.email} disabled className="mt-1" />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Input defaultValue={mockUser.role} disabled className="mt-1" />
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t pt-6">
                <CardTitle className="text-base">Security</CardTitle>
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label>Change Password</Label>
                    <form onSubmit={handleChangePassword} className="space-y-2">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Current Password</Label>
                          <div className="relative mt-1">
                            <Input
                              type={showCurrentPassword ? 'text' : 'password'}
                              placeholder="Current password"
                              value={currentPassword}
                              onChange={e => setCurrentPassword(e.target.value)}
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <Label>New Password</Label>
                          <div className="relative mt-1">
                            <Input
                              type={showNewPassword ? 'text' : 'password'}
                              placeholder="New password (min 8 chars)"
                              value={newPassword}
                              onChange={e => setNewPassword(e.target.value)}
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <Label>Confirm New Password</Label>
                          <div className="relative mt-1">
                            <Input
                              type={showConfirmPassword ? 'text' : 'password'}
                              placeholder="Confirm new password"
                              value={confirmPassword}
                              onChange={e => setConfirmPassword(e.target.value)}
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                      <Button type="submit" disabled={changePassword.isPending} className="w-fit">
                        {changePassword.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Key className="w-4 h-4 mr-2" />} Update Password
                      </Button>
                    </form>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Two-Factor Authentication</Label>
                        <p className="text-xs text-muted-foreground">Add an extra layer of security with TOTP</p>
                      </div>
                      {!is2FAEnabled ? (
                        <Button variant="outline" onClick={handleGenerate2FA} disabled={generate2FA.isPending}>
                          {generate2FA.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />} Enable 2FA
                        </Button>
                      ) : (
                        <Button variant="destructive" onClick={handleDisable2FA} disabled={disable2FA.isPending}>
                          {disable2FA.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertCircle className="w-4 h-4 mr-2" />} Disable 2FA
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 2FA Setup Modal */}
                  {show2FASetup && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                      <div className="bg-card rounded-lg p-6 w-full max-w-md mx-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold">Set up Two-Factor Authentication</h3>
                          <button onClick={() => setShow2FASetup(false)} className="text-muted-foreground hover:text-foreground">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="text-center">
                            <p className="text-sm text-muted-foreground mb-4">Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)</p>
                            {qrCode && (
                              <img src={qrCode} alt="QR Code" className="mx-auto border rounded p-2 bg-white" />
                            )}
                            <p className="text-xs text-muted-foreground mt-2 font-mono break-all">{secret}</p>
                          </div>
                          
                          <form onSubmit={handleConfirm2FA} className="space-y-3">
                            <div>
                              <Label>Enter 6-digit code from authenticator app</Label>
                              <Input
                                type="text"
                                maxLength={6}
                                placeholder="123456"
                                value={totpToken}
                                onChange={e => setTotpToken(e.target.value)}
                                className="text-center text-2xl tracking-widest font-mono"
                                autoFocus
                              />
                            </div>
                            <Button type="submit" className="w-full" disabled={confirm2FA.isPending}>
                              {confirm2FA.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Enable 2FA
                            </Button>
                          </form>
                          
                          <p className="text-xs text-muted-foreground text-center">
                            Secret key (backup): <code className="font-mono">{secret}</code>
</p>
</div>
                        </div>
                      </div>
                     )}
                     
                     {showBackupCodes && backupCodes.length > 0 && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                        <div className="bg-card rounded-lg p-6 w-full max-w-md mx-4">
                          <h3 className="text-lg font-semibold mb-4">Save Your Backup Codes</h3>
                          <p className="text-sm text-muted-foreground mb-4">Store these codes safely. Each can be used once to recover access if you lose your authenticator.</p>
                          <div className="grid grid-cols-2 gap-2 mb-4">
                            {backupCodes.map((code, i) => (
                              <div key={i} className="bg-muted p-2 rounded font-mono text-sm text-center">
                                {code}
                              </div>
                            ))}
                          </div>
                          <Button onClick={() => { setShowBackupCodes(false); navigator.clipboard.writeText(backupCodes.join('\n')); toast.success('Copied to clipboard'); }} className="w-full">
                            <Copy className="w-4 h-4 mr-2" /> Copy All Codes
                          </Button>
                        </div>
                      </div>
                    )}

                  <div className="space-y-4 border-t pt-6">
                    <CardTitle className="text-base">Preferences</CardTitle>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Timezone</Label>
                        <select
                          className="mt-1 h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={timezone}
                          onChange={e => setTimezone(e.target.value)}
                        >
                          <option value="UTC">UTC</option>
                          <option value="America/New_York">Eastern Time</option>
                          <option value="America/Chicago">Central Time</option>
                          <option value="America/Denver">Mountain Time</option>
                          <option value="America/Los_Angeles">Pacific Time</option>
                          <option value="Europe/London">London</option>
                          <option value="Europe/Paris">Paris</option>
                          <option value="Asia/Tokyo">Tokyo</option>
                        </select>
                      </div>
                      <div>
                        <Label>Date Format</Label>
                        <select
                          className="mt-1 h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={dateFormat}
                          onChange={e => setDateFormat(e.target.value)}
                        >
                          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        </select>
                      </div>
                    </div>
                    <Button onClick={handleSavePreferences} disabled={updatePreferences.isPending}>
                      {updatePreferences.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save Preferences
                    </Button>
                  </div>

                  <div className="space-y-4 border-t pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Session</CardTitle>
                        <p className="text-xs text-muted-foreground">Sign out of your account on this device</p>
                      </div>
                      <Button variant="destructive" onClick={handleLogout} disabled={isLoggingOut}>
                        {isLoggingOut ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />} Log Out
                      </Button>
                    </div>
                  </div>
                </div>
                </div>
                </CardContent>
              </Card>
            </TabsContent>
        
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Configure how you receive alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                {[
                  { title: 'Domain Expiry Alerts', description: 'Get notified when domains are expiring', enabled: true },
                  { title: 'SSL Certificate Expiry', description: 'Alerts for expiring SSL certificates', enabled: true },
                  { title: 'DNS Changes', description: 'Notify when DNS records change', enabled: false },
                  { title: 'Registrar Lock Changes', description: 'Alert when registrar lock is disabled', enabled: true },
                  { title: 'WHOIS Changes', description: 'Notify on WHOIS record changes', enabled: false },
                  { title: 'Task Assignments', description: 'When tasks are assigned to you', enabled: true },
                  { title: 'Approval Requests', description: 'When approvals need your review', enabled: true },
                  { title: 'Mentions', description: 'When you are mentioned in chat', enabled: true },
                  { title: 'Sync Conflicts', description: 'When sync conflicts occur', enabled: true },
                  { title: 'Weekly Digest', description: 'Summary of domain status every Monday', enabled: false }
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <Switch checked={item.enabled} onCheckedChange={() => {}} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync">
          <Card>
            <CardHeader>
              <CardTitle>Sync Settings</CardTitle>
              <CardDescription>Configure synchronization with the cloud</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Auto Sync</p>
                  <p className="text-sm text-muted-foreground">Automatically sync changes every 30 seconds when online</p>
                </div>
                <Switch checked={true} onCheckedChange={() => {}} />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Sync on Startup</p>
                  <p className="text-sm text-muted-foreground">Perform a full sync when the application starts</p>
                </div>
                <Switch checked={true} onCheckedChange={() => {}} />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Conflict Resolution</p>
                  <p className="text-sm text-muted-foreground">How to handle conflicts between local and server changes</p>
                </div>
                <Select defaultValue="prompt">
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prompt">Prompt me</SelectItem>
                    <SelectItem value="server">Server wins</SelectItem>
                    <SelectItem value="local">Local wins</SelectItem>
                    <SelectItem value="merge">Auto-merge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Monitoring</p>
                  <p className="text-sm text-muted-foreground">{isPaused ? 'Paused' : 'Running'}</p>
                </div>
                <Button variant="outline" onClick={() => toggleMonitoring()} disabled={isLoading}>
                  {isPaused ? 'Resume' : 'Pause'} Monitoring
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Last Sync</p>
                  <p className="text-sm text-muted-foreground">2 minutes ago</p>
                </div>
                <Button variant="outline"><Loader2 className="w-4 h-4 mr-2" /> Sync Now</Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Pending Changes</p>
                  <p className="text-sm text-muted-foreground">3 changes waiting to sync</p>
                </div>
                <Button variant="outline">View</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced">
          <Card>
            <CardHeader>
              <CardTitle>Advanced</CardTitle>
              <CardDescription>Developer options and data management</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <CardTitle className="text-base">Data Management</CardTitle>
                <div className="flex flex-wrap gap-4 mt-4">
                  <Button variant="outline" onClick={handleBackup}><Database className="w-4 h-4 mr-2" /> Export Data</Button>
                  <Button variant="outline"><Upload className="w-4 h-4 mr-2" /> Import Data</Button>
                  <Button variant="outline"><Download className="w-4 h-4 mr-2" /> Migrate from Supabase</Button>
                </div>
              </div>
              <Separator />
              <div>
                <CardTitle className="text-base">Database</CardTitle>
                <div className="flex flex-wrap gap-4 mt-4">
                  <Button variant="outline" onClick={handleBackup}><Database className="w-4 h-4 mr-2" /> Backup Database</Button>
                  <Button variant="outline"><FolderOpen className="w-4 h-4 mr-2" /> Open DB Location</Button>
                  <Button variant="outline"><CheckCircle className="w-4 h-4 mr-2" /> Integrity Check</Button>
                </div>
              </div>
              <Separator />
              <div>
                <CardTitle className="text-base">Debug</CardTitle>
                <div className="flex flex-wrap gap-4 mt-4">
                  <Button variant="outline"><Wrench className="w-4 h-4 mr-2" /> Open DevTools</Button>
                  <Button variant="outline"><FileText className="w-4 h-4 mr-2" /> View Logs</Button>
                  <Button variant="outline"><Trash className="w-4 h-4 mr-2" /> Clear Cache</Button>
                </div>
              </div>
              <Separator />
              <div>
                <CardTitle className="text-base">Danger Zone</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">These actions are irreversible</p>
                <div className="flex flex-wrap gap-4 mt-4">
                  <Button variant="destructive"><AlertTriangle className="w-4 h-4 mr-2" /> Reset Application</Button>
                  <Button variant="destructive"><Trash className="w-4 h-4 mr-2" /> Delete All Data</Button>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Synchro-D v{version || '0.0.1-dev'}</span>
                <span>Electron + React + TypeScript</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}