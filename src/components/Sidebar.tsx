import React from 'react';
import {
  BarChart3,
  Calendar,
  FileText,
  Home,
  LayoutGrid,
  MessageSquare,
  Package,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Users,
  Video,
  X,
} from 'lucide-react';
import { UserPrivateProfile } from '../types';

interface SidebarProps {
  currentUser: UserPrivateProfile;
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  currentTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
}) => {
  const isCustomer = currentUser.accountType === 'customer';
  const isAdmin =
    currentUser.accountType === 'admin' ||
    currentUser.role === 'Super Administrator' ||
    currentUser.role === 'Company Administrator';

  const navItems = isCustomer
    ? [
        { id: 'customer-home', label: 'Customer Home', icon: Home },
        { id: 'products', label: 'Products & Services', icon: Package },
        { id: 'orders', label: 'My Orders & Invoices', icon: ShoppingCart },
        { id: 'meetings', label: 'My Meetings', icon: Video },
        { id: 'messaging', label: 'Community & Support', icon: MessageSquare },
        { id: 'sync', label: 'Sync & Devices', icon: RefreshCw },
      ]
    : [
        { id: 'dashboard', label: 'Workspace', icon: LayoutGrid },
        { id: 'meetings', label: 'Meetings & Calendar', icon: Calendar },
        { id: 'messaging', label: 'Team & Support Chat', icon: MessageSquare },
        { id: 'directory', label: 'Directory', icon: Users },
        { id: 'reports', label: 'Reports & Announcements', icon: FileText },
        { id: 'analytics', label: 'Analytics & Exports', icon: BarChart3 },
        { id: 'sync', label: 'Synchronization Center', icon: RefreshCw },
        ...(isAdmin ? [{ id: 'admin', label: 'Administration', icon: ShieldAlert }] : []),
      ];

  const handleSelect = (id: string) => {
    onSelectTab(id);
    onCloseMobile();
  };

  return (
    <>
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
        />
      )}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 max-w-[82vw] h-[100dvh] lg:h-auto shrink-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:pt-0 lg:pb-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 space-y-1.5 overflow-y-auto flex-1 min-h-0">
          <div className="flex items-center justify-between lg:hidden pb-3 mb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-bold text-sm text-slate-900 dark:text-white">7Sunday Meet Menu</span>
            <button onClick={onCloseMobile} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {currentUser.displayName}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{currentUser.email}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 pt-1">
              {currentUser.accountType === 'customer' ? 'Isolated Customer Account' : currentUser.department || 'Seven Sunday Ethiopia'}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};
