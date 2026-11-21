import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Laptop,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { testFirestoreConnection } from '../lib/firebase';
import { subscribeUserSessions, triggerManualSyncCheck } from '../services/firestoreService';
import { UserPrivateProfile, UserSession } from '../types';

interface SyncCenterProps {
  currentUser: UserPrivateProfile;
  onSyncUpdated: (timestamp: string) => void;
}

export const SyncCenter: React.FC<SyncCenterProps> = ({ currentUser, onSyncUpdated }) => {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [firestoreHealthy, setFirestoreHealthy] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    testFirestoreConnection().then((res) => setFirestoreHealthy(res.ok));
    const unsub = subscribeUserSessions(currentUser.uid, setSessions);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      unsub();
    };
  }, [currentUser.uid]);

  const handleManualResync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const conn = await testFirestoreConnection();
      setFirestoreHealthy(conn.ok);
      const ts = await triggerManualSyncCheck(currentUser.uid);
      onSyncUpdated(ts);
      setSyncMessage('Synchronization verified across Firestore and active devices.');
    } catch (err: any) {
      setSyncMessage(err?.message || 'Synchronization check failed.');
    } finally {
      setSyncing(false);
    }
  };

  const activeSessions = sessions.filter((s) => !s.revoked);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Real-Time Synchronization Center
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live cloud synchronization across your Desktop, Tablet, and Mobile sessions
          </p>
        </div>

        <button
          onClick={handleManualResync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-bold shadow-sm transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Synchronizing...' : 'Manual Re-Sync Now'}</span>
        </button>
      </div>

      {syncMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Network Transport</span>
            {online ? (
              <Wifi className="w-4 h-4 text-emerald-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-rose-500" />
            )}
          </div>
          <p className="text-lg font-extrabold text-slate-900 dark:text-white">
            {online ? 'Connected' : 'Offline Mode'}
          </p>
          <p className="text-[11px] text-slate-500">
            {online ? 'Real-time WebSocket & Firestore listeners active' : 'Changes queued until connection returns'}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Cloud Database Sync</span>
            <Cloud className="w-4 h-4 text-sky-500" />
          </div>
          <p className="text-lg font-extrabold text-slate-900 dark:text-white">
            {firestoreHealthy === false ? 'Connection Issue' : 'Synchronized'}
          </p>
          <p className="text-[11px] text-slate-500 tabular-nums">
            Last sync: {currentUser.lastSyncAt ? new Date(currentUser.lastSyncAt).toLocaleString() : 'Live'}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Active Signed-In Devices</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
            {activeSessions.length}
          </p>
          <p className="text-[11px] text-slate-500">Verified sessions on this account</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Connected Devices</h3>
        {activeSessions.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No active device sessions logged yet.</p>
        ) : (
          <div className="space-y-2">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Laptop className="w-4 h-4 text-sky-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                      {session.platform} · {session.authMethod}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{session.deviceName}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">
                  Active
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
