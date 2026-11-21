import React, { useState } from 'react';
import {
  Bell,
  BellOff,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Phone,
  Plus,
  Search,
  Settings,
  Shield,
  Sun,
  Video,
  X,
} from 'lucide-react';
import { updateOwnProfile } from '../services/firestoreService';
import { NotificationItem, PresenceStatus, UserPrivateProfile } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  currentUser: UserPrivateProfile;
  notifications: NotificationItem[];
  onMarkNotificationRead: (id: string) => void;
  onNotificationAction?: (notification: NotificationItem) => void;
  onProfileUpdated: (updated: Partial<UserPrivateProfile>) => void;
  onStartInstantMeeting: () => void;
  onJoinByCode: (code: string) => void;
  onOpenDeviceSettings: () => void;
  onOpenAccountSecurity: () => void;
  onSignOut: () => void;
  currentTheme: 'dark' | 'light';
  onToggleTheme: () => void;
  onToggleMobileMenu: () => void;
}

const PRESENCE_META: Record<PresenceStatus, { label: string; dot: string }> = {
  online: { label: 'Online', dot: 'bg-emerald-500' },
  busy: { label: 'Busy', dot: 'bg-rose-500' },
  away: { label: 'Away', dot: 'bg-amber-400' },
  in_meeting: { label: 'In Meeting', dot: 'bg-sky-500' },
  dnd: { label: 'Do Not Disturb', dot: 'bg-rose-600' },
  offline: { label: 'Offline', dot: 'bg-slate-400' },
};

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  notifications,
  onMarkNotificationRead,
  onNotificationAction,
  onProfileUpdated,
  onStartInstantMeeting,
  onJoinByCode,
  onOpenDeviceSettings,
  onOpenAccountSecurity,
  onSignOut,
  currentTheme,
  onToggleTheme,
  onToggleMobileMenu,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [showMobileJoin, setShowMobileJoin] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPresenceMenu, setShowPresenceMenu] = useState(false);
  const [statusDraft, setStatusDraft] = useState(currentUser.statusMessage || '');
  const unreadCount = notifications.filter((n) => !n.read).length;

  const isDnd = Boolean(currentUser.dndMode || currentUser.presenceStatus === 'dnd');
  const activePresence: PresenceStatus = isDnd
    ? 'dnd'
    : currentUser.presenceStatus || 'online';
  const presenceInfo = PRESENCE_META[activePresence] || PRESENCE_META.online;

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    onJoinByCode(joinCode.trim());
    setJoinCode('');
    setShowMobileJoin(false);
  };

  const handleSelectPresence = async (nextStatus: PresenceStatus) => {
    const nextDnd = nextStatus === 'dnd';
    const updates: Partial<UserPrivateProfile> = {
      presenceStatus: nextStatus,
      dndMode: nextDnd,
    };
    onProfileUpdated(updates);
    await updateOwnProfile(currentUser.uid, updates).catch(() => {});
    setShowPresenceMenu(false);
  };

  const handleSaveStatusMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = statusDraft.trim().slice(0, 160);
    onProfileUpdated({ statusMessage: cleaned });
    await updateOwnProfile(currentUser.uid, { statusMessage: cleaned }).catch(() => {});
    setShowPresenceMenu(false);
  };

  const handleToggleDndQuick = async () => {
    const nextDnd = !isDnd;
    const updates: Partial<UserPrivateProfile> = {
      dndMode: nextDnd,
      presenceStatus: nextDnd ? 'dnd' : 'online',
    };
    onProfileUpdated(updates);
    await updateOwnProfile(currentUser.uid, updates).catch(() => {});
  };

  return (
    <header className="sticky top-0 z-30 pt-[env(safe-area-inset-top)] bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
      <div className="h-14 sm:h-16 px-2.5 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-3">
        {/* Zone 1: Brand + Mobile Menu */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 md:flex-initial">
          <button
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            aria-label="Toggle Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/assets/aistudio/seven_sunday_app_icon_crcle_c5b9c7db.png"
              alt="7Sunday Meet"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover shrink-0 shadow-sm"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white truncate">
                  7Sunday Meet
                </span>
                <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0">
                  {currentUser.accountType === 'customer'
                    ? 'Customer Portal'
                    : currentUser.accountType === 'admin'
                    ? 'Admin Suite'
                    : 'Employee Hub'}
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {currentUser.role}
              </p>
            </div>
          </div>
        </div>

        {/* Zone 2: Join Meeting Code Input (Tablet/Desktop) */}
        <form onSubmit={handleJoinSubmit} className="hidden md:flex items-center max-w-xs w-full">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Join meeting by code..."
              className="w-full pl-8 pr-16 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button
              type="submit"
              className="absolute right-1 top-1 bottom-1 px-2.5 rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-[11px] font-semibold"
            >
              Join
            </button>
          </div>
        </form>

        {/* Zone 3: Action Cluster */}
        <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 shrink-0">
          {/* Mobile Join-by-Code Toggle */}
          <button
            onClick={() => setShowMobileJoin((s) => !s)}
            className={`md:hidden p-2 rounded-xl transition-colors ${
              showMobileJoin
                ? 'bg-sky-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Join meeting by code"
            aria-label="Join meeting by code"
          >
            <Search className="w-4 h-4" />
          </button>

          {currentUser.accountType !== 'customer' && (
            <button
              onClick={onStartInstantMeeting}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-sm transition-colors whitespace-nowrap"
              title="Start New Instant Meeting"
            >
              <Video className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Meeting</span>
              <Plus className="w-3.5 h-3.5 sm:hidden" />
            </button>
          )}

          {/* Presence & Availability Switcher */}
          <div className="relative">
            <button
              onClick={() => {
                setStatusDraft(currentUser.statusMessage || '');
                setShowNotifications(false);
                setShowPresenceMenu((s) => !s);
              }}
              className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100"
              title="Availability & Status"
            >
              <span className={`w-2 h-2 rounded-full ${presenceInfo.dot}`} />
              <span className="hidden xl:inline max-w-[110px] truncate">{presenceInfo.label}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showPresenceMenu && (
              <div className="fixed sm:absolute top-16 sm:top-full left-3 right-3 sm:left-auto sm:right-0 sm:mt-2 sm:w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-3 z-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Availability & Presence
                  </span>
                  <button
                    onClick={() => setShowPresenceMenu(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-1">
                  {(['online', 'busy', 'away', 'in_meeting', 'dnd'] as PresenceStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => handleSelectPresence(st)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                        activePresence === st
                          ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${PRESENCE_META[st].dot}`} />
                        <span>{PRESENCE_META[st].label}</span>
                      </span>
                      {activePresence === st && <span className="text-[10px] font-bold">Active</span>}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSaveStatusMsg} className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <label className="block text-[11px] font-semibold text-slate-500">
                    Custom Availability Note
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      maxLength={160}
                      value={statusDraft}
                      onChange={(e) => setStatusDraft(e.target.value)}
                      placeholder="e.g. In workshop until 15:00"
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-[11px] font-bold shrink-0"
                    >
                      Set
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Quick DND Toggle */}
          <button
            onClick={handleToggleDndQuick}
            className={`hidden sm:inline-flex p-2 rounded-xl transition-colors ${
              isDnd
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={isDnd ? 'Do Not Disturb ON (Click to turn off)' : 'Enable Do Not Disturb'}
          >
            <BellOff className="w-4 h-4" />
          </button>

          <PWAInstallButton />

          <button
            onClick={onOpenDeviceSettings}
            className="hidden sm:inline-flex p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Audio & Video Diagnostics"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleTheme}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Toggle Dark / Light Theme"
          >
            {currentTheme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => {
                setShowPresenceMenu(false);
                setShowNotifications((s) => !s);
              }}
              className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title={isDnd ? 'Notifications (Muted by DND)' : 'Notifications'}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span
                  className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center tabular-nums ${
                    isDnd ? 'bg-slate-500' : 'bg-rose-600'
                  }`}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="fixed sm:absolute top-16 sm:top-full left-3 right-3 sm:left-auto sm:right-0 sm:mt-2 sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-3 z-50">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Notifications ({unreadCount} unread){isDnd ? ' · DND Muted' : ''}
                  </span>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-2 max-h-72 overflow-y-auto space-y-2">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">No notifications yet.</p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          onMarkNotificationRead(n.id);
                          onNotificationAction?.(n);
                          setShowNotifications(false);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl border text-xs transition-colors ${
                          n.read
                            ? 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-500'
                            : 'bg-sky-500/5 border-sky-500/30 text-slate-900 dark:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold truncate">{n.title}</p>
                          {n.type === 'call_invite' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                              <Phone className="w-3 h-3" />
                              Answer
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] opacity-80 mt-0.5 line-clamp-2">{n.body}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Account & Security */}
          <button
            onClick={onOpenAccountSecurity}
            className="relative flex items-center gap-2 pl-1 pr-1.5 sm:pl-1.5 sm:pr-2.5 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
            title="Account & Security Settings"
          >
            <div className="relative">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.displayName}
                  className="w-7 h-7 rounded-lg object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-sky-600 text-white text-xs font-bold flex items-center justify-center">
                  {currentUser.displayName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${presenceInfo.dot}`}
              />
            </div>
            <Shield className="w-3.5 h-3.5 text-emerald-500 hidden sm:block" />
          </button>

          <button
            onClick={onSignOut}
            className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-500/10"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Mobile Join-by-Code + Quick Actions Bar (<md screens) */}
      {showMobileJoin && (
        <div className="md:hidden px-3 pb-3 pt-1 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900">
          <form onSubmit={handleJoinSubmit} className="flex-1 flex items-center gap-1.5 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Enter meeting code..."
                className="w-full pl-8 pr-16 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="absolute right-1 top-1 bottom-1 px-3 rounded-lg bg-sky-600 text-white text-xs font-bold"
              >
                Join
              </button>
            </div>
          </form>
          <button
            onClick={handleToggleDndQuick}
            className={`px-2.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1 ${
              isDnd ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <BellOff className="w-3.5 h-3.5" />
            <span>{isDnd ? 'DND On' : 'DND'}</span>
          </button>
          <button
            onClick={() => {
              setShowMobileJoin(false);
              onOpenDeviceSettings();
            }}
            className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold inline-flex items-center gap-1"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>AV Check</span>
          </button>
        </div>
      )}
    </header>
  );
};
