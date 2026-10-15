import { useState, useEffect, useRef, useId } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  ChevronDown,
  FileCheck,
  Globe,
  Kanban,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Settings,
  User,
  Wifi,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logoUrl } from '@/lib/assets';
import { Separator } from '@/components/ui/separator';
import { useNotifications, useMarkNotificationRead } from '@/hooks/useApi';
import { useFloating, autoUpdate, offset, flip, shift, arrow, arrow as floatingArrow } from '@floating-ui/react';
import { useAuth } from '@/context/AuthContext';
import { useIsFetching } from '@tanstack/react-query';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const isFetching = useIsFetching();

  return (
    <div className="flex h-full bg-background">
      <Sidebar open={sidebarOpen} onToggle={setSidebarOpen} />
      <Separator orientation="vertical" className="h-full" />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Global loading progress bar */}
        {isFetching > 0 && (
          <div className="fixed top-0 left-0 right-0 h-1 bg-primary/50 z-50 animate-pulse" style={{ width: `${Math.min(isFetching * 20, 100)}%` }} />
        )}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

const navigation: { name: string; href: string; icon: LucideIcon }[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Domains', href: '/domains', icon: Globe },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Tasks', href: '/tasks', icon: Kanban },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Approvals', href: '/approvals', icon: FileCheck },
];

const bottomNavigation: { name: string; href: string; icon: LucideIcon }[] = [
  { name: 'Account Settings', href: '/settings', icon: Settings }
];

