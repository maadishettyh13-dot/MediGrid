import {
  Ambulance as AmbulanceIcon,
  ArrowRightLeft,
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { User } from '../types/medilink';
import { LiveNotification } from '../hooks/useMediLinkSocket';
import { AppLogo } from './AppLogo';

export type NavPage =
  | 'control-room'
  | 'hospital-console'
  | 'ambulance-dispatch'
  | 'transfers';

interface LayoutProps {
  user: User;
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  onLogout: () => void;
  notifications: LiveNotification[];
  onDismissNotification: (id: string) => void;
  children: ReactNode;
}

const NAV_ITEMS: Array<{ id: NavPage; label: string; icon: typeof LayoutDashboard; roles: User['role'][] }> = [
  {
    id: 'control-room',
    label: 'Control Room',
    icon: LayoutDashboard,
    roles: ['CONTROL_ROOM', 'HOSPITAL_STAFF', 'AMBULANCE_DISPATCHER'],
  },
  {
    id: 'hospital-console',
    label: 'Hospital Management',
    icon: Building2,
    roles: ['CONTROL_ROOM', 'HOSPITAL_STAFF'],
  },
  {
    id: 'ambulance-dispatch',
    label: 'Ambulance Dispatch',
    icon: AmbulanceIcon,
    roles: ['CONTROL_ROOM', 'AMBULANCE_DISPATCHER'],
  },
  {
    id: 'transfers',
    label: 'Patient Transfers',
    icon: ArrowRightLeft,
    roles: ['CONTROL_ROOM', 'HOSPITAL_STAFF', 'AMBULANCE_DISPATCHER'],
  },
];

const PAGE_TITLES: Record<NavPage, { title: string; subtitle: string }> = {
  'control-room': {
    title: 'Emergency Control Room · Hyderabad',
    subtitle: '42 Hyderabad hospitals · 4,284 beds · live 108 ambulance coordinates & incident stream (Synthetic Bed Data)',
  },
  'hospital-console': {
    title: 'Hospital Management Dashboard',
    subtitle: 'Individual bed IDs, admissions, discharges, transfers & 15-minute reservation holds',
  },
  'ambulance-dispatch': {
    title: 'Ambulance Dispatch Dashboard',
    subtitle: 'Emergency intake, nearest hospital ranking & atomic bed reservations',
  },
  transfers: {
    title: 'Patient Transfer Management',
    subtitle: 'Coordinated inter-hospital patient transfers across Hyderabad hospitals',
  },
};

export function Layout({
  user,
  activePage,
  onNavigate,
  onLogout,
  notifications,
  onDismissNotification,
  children,
}: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const meta = PAGE_TITLES[activePage];

  const roleLabel =
    user.role === 'CONTROL_ROOM'
      ? 'Control Room Operator'
      : user.role === 'HOSPITAL_STAFF'
      ? 'Hospital Staff'
      : 'Ambulance Dispatcher';

  return (
    <div className="min-h-screen bg-[#F8F3E9] text-[#302B2B] flex">
      <aside className="hidden lg:flex lg:flex-col lg:w-[260px] lg:shrink-0 bg-[#F3ECE0] border-r border-[#E7DED2]">
        <div className="px-5 py-5 border-b border-[#E7DED2]">
          <div className="flex items-center gap-2.5">
            <AppLogo size="md" />
            <div>
              <div className="text-base font-bold tracking-tight text-[#702C3B] leading-none">MediGrid</div>
              <div className="text-xs text-[#77716D] mt-1">Hyderabad Emergency Network</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Primary navigation">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap text-left ${
                  isActive
                    ? 'bg-[#F1E4E5] text-[#702C3B] border border-[#DEC4C8]'
                    : 'text-[#302B2B] hover:bg-[#EAE1D3] border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#702C3B]' : 'text-[#77716D]'}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E7DED2] bg-[#EFE7D9]">
          <div className="text-sm font-semibold text-[#302B2B] truncate">{user.name}</div>
          <div className="text-xs text-[#702C3B] font-medium mt-0.5">{roleLabel}</div>
          <div className="text-xs text-[#77716D] truncate mt-0.5">{user.email}</div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-[#302B2B]/30" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-[#F3ECE0] border-r border-[#E7DED2] flex flex-col h-full">
            <div className="px-5 py-4 border-b border-[#E7DED2] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AppLogo size="sm" />
                <span className="text-base font-bold text-[#702C3B]">MediGrid</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-[#77716D] hover:bg-[#E7DED2]"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                      isActive
                        ? 'bg-[#F1E4E5] text-[#702C3B] border border-[#DEC4C8]'
                        : 'text-[#302B2B] hover:bg-[#EAE1D3]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-[#E7DED2]">
              <div className="text-sm font-semibold text-[#302B2B]">{user.name}</div>
              <div className="text-xs text-[#702C3B] font-medium mt-0.5">{roleLabel}</div>
              <div className="text-xs text-[#77716D] truncate mt-0.5">{user.email}</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-[#FFFDF8] border-b border-[#E7DED2] px-5 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-[#E7DED2] text-[#302B2B] hover:bg-[#F8F3E9]"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-[#702C3B] truncate">{meta.title}</h1>
              <p className="text-xs text-[#77716D] truncate hidden sm:block">{meta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-[#702C3B] bg-[#FFFEFA] border border-[#DEC4C8] hover:bg-[#F1E4E5] transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Log Out</span>
            </button>
          </div>
        </header>

        {notifications.length > 0 && (
          <div className="px-5 lg:px-8 pt-4 space-y-2">
            {notifications.slice(0, 2).map((n) => (
              <div
                key={n.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-[#FFFEFA] border border-[#DEC4C8] text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-semibold text-[#702C3B] whitespace-nowrap">{n.title}</span>
                  <span className="text-[#77716D]" aria-hidden="true">·</span>
                  <span className="text-[#302B2B] truncate">{n.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onDismissNotification(n.id)}
                  className="text-[#77716D] hover:text-[#702C3B] shrink-0 font-medium"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}

        <main className="flex-1 px-5 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
