import React, { useMemo, useState } from 'react';
import {
  MessageSquare,
  Phone,
  Search,
  ShieldBan,
  Star,
  UserCheck,
  UserPlus,
  Users,
  Video,
} from 'lucide-react';
import {
  createChatConversation,
  toggleBlockUser,
  toggleContactUser,
  toggleFavoriteContact,
} from '../services/firestoreService';
import { DirectoryProfile, PresenceStatus, UserPrivateProfile } from '../types';

interface DirectoryViewProps {
  currentUser: UserPrivateProfile;
  directory: DirectoryProfile[];
  onOpenMessaging: (chatId?: string) => void;
  onStartDirectCall: (targetUids: string[], mode: 'audio' | 'video', title?: string) => void;
  onProfileUpdated: (updated: Partial<UserPrivateProfile>) => void;
}

type DirectoryTab = 'all' | 'contacts' | 'favorites' | 'blocked';

const PRESENCE_DOT: Record<PresenceStatus, string> = {
  online: 'bg-emerald-500',
  busy: 'bg-rose-500',
  away: 'bg-amber-400',
  in_meeting: 'bg-sky-500',
  dnd: 'bg-rose-600',
  offline: 'bg-slate-400',
};

const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  online: 'Online',
  busy: 'Busy',
  away: 'Away',
  in_meeting: 'In Meeting',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
};

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  currentUser,
  directory,
  onOpenMessaging,
  onStartDirectCall,
  onProfileUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<DirectoryTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');

  const contactSet = useMemo(() => new Set(currentUser.contactUids || []), [currentUser.contactUids]);
  const favoriteSet = useMemo(() => new Set(currentUser.favoriteUids || []), [currentUser.favoriteUids]);
  const blockedSet = useMemo(() => new Set(currentUser.blockedUids || []), [currentUser.blockedUids]);

  const departments = Array.from(
    new Set(directory.map((d) => d.department).filter(Boolean) as string[])
  );

  const filtered = directory.filter((p) => {
    if (p.uid === currentUser.uid) return false;
    if (activeTab === 'contacts' && !contactSet.has(p.uid)) return false;
    if (activeTab === 'favorites' && !favoriteSet.has(p.uid)) return false;
    if (activeTab === 'blocked' && !blockedSet.has(p.uid)) return false;
    if (activeTab !== 'blocked' && blockedSet.has(p.uid)) return false;

    if (deptFilter !== 'all' && p.department !== deptFilter) return false;
    if (
      searchTerm &&
      !p.displayName.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !(p.role || '').toLowerCase().includes(searchTerm.toLowerCase()) &&
      !(p.statusMessage || '').toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const startDirectMessage = async (target: DirectoryProfile) => {
    const created = await createChatConversation({
      chatScope: currentUser.accountType === 'customer' ? 'customer_dm' : 'employee_dm',
      name: `${currentUser.displayName} & ${target.displayName}`,
      memberUids: [currentUser.uid, target.uid],
    });
    onOpenMessaging(created.id);
  };

  const handleToggleContact = async (uid: string) => {
    const isContact = contactSet.has(uid);
    const next = isContact
      ? (currentUser.contactUids || []).filter((u) => u !== uid)
      : [...(currentUser.contactUids || []), uid];
    onProfileUpdated({ contactUids: next });
    await toggleContactUser(currentUser.uid, uid, !isContact).catch(() => {});
  };

  const handleToggleFavorite = async (uid: string) => {
    const isFav = favoriteSet.has(uid);
    const nextFavs = isFav
      ? (currentUser.favoriteUids || []).filter((u) => u !== uid)
      : [...(currentUser.favoriteUids || []), uid];
    const nextContacts = !isFav && !contactSet.has(uid)
      ? [...(currentUser.contactUids || []), uid]
      : currentUser.contactUids || [];
    onProfileUpdated({ favoriteUids: nextFavs, contactUids: nextContacts });
    await toggleFavoriteContact(currentUser.uid, uid, !isFav).catch(() => {});
  };

  const handleToggleBlock = async (uid: string) => {
    const isBlocked = blockedSet.has(uid);
    const nextBlocked = isBlocked
      ? (currentUser.blockedUids || []).filter((u) => u !== uid)
      : [...(currentUser.blockedUids || []), uid];
    onProfileUpdated({ blockedUids: nextBlocked });
    await toggleBlockUser(currentUser.uid, uid, !isBlocked).catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Contacts, Directory & Presence
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live availability, saved contacts, favorites, 1-click voice/video calls, and block controls
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, role, status..."
              className="w-full sm:w-52 pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Directory Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2">
        {(
          [
            { id: 'all', label: `All Directory (${directory.filter((d) => d.uid !== currentUser.uid && !blockedSet.has(d.uid)).length})` },
            { id: 'contacts', label: `My Contacts (${contactSet.size})` },
            { id: 'favorites', label: `Favorites (${favoriteSet.size})` },
            { id: 'blocked', label: `Blocked Users (${blockedSet.size})` },
          ] as { id: DirectoryTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === tab.id
                ? 'bg-sky-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {activeTab === 'blocked'
              ? 'No blocked users'
              : activeTab === 'favorites'
              ? 'No favorite contacts yet'
              : activeTab === 'contacts'
              ? 'Your contact list is empty'
              : 'No directory members found'}
          </p>
          <p className="text-xs text-slate-500">
            {activeTab === 'contacts' || activeTab === 'favorites'
              ? 'Use the Contact and Star buttons on any directory card to organize your quick-access list.'
              : 'Verified organization profiles update here in real time.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((person) => {
            const presence: PresenceStatus = person.presenceStatus || 'online';
            const isContact = contactSet.has(person.uid);
            const isFav = favoriteSet.has(person.uid);
            const isBlocked = blockedSet.has(person.uid);

            return (
              <div
                key={person.uid}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 min-w-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="relative shrink-0">
                      {person.avatarUrl ? (
                        <img
                          src={person.avatarUrl}
                          alt={person.displayName}
                          className="w-11 h-11 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-sky-600 text-white font-bold text-sm flex items-center justify-center">
                          {person.displayName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${PRESENCE_DOT[presence]}`}
                        title={PRESENCE_LABEL[presence]}
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {person.displayName}
                      </h3>
                      <p className="text-xs text-sky-600 dark:text-sky-400 font-medium truncate">
                        {person.role}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {person.department || 'General'} · {PRESENCE_LABEL[presence]}
                      </p>
                      {person.statusMessage && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 italic truncate mt-1">
                          “{person.statusMessage}”
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Quick Bookmark / Contact / Block icons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!isBlocked && (
                      <>
                        <button
                          onClick={() => handleToggleFavorite(person.uid)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isFav
                              ? 'text-amber-500 bg-amber-500/10'
                              : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
                        >
                          <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-500' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleToggleContact(person.uid)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isContact
                              ? 'text-emerald-600 bg-emerald-500/10'
                              : 'text-slate-400 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title={isContact ? 'In My Contacts (Click to remove)' : 'Save to Contacts'}
                        >
                          {isContact ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleToggleBlock(person.uid)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isBlocked
                          ? 'text-rose-500 bg-rose-500/10'
                          : 'text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title={isBlocked ? 'Unblock User' : 'Block User'}
                    >
                      <ShieldBan className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isBlocked ? (
                  <button
                    onClick={() => handleToggleBlock(person.uid)}
                    className="w-full py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold"
                  >
                    Unblock Contact
                  </button>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() =>
                        onStartDirectCall([person.uid], 'audio', `Voice Call · ${person.displayName}`)
                      }
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-emerald-600/10 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-400 hover:text-white text-xs font-semibold transition-colors"
                      title="Start Voice Call"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Voice</span>
                    </button>
                    <button
                      onClick={() =>
                        onStartDirectCall([person.uid], 'video', `Video Call · ${person.displayName}`)
                      }
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-sky-600/10 hover:bg-sky-600 text-sky-700 dark:text-sky-400 hover:text-white text-xs font-semibold transition-colors"
                      title="Start Video Call"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Video</span>
                    </button>
                    <button
                      onClick={() => startDirectMessage(person)}
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-900 dark:hover:bg-slate-700 hover:text-white text-xs font-semibold transition-colors"
                      title="Send Message"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