export function Sidebar({ open, onToggle }: { open: boolean; onToggle: (open: boolean) => void }) {
  return (
    <aside
      className={cn(
        'h-full shrink-0 border-r bg-card transition-all duration-200 flex flex-col',
        open ? 'w-64' : 'w-16'
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b',
          open ? 'justify-between px-4' : 'justify-center px-2'
        )}
      >
        {open ? (
          <>
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center shadow-lg shadow-primary/25 shrink-0">
                <img src={logoUrl} alt="Synchro-D" className="h-6 w-auto object-contain" />
              </div>
              <span className="text-lg font-bold tracking-tight text-foreground whitespace-nowrap">
                Synchro<span className="text-primary">-D</span>
              </span>
            </div>
            <button
              onClick={() => onToggle(false)}
              className="p-2 rounded-md hover:bg-accent transition-colors shrink-0"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </>
        ) : (
          <button
            onClick={() => onToggle(true)}
            className="flex items-center justify-center rounded-xl transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center shadow-lg shadow-primary/25">
              <img src={logoUrl} alt="Synchro-D" className="h-6 w-auto object-contain" />
            </span>
          </button>
        )}
      </div>

      {open && (
        <div className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
          Workspace
        </div>
      )}

      <nav className={cn('flex-1 overflow-y-auto space-y-1 scrollbar-hide', open ? 'p-4 pt-2' : 'p-2')}>
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.href}
              title={open ? undefined : item.name}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-lg transition-colors',
                  open ? 'gap-3 px-3 py-2 text-sm font-medium' : 'justify-center px-1 py-2',
                  isActive
                    ? 'bg-primary/15 text-primary border border-primary/20 shadow-sm shadow-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent'
                )
              }
            >
              <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
              {open && <span>{item.name}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className={cn('border-t my-2', open ? 'mx-4' : 'mx-2')} />

      <nav className={cn('space-y-1', open ? 'p-4 pt-0' : 'p-2')}>
        {bottomNavigation.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.href}
              title={open ? undefined : item.name}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-lg transition-colors',
                  open ? 'gap-3 px-3 py-2 text-sm font-medium' : 'justify-center px-1 py-2',
                  isActive
                    ? 'bg-primary/15 text-primary border border-primary/20 shadow-sm shadow-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent'
                )
              }
            >
              <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
              {open && <span>{item.name}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className={cn('border-t', open ? 'p-4' : 'p-2')}>
        <div
          className={cn(
            'flex items-center gap-2 text-xs text-muted-foreground',
            !open && 'justify-center'
          )}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {open && <span>All systems normal</span>}
        </div>
      </div>
    </aside>
  );
}

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const { data: notifications = [], isLoading } = useNotifications({ limit: 20 });
  const markRead = useMarkNotificationRead();
  const dropdownId = useId();
  const { user } = useAuth();
  const navigate = useNavigate();

  const unreadCount = notifications.filter(n => !n.read).length;

  const { refs, floatingStyles, middlewareData, context } = useFloating({
    placement: 'bottom-start',
    strategy: 'absolute',
    middleware: [
      offset(8),
      flip({ fallbackPlacements: ['bottom', 'top', 'right', 'left'] }),
      shift({ padding: 8 }),
      arrow({ element: arrowRef }),
    ],
    open: notifOpen,
    onOpenChange: setNotifOpen,
    whileElementsMounted: autoUpdate,
  });

  const arrowStyles = middlewareData.arrow
    ? { left: `${middlewareData.arrow.x}px`, top: `${middlewareData.arrow.y}px` }
    : {};

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown && !dropdown.contains(e.target as Node)) {
          setNotifOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownId]);

  const handleNotificationClick = (notif: { id: string; type: string; entityId?: string; read?: boolean }) => {
    if (!notif.read) {
      markRead.mutate(notif.id);
    }
    setNotifOpen(false);
    switch (notif.type) {
      case 'APPROVAL_REQUESTED':
      case 'APPROVAL_APPROVED':
      case 'APPROVAL_REJECTED':
        navigate(`/approvals${notif.entityId ? `/${notif.entityId}` : ''}`);
        break;
      case 'DOMAIN_EXPIRY':
      case 'DOMAIN_CHECK_FAILED':
      case 'SSL_EXPIRY':
        navigate(`/domains${notif.entityId ? `/${notif.entityId}` : ''}`);
        break;
      case 'TASK_ASSIGNED':
      case 'TASK_UPDATED':
        navigate(`/tasks${notif.entityId ? `/${notif.entityId}` : ''}`);
        break;
      case 'SSL_CERTIFICATE_EXPIRY':
        navigate('/settings?tab=notifications');
        break;
      default:
        break;
    }
  };

  return (
    <header className="h-16 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 sticky top-0 z-30">
      <div className="flex h-full items-center justify-between px-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-md hover:bg-accent transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 lg:hidden" />
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border bg-accent/40 text-xs">
            <Wifi className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground">Synced</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-sm text-muted-foreground">Online</span>
          </div>

          {/* Notification Bell with Floating UI Dropdown */}
          <div className="relative" ref={bellRef}>
            <button
              ref={refs.setReference}
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative p-2 rounded-md hover:bg-accent transition-colors"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              aria-expanded={notifOpen}
              aria-haspopup="dialog"
              aria-controls={dropdownId}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-[10px] font-medium flex items-center justify-center text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {context?.open && (
              <div
                id={dropdownId}
                ref={refs.setFloating}
                style={floatingStyles}
                className="min-w-[280px] max-w-[400px] w-fit bg-card border rounded-lg shadow-lg overflow-hidden z-[9999] animate-in fade-in-0 zoom-in-95 duration-150"
                role="dialog"
                aria-labelledby="notif-title"
              >
                <div
                  ref={arrowRef}
                  style={arrowStyles}
                  className="absolute left-6 top-[-4px] w-3 h-3 rotate-45 bg-card border-l border-t border-border"
                />
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <h4 id="notif-title" className="font-medium">Notifications</h4>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => { /* mark all read */ }}
                      className="text-xs text-primary hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {isLoading ? (
                    <div className="p-4 text-center text-muted-foreground">
                      Loading notifications...
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      No notifications yet
                    </div>
                  ) : (
                    <div className="divide-y">
                      {notifications.map((notif: any) => (
                        <button
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`w-full p-3 text-left hover:bg-accent/50 transition-colors ${
                            !notif.read ? 'bg-accent/30' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${
                              !notif.read ? 'bg-primary' : 'bg-muted-foreground/30'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${!notif.read ? 'font-medium' : ''}`}>
                                {notif.message}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(notif.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-4 py-2 border-t">
                  <button
                    onClick={() => navigate('/settings?tab=notifications')}
                    className="w-full text-sm text-primary hover:underline"
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Account (managed in Account Settings) */}
          <div className="flex items-center gap-2 p-2" aria-label="Account">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
              {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || user?.email?.slice(0, 2).toUpperCase() || 'U'}
            </div>
            <span className="hidden md:block text-sm font-medium">{user?.name || 'User'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}