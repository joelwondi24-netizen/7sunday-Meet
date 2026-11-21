import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Fingerprint,
  Laptop,
  Shield,
  ShieldBan,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import {
  registerBiometricPasskey,
  revokeUserSession,
  subscribeUserSessions,
  toggleBlockUser,
  updateOwnProfile,
} from '../services/firestoreService';
import { DirectoryProfile, PresenceStatus, UserPrivateProfile, UserSession } from '../types';

interface AccountSecurityModalProps {
  currentUser: UserPrivateProfile;
  directory?: DirectoryProfile[];
  onClose: () => void;
  onProfileUpdated: (updated: Partial<UserPrivateProfile>) => void;
}

export const AccountSecurityModal: React.FC<AccountSecurityModalProps> = ({
  currentUser,
  directory = [],
  onClose,
  onProfileUpdated,
}) => {
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [department, setDepartment] = useState(currentUser.department || '');
  const [jobTitle, setJobTitle] = useState(currentUser.jobTitle || '');
  const [statusMessage, setStatusMessage] = useState(currentUser.statusMessage || '');
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>(
    currentUser.presenceStatus || 'online'
  );
  const [dndMode, setDndMode] = useState(Boolean(currentUser.dndMode));
  const [mfaEnabled, setMfaEnabled] = useState(Boolean(currentUser.mfaEnabled));
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || '');

  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeUserSessions(currentUser.uid, setSessions);
    return () => unsub();
  }, [currentUser.uid]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const uploaded = await api.uploadFile(file, file.name);
      setAvatarUrl(uploaded.url);
      await updateOwnProfile(currentUser.uid, { avatarUrl: uploaded.url });
      onProfileUpdated({ avatarUrl: uploaded.url });
      setStatusMsg('Profile photo updated.');
    } catch (err: any) {
      setStatusMsg(err?.message || 'Upload failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      const updates: Partial<UserPrivateProfile> = {
        displayName,
        phone,
        department,
        jobTitle,
        statusMessage,
        presenceStatus: dndMode ? 'dnd' : presenceStatus,
        dndMode,
        mfaEnabled,
      };
      await updateOwnProfile(currentUser.uid, updates);
      onProfileUpdated(updates);
      setStatusMsg('Profile & security settings saved.');
    } catch (err: any) {
      setStatusMsg(err?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleEnrollBiometric = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      await registerBiometricPasskey(currentUser.uid, currentUser.email, currentUser.displayName);
      onProfileUpdated({ biometricEnabled: true });
      setStatusMsg('Device Biometric / Passkey (Fingerprint / Face ID) enrolled.');
    } catch (err: any) {
      setStatusMsg(err?.message || 'Biometric enrollment unavailable on this device.');
    } finally {
      setSaving(false);
    }
  };

  const blockedUids = currentUser.blockedUids || [];

  const handleUnblock = async (targetUid: string) => {
    await toggleBlockUser(currentUser.uid, targetUid, false);
    onProfileUpdated({
      blockedUids: blockedUids.filter((u) => u !== targetUid),
    });
    setStatusMsg('User unblocked.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[92dvh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl space-y-5 sm:space-y-6 my-auto">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <Shield className="w-5 h-5 text-sky-500 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">Account, Availability & Security</h3>
              <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusMsg && (
          <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-700 dark:text-sky-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-sky-600 text-white font-bold text-lg flex items-center justify-center">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-white">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Photo</span>
              <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Full Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            {currentUser.accountType !== 'customer' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Job Title</label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Availability Status Message
            </label>
            <input
              type="text"
              maxLength={160}
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              placeholder="e.g. Available for client calls, or On factory floor"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Presence</label>
              <select
                value={presenceStatus}
                onChange={(e) => setPresenceStatus(e.target.value as PresenceStatus)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-medium"
              >
                <option value="online">Online</option>
                <option value="busy">Busy</option>
                <option value="in_meeting">In Meeting</option>
                <option value="away">Away</option>
                <option value="dnd">Do Not Disturb</option>
              </select>
            </div>

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold cursor-pointer">
              <span>Do Not Disturb</span>
              <input type="checkbox" checked={dndMode} onChange={(e) => setDndMode(e.target.checked)} />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold cursor-pointer">
              <span>MFA Protection</span>
              <input type="checkbox" checked={mfaEnabled} onChange={(e) => setMfaEnabled(e.target.checked)} />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleEnrollBiometric}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-600/20"
            >
              <Fingerprint className="w-4 h-4" />
              <span>
                {currentUser.biometricEnabled ? 'Re-enroll Biometric / Face ID' : 'Enable Fingerprint / Face ID'}
              </span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Blocked Users Management */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <ShieldBan className="w-3.5 h-3.5 text-rose-500" />
            <span>Blocked Users ({blockedUids.length})</span>
          </h4>
          {blockedUids.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">No blocked users.</p>
          ) : (
            <div className="space-y-2 max-h-36 overflow-y-auto">
              {blockedUids.map((bUid) => {
                const match = directory.find((d) => d.uid === bUid);
                return (
                  <div
                    key={bUid}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {match?.displayName || bUid}
                      </p>
                      <p className="text-[11px] text-slate-500">{match?.role || 'Blocked Contact'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnblock(bUid)}
                      className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-[11px] font-bold"
                    >
                      Unblock
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Device Sessions & Login History */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Active Sessions & Login History ({sessions.length})
          </h4>
          <div className="max-h-44 overflow-y-auto space-y-2">
            {sessions.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">No recorded sessions yet.</p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Laptop className="w-4 h-4 text-sky-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {s.platform} · {s.authMethod}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{s.deviceName}</p>
                    </div>
                  </div>
                  {s.revoked ? (
                    <span className="text-[11px] font-semibold text-rose-500 shrink-0">Revoked</span>
                  ) : (
                    <button
                      onClick={() => revokeUserSession(currentUser.uid, s.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 text-[11px] font-semibold shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Revoke</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
