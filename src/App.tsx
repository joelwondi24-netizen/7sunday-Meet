import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Bell, Phone, Video, X } from 'lucide-react';
import { AccountSecurityModal } from './components/AccountSecurityModal';
import { AdminPanel } from './components/AdminPanel';
import { AuthPortal } from './components/AuthPortal';
import { CustomerPortal } from './components/CustomerPortal';
import { Dashboard } from './components/Dashboard';
import { DeviceSettingsModal } from './components/DeviceSettingsModal';
import { DirectoryView } from './components/DirectoryView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MeetingRoom } from './components/MeetingRoom';
import { MeetingScheduler } from './components/MeetingScheduler';
import { MessagingHub } from './components/MessagingHub';
import { Navbar } from './components/Navbar';
import { ReportsAndAnalytics } from './components/ReportsCenter';
import { Sidebar } from './components/Sidebar';
import { SyncCenter } from './components/SyncCenter';
import { auth } from './lib/firebase';
import { api } from './services/api';
import {
  createMeetingDoc,
  getUserProfile,
  markNotificationRead,
  startDirectCallNotification,
  subscribeChats,
  subscribeDirectoryProfiles,
  subscribeMeetingAttendance,
  subscribeMeetings,
  subscribeNotifications,
  subscribeOrders,
  subscribeProducts,
  subscribeReports,
} from './services/firestoreService';
import {
  ChatConversation,
  CustomerOrder,
  DirectoryProfile,
  Meeting,
  MeetingAttendance,
  NotificationItem,
  Product,
  ReportEntry,
  UserPrivateProfile,
} from './types';

function MainApp() {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserPrivateProfile | null>(null);
  const [guestSession, setGuestSession] = useState<{
    meetingCode: string;
    guestName: string;
    password?: string;
    callMode?: 'video' | 'audio';
  } | null>(null);

  const [initialRoomParam, setInitialRoomParam] = useState<string | null>(null);
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [activeCallMode, setActiveCallMode] = useState<'video' | 'audio'>('video');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showAccountSecurity, setShowAccountSecurity] = useState(false);

  // Real-time Firestore collections
  const [directory, setDirectory] = useState<DirectoryProfile[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [attendance, setAttendance] = useState<MeetingAttendance[]>([]);
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const initialNotifLoadRef = useRef<boolean>(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const mode = params.get('mode');
    const tab = params.get('tab');
    const chat = params.get('chat');
    if (room) setInitialRoomParam(room);
    if (mode === 'audio' || mode === 'video') setActiveCallMode(mode);
    if (tab) setCurrentTab(tab);
    if (chat) setActiveChatId(chat);
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser || !fbUser.emailVerified) {
        setCurrentUser(null);
        setAuthLoading(false);
        return;
      }
      try {
        const profile = await getUserProfile(fbUser.uid);
        if (profile && profile.status === 'active') {
          setCurrentUser(profile);
          setCurrentTab((prev) =>
            prev && prev !== 'dashboard' && prev !== 'customer-home'
              ? prev
              : profile.accountType === 'customer'
              ? 'customer-home'
              : 'dashboard'
          );
        } else {
          setCurrentUser(null);
        }
      } catch {
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Attach Firestore real-time listeners ONLY after profile is authenticated & loaded
  useEffect(() => {
    if (!currentUser) return;
    initialNotifLoadRef.current = true;
    seenNotifIdsRef.current = new Set();

    const unsubs: (() => void)[] = [];
    unsubs.push(subscribeDirectoryProfiles(currentUser.accountType, setDirectory));
    unsubs.push(subscribeMeetings(currentUser, setMeetings));
    unsubs.push(subscribeChats(currentUser, setChats));
    unsubs.push(
      subscribeNotifications(currentUser.uid, (items) => {
        setNotifications(items);
        if (initialNotifLoadRef.current) {
          items.forEach((n) => seenNotifIdsRef.current.add(n.id));
          initialNotifLoadRef.current = false;
          return;
        }
        const newestUnread = items.find(
          (n) => !n.read && !seenNotifIdsRef.current.has(n.id)
        );
        items.forEach((n) => seenNotifIdsRef.current.add(n.id));

        const isDnd = Boolean(currentUser.dndMode || currentUser.presenceStatus === 'dnd');
        const isBlocked = newestUnread?.senderUid
          ? (currentUser.blockedUids || []).includes(newestUnread.senderUid)
          : false;

        if (newestUnread && !isDnd && !isBlocked) {
          setToastNotification(newestUnread);
        }
      })
    );
    unsubs.push(subscribeOrders(currentUser, setOrders));
    unsubs.push(subscribeReports(currentUser, setReports));
    unsubs.push(subscribeMeetingAttendance(currentUser, setAttendance));
    unsubs.push(
      subscribeProducts(
        currentUser.accountType === 'admin' ||
          currentUser.role === 'Super Administrator' ||
          currentUser.role === 'Company Administrator',
        setProducts
      )
    );

    if (initialRoomParam) {
      setActiveRoomCode(initialRoomParam);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [currentUser?.uid]);

  const handleJoinRoom = (code: string, callMode: 'video' | 'audio' = 'video') => {
    setActiveCallMode(callMode);
    setActiveRoomCode(code);
  };

  const handleStartInstantMeeting = async (callMode: 'video' | 'audio' = 'video') => {
    if (!currentUser) return;
    const now = new Date();
    const end = new Date(Date.now() + 60 * 60 * 1000);
    const created = await createMeetingDoc(currentUser, {
      title: `${currentUser.displayName}'s Instant ${callMode === 'audio' ? 'Voice' : 'Video'} Meeting`,
      meetingScope: currentUser.accountType === 'customer' ? 'customer' : 'external',
      type: 'instant',
      callMode,
      priority: 'normal',
      status: 'live',
      scheduledStart: now.toISOString(),
      scheduledEnd: end.toISOString(),
      waitingRoomEnabled: true,
      isLocked: false,
      hasPassword: false,
      participantUids: [currentUser.uid],
      invitedEmails: [],
    });
    await api
      .registerRoomRuntime({
        code: created.code,
        title: created.title,
        meetingScope: created.meetingScope,
        callMode,
        waitingRoomEnabled: created.waitingRoomEnabled,
      })
      .catch(() => {});
    handleJoinRoom(created.code, callMode);
  };

  const handleStartDirectCall = async (
    targetUids: string[],
    mode: 'audio' | 'video',
    customTitle?: string
  ) => {
    if (!currentUser) return;
    const now = new Date();
    const end = new Date(Date.now() + 60 * 60 * 1000);
    const created = await createMeetingDoc(currentUser, {
      title: customTitle || `${mode === 'audio' ? 'Voice' : 'Video'} Call`,
      meetingScope: currentUser.accountType === 'customer' ? 'customer' : 'internal',
      type: 'instant',
      callMode: mode,
      priority: 'high',
      status: 'live',
      scheduledStart: now.toISOString(),
      scheduledEnd: end.toISOString(),
      waitingRoomEnabled: false,
      isLocked: false,
      hasPassword: false,
      participantUids: [currentUser.uid, ...targetUids],
      invitedEmails: [],
    });
    await api
      .registerRoomRuntime({
        code: created.code,
        title: created.title,
        meetingScope: created.meetingScope,
        callMode: mode,
        waitingRoomEnabled: false,
      })
      .catch(() => {});
    await startDirectCallNotification(currentUser, targetUids, created.code, mode).catch(() => {});
    handleJoinRoom(created.code, mode);
  };

  const handleNotificationAction = (n: NotificationItem) => {
    if (!n.link) return;
    try {
      const url = new URL(n.link, window.location.origin);
      const room = url.searchParams.get('room');
      const mode = url.searchParams.get('mode');
      const tab = url.searchParams.get('tab');
      const chat = url.searchParams.get('chat');
      if (room) {
        handleJoinRoom(room, mode === 'audio' ? 'audio' : n.callMode || 'video');
        return;
      }
      if (tab === 'messaging') {
        if (chat) setActiveChatId(chat);
        setCurrentTab('messaging');
      }
    } catch {
      // ignore invalid links
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setActiveRoomCode(null);
    setGuestSession(null);
  };

  // External Guest Active Meeting Room
  if (guestSession) {
    return (
      <MeetingRoom
        meetingCode={guestSession.meetingCode}
        currentUser={{
          uid: `guest-${Date.now()}`,
          displayName: guestSession.guestName,
          email: '',
          role: 'External Guest',
          isAuthenticated: false,
        }}
        initialPassword={guestSession.password}
        initialCallMode={guestSession.callMode || activeCallMode}
        onLeave={() => {
          setGuestSession(null);
          if (window.location.search) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }}
      />
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-3 p-4">
        <img
          src="/assets/aistudio/seven_sunday_app_icon_crcle_c5b9c7db.png"
          alt="7Sunday Meet"
          className="w-12 h-12 rounded-2xl animate-pulse"
        />
        <p className="text-xs font-semibold text-slate-500">Connecting to 7Sunday Meet...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthPortal
        initialRoomCode={initialRoomParam}
        onAuthenticated={(profile) => {
          setCurrentUser(profile);
          setCurrentTab(profile.accountType === 'customer' ? 'customer-home' : 'dashboard');
        }}
        onJoinAsGuest={(meetingCode, guestName, password) =>
          setGuestSession({ meetingCode, guestName, password, callMode: activeCallMode })
        }
      />
    );
  }

  // Authenticated Active Meeting Room
  if (activeRoomCode) {
    const activeMeeting = meetings.find((m) => m.code === activeRoomCode);
    return (
      <MeetingRoom
        meetingCode={activeRoomCode}
        meetingScope={activeMeeting?.meetingScope}
        currentUser={{
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          email: currentUser.email,
          role: currentUser.role,
          accountType: currentUser.accountType,
          avatarUrl: currentUser.avatarUrl,
          isAuthenticated: true,
          dndMode: currentUser.dndMode,
          presenceStatus: currentUser.presenceStatus,
        }}
        initialCallMode={activeCallMode}
        onPresenceChange={(st) =>
          setCurrentUser((prev) => (prev ? { ...prev, presenceStatus: st } : prev))
        }
        onLeave={() => {
          setActiveRoomCode(null);
          if (window.location.search) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }}
      />
    );
  }

  const isCustomer = currentUser.accountType === 'customer';
  const isAdmin =
    currentUser.accountType === 'admin' ||
    currentUser.role === 'Super Administrator' ||
    currentUser.role === 'Company Administrator';

  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-x-hidden">
      <Navbar
        currentUser={currentUser}
        notifications={notifications}
        onMarkNotificationRead={(id) => markNotificationRead(id)}
        onNotificationAction={handleNotificationAction}
        onProfileUpdated={(updates) =>
          setCurrentUser((prev) => (prev ? { ...prev, ...updates } : prev))
        }
        onStartInstantMeeting={() => handleStartInstantMeeting('video')}
        onJoinByCode={(code) => handleJoinRoom(code, 'video')}
        onOpenDeviceSettings={() => setShowDeviceSettings(true)}
        onOpenAccountSecurity={() => setShowAccountSecurity(true)}
        onSignOut={handleSignOut}
        currentTheme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onToggleMobileMenu={() => setMobileMenuOpen((s) => !s)}
      />

      {/* DND-Respecting Real-Time Notification / Incoming Call Banner */}
      {toastNotification && !(currentUser.dndMode || currentUser.presenceStatus === 'dnd') && (
        <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-3 sm:left-auto sm:right-5 sm:bottom-5 sm:w-96 z-50 bg-white dark:bg-slate-900 border border-sky-500/40 rounded-2xl shadow-2xl p-3.5 sm:p-4 flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              toastNotification.type === 'call_invite'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 animate-pulse'
                : 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
            }`}
          >
            {toastNotification.type === 'call_invite' ? (
              toastNotification.callMode === 'audio' ? <Phone className="w-5 h-5" /> : <Video className="w-5 h-5" />
            ) : (
              <Bell className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {toastNotification.title}
            </p>
            <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
              {toastNotification.body}
            </p>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                onClick={() => {
                  markNotificationRead(toastNotification.id);
                  handleNotificationAction(toastNotification);
                  setToastNotification(null);
                }}
                className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold"
              >
                {toastNotification.type === 'call_invite' ? 'Answer Call' : 'Open'}
              </button>
              <button
                onClick={() => {
                  markNotificationRead(toastNotification.id);
                  setToastNotification(null);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            onClick={() => setToastNotification(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 flex min-h-0 min-w-0">
        <Sidebar
          currentUser={currentUser}
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          isOpenMobile={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <main className="flex-1 min-w-0 p-3 sm:p-5 lg:p-8 pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto">
          <div className="max-w-7xl mx-auto min-w-0">
            {/* Strictly Isolated Customer Views */}
            {isCustomer ? (
              <>
                {(currentTab === 'customer-home' || currentTab === 'products' || currentTab === 'orders') && (
                  <CustomerPortal
                    mode={currentTab}
                    currentUser={currentUser}
                    products={products}
                    orders={orders}
                    meetings={meetings}
                    onNavigateTab={setCurrentTab}
                    onJoinMeeting={(code) => handleJoinRoom(code, 'video')}
                  />
                )}
                {currentTab === 'meetings' && (
                  <MeetingScheduler
                    currentUser={currentUser}
                    meetings={meetings}
                    directory={directory}
                    onJoinMeeting={handleJoinRoom}
                  />
                )}
                {currentTab === 'messaging' && (
                  <MessagingHub
                    currentUser={currentUser}
                    chats={chats}
                    directory={directory}
                    initialChatId={activeChatId}
                    onStartDirectCall={handleStartDirectCall}
                    onProfileUpdated={(updates) =>
                      setCurrentUser((prev) => (prev ? { ...prev, ...updates } : prev))
                    }
                  />
                )}
                {currentTab === 'sync' && (
                  <SyncCenter
                    currentUser={currentUser}
                    onSyncUpdated={(ts) =>
                      setCurrentUser((u) => (u ? { ...u, lastSyncAt: ts } : u))
                    }
                  />
                )}
              </>
            ) : (
              /* Strictly Employee & Administrator Views */
              <>
                {currentTab === 'dashboard' && (
                  <Dashboard
                    currentUser={currentUser}
                    meetings={meetings}
                    chats={chats}
                    directory={directory}
                    onStartInstantMeeting={() => handleStartInstantMeeting('video')}
                    onJoinMeeting={(code) => handleJoinRoom(code, 'video')}
                    onNavigateTab={setCurrentTab}
                  />
                )}
                {currentTab === 'meetings' && (
                  <MeetingScheduler
                    currentUser={currentUser}
                    meetings={meetings}
                    directory={directory}
                    onJoinMeeting={handleJoinRoom}
                  />
                )}
                {currentTab === 'messaging' && (
                  <MessagingHub
                    currentUser={currentUser}
                    chats={chats}
                    directory={directory}
                    initialChatId={activeChatId}
                    onStartDirectCall={handleStartDirectCall}
                    onProfileUpdated={(updates) =>
                      setCurrentUser((prev) => (prev ? { ...prev, ...updates } : prev))
                    }
                  />
                )}
                {currentTab === 'directory' && (
                  <DirectoryView
                    currentUser={currentUser}
                    directory={directory}
                    onOpenMessaging={(chatId) => {
                      if (chatId) setActiveChatId(chatId);
                      setCurrentTab('messaging');
                    }}
                    onStartDirectCall={handleStartDirectCall}
                    onProfileUpdated={(updates) =>
                      setCurrentUser((prev) => (prev ? { ...prev, ...updates } : prev))
                    }
                  />
                )}
                {(currentTab === 'reports' || currentTab === 'analytics') && (
                  <ReportsAndAnalytics
                    mode={currentTab}
                    currentUser={currentUser}
                    reports={reports}
                    meetings={meetings}
                    attendance={attendance}
                    orders={orders}
                  />
                )}
                {currentTab === 'sync' && (
                  <SyncCenter
                    currentUser={currentUser}
                    onSyncUpdated={(ts) =>
                      setCurrentUser((u) => (u ? { ...u, lastSyncAt: ts } : u))
                    }
                  />
                )}
                {currentTab === 'admin' && isAdmin && (
                  <AdminPanel
                    currentUser={currentUser}
                    products={products}
                    orders={orders}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {showDeviceSettings && (
        <DeviceSettingsModal onClose={() => setShowDeviceSettings(false)} />
      )}
      {showAccountSecurity && (
        <AccountSecurityModal
          currentUser={currentUser}
          directory={directory}
          onClose={() => setShowAccountSecurity(false)}
          onProfileUpdated={(updates) =>
            setCurrentUser((prev) => (prev ? { ...prev, ...updates } : prev))
          }
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
