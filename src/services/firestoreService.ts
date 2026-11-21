import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { auth, BOOTSTRAP_ADMIN_EMAIL, CORPORATE_EMAIL_DOMAIN, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import {
  AccountStatus,
  AccountType,
  AuditLog,
  ChatConversation,
  ChatMessage,
  ChatScope,
  CustomRole,
  CustomerOrder,
  Department,
  DirectoryProfile,
  IntegrationConfig,
  Meeting,
  MeetingAttendance,
  MeetingScope,
  MeetingTranscriptEntry,
  ModerationReason,
  ModerationReport,
  NotificationItem,
  OrderStatus,
  PresenceStatus,
  Product,
  ReportEntry,
  ScheduledMessage,
  UserPrivateProfile,
  UserRole,
  UserSession,
} from '../types';

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 128);
  return cleaned || `id-${Date.now()}`;
}

export function clampStr(val: string | undefined, max: number): string {
  return (val || '').trim().slice(0, max);
}

export function makeId(prefix: string): string {
  return sanitizeId(`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

// ---------------------------------------------------------------------------
// Account Bootstrapping & Profile Sync
// ---------------------------------------------------------------------------
export async function getUserProfile(uid: string): Promise<UserPrivateProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserPrivateProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function provisionOwnProfile(
  fbUser: FirebaseUser,
  portalChoice: 'employee' | 'customer' | 'admin',
  extras?: { displayName?: string; phone?: string; department?: string; jobTitle?: string }
): Promise<UserPrivateProfile> {
  const uid = fbUser.uid;
  const email = (fbUser.email || '').toLowerCase();
  const isBootstrap = email === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

  // Check if profile already exists
  const existing = await getUserProfile(uid);
  if (existing) {
    // Enforce portal isolation unless bootstrap admin
    if (!isBootstrap) {
      if (portalChoice === 'customer' && existing.accountType !== 'customer') {
        throw new Error('This account is registered as a corporate Employee/Admin account. Please use the Employee or Administrator sign-in portal.');
      }
      if ((portalChoice === 'employee' || portalChoice === 'admin') && existing.accountType === 'customer') {
        throw new Error('Customer accounts cannot access the Employee or Administration portal. Please use the Customer Portal.');
      }
    }
    return existing;
  }

  let accountType: AccountType = 'customer';
  let role: UserRole = 'Customer';

  if (isBootstrap) {
    accountType = 'admin';
    role = 'Super Administrator';
  } else if (portalChoice === 'employee') {
    if (!email.endsWith(`@${CORPORATE_EMAIL_DOMAIN}`)) {
      throw new Error(
        `Self-service Employee registration requires a verified @${CORPORATE_EMAIL_DOMAIN} corporate Google or email account. External accounts may register via the Customer Portal or be provisioned by a Super Administrator.`
      );
    }
    accountType = 'employee';
    role = 'Employee';
  } else if (portalChoice === 'admin') {
    throw new Error(
      'Administrator access must be granted to an existing Employee account by the Super Administrator.'
    );
  }

  const displayName = clampStr(extras?.displayName || fbUser.displayName || email.split('@')[0], 120);
  const avatarUrl = clampStr(fbUser.photoURL || '', 500);
  const phone = clampStr(extras?.phone || fbUser.phoneNumber || '', 40);
  const department = clampStr(extras?.department || (accountType === 'customer' ? 'Customer' : 'General'), 100);
  const jobTitle = clampStr(extras?.jobTitle || (accountType === 'customer' ? 'Valued Customer' : role), 100);

  const privateDoc: UserPrivateProfile = {
    uid,
    email: clampStr(email, 200),
    phone,
    displayName,
    accountType,
    role,
    status: 'active',
    department,
    jobTitle,
    avatarUrl,
    mfaEnabled: false,
    biometricEnabled: false,
    dndMode: false,
    presenceStatus: 'online',
    statusMessage: '',
    blockedUids: [],
    contactUids: [],
    favoriteUids: [],
    lastSyncAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const directoryDoc: DirectoryProfile = {
    uid,
    displayName,
    accountType,
    role,
    department,
    jobTitle,
    avatarUrl,
    presenceStatus: 'online',
    statusMessage: '',
    status: 'active',
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', uid), privateDoc);
    await setDoc(doc(db, 'directory_profiles', uid), directoryDoc);
    if (isBootstrap) {
      await setDoc(doc(db, 'admins', uid), {
        uid,
        email: clampStr(email, 200),
        role: 'Super Administrator',
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }

  await recordUserSession(uid, fbUser.providerData[0]?.providerId || 'password');
  return (await getUserProfile(uid)) || privateDoc;
}

export async function updateOwnProfile(
  uid: string,
  updates: Partial<
    Pick<
      UserPrivateProfile,
      | 'displayName'
      | 'phone'
      | 'department'
      | 'jobTitle'
      | 'avatarUrl'
      | 'mfaEnabled'
      | 'biometricEnabled'
      | 'dndMode'
      | 'presenceStatus'
      | 'statusMessage'
    >
  >
) {
  try {
    const cleanPrivate: Record<string, any> = {
      updatedAt: serverTimestamp(),
      lastSyncAt: new Date().toISOString(),
    };
    const cleanDir: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (updates.displayName !== undefined) {
      cleanPrivate.displayName = clampStr(updates.displayName, 120);
      cleanDir.displayName = cleanPrivate.displayName;
    }
    if (updates.phone !== undefined) cleanPrivate.phone = clampStr(updates.phone, 40);
    if (updates.department !== undefined) {
      cleanPrivate.department = clampStr(updates.department, 100);
      cleanDir.department = cleanPrivate.department;
    }
    if (updates.jobTitle !== undefined) {
      cleanPrivate.jobTitle = clampStr(updates.jobTitle, 100);
      cleanDir.jobTitle = cleanPrivate.jobTitle;
    }
    if (updates.avatarUrl !== undefined) {
      cleanPrivate.avatarUrl = clampStr(updates.avatarUrl, 500);
      cleanDir.avatarUrl = cleanPrivate.avatarUrl;
    }
    if (updates.mfaEnabled !== undefined) cleanPrivate.mfaEnabled = updates.mfaEnabled;
    if (updates.biometricEnabled !== undefined) cleanPrivate.biometricEnabled = updates.biometricEnabled;
    if (updates.dndMode !== undefined) cleanPrivate.dndMode = updates.dndMode;
    if (updates.presenceStatus !== undefined) {
      cleanPrivate.presenceStatus = updates.presenceStatus;
      cleanDir.presenceStatus = updates.presenceStatus;
    }
    if (updates.statusMessage !== undefined) {
      cleanPrivate.statusMessage = clampStr(updates.statusMessage, 160);
      cleanDir.statusMessage = cleanPrivate.statusMessage;
    }

    await updateDoc(doc(db, 'users', uid), cleanPrivate);
    await updateDoc(doc(db, 'directory_profiles', uid), cleanDir);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function toggleBlockUser(ownUid: string, targetUid: string, block: boolean) {
  try {
    await updateDoc(doc(db, 'users', ownUid), {
      blockedUids: block ? arrayUnion(targetUid) : arrayRemove(targetUid),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${ownUid}`);
  }
}

export async function toggleContactUser(ownUid: string, targetUid: string, add: boolean) {
  try {
    await updateDoc(doc(db, 'users', ownUid), {
      contactUids: add ? arrayUnion(targetUid) : arrayRemove(targetUid),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${ownUid}`);
  }
}

export async function toggleFavoriteContact(ownUid: string, targetUid: string, fav: boolean) {
  try {
    const clean: Record<string, any> = {
      favoriteUids: fav ? arrayUnion(targetUid) : arrayRemove(targetUid),
      updatedAt: serverTimestamp(),
    };
    if (fav) {
      clean.contactUids = arrayUnion(targetUid);
    }
    await updateDoc(doc(db, 'users', ownUid), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${ownUid}`);
  }
}

// ---------------------------------------------------------------------------
// Sessions, Devices & Biometric WebAuthn
// ---------------------------------------------------------------------------
export async function recordUserSession(uid: string, authMethod: string) {
  const sessionId = makeId('sess');
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Client';
  const platform = typeof navigator !== 'undefined' ? navigator.platform || 'Browser' : 'Browser';
  try {
    await setDoc(doc(db, 'users', uid, 'sessions', sessionId), {
      id: sessionId,
      uid,
      deviceName: clampStr(ua.slice(0, 120), 160),
      platform: clampStr(platform, 80),
      authMethod: clampStr(authMethod, 80),
      revoked: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/sessions/${sessionId}`);
  }
}

export function subscribeUserSessions(uid: string, cb: (sessions: UserSession[]) => void) {
  const path = `users/${uid}/sessions`;
  const q = query(collection(db, 'users', uid, 'sessions'), orderBy('createdAt', 'desc'), limit(25));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as UserSession)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function revokeUserSession(uid: string, sessionId: string) {
  try {
    await updateDoc(doc(db, 'users', uid, 'sessions', sessionId), { revoked: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/sessions/${sessionId}`);
  }
}

export async function registerBiometricPasskey(uid: string, email: string, displayName: string): Promise<boolean> {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('WebAuthn Biometric Authentication is not supported on this browser/device.');
  }
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: '7Sunday Meet' },
      user: {
        id: new TextEncoder().encode(uid),
        name: email,
        displayName,
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
      authenticatorSelection: { userVerification: 'preferred' },
      timeout: 60000,
    },
  });
  if (cred) {
    await updateOwnProfile(uid, { biometricEnabled: true });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Directory Subscriptions (Strictly Scoped!)
// ---------------------------------------------------------------------------
export function subscribeDirectoryProfiles(
  callerAccountType: AccountType,
  cb: (profiles: DirectoryProfile[]) => void
) {
  const path = 'directory_profiles';
  if (callerAccountType === 'customer') {
    // Customers ONLY read other customers and Customer Service Agents
    let customerList: DirectoryProfile[] = [];
    let agentList: DirectoryProfile[] = [];
    const emit = () => {
      const merged = new Map<string, DirectoryProfile>();
      [...customerList, ...agentList].forEach((p) => merged.set(p.uid, p));
      cb(Array.from(merged.values()));
    };

    const unsub1 = onSnapshot(
      query(collection(db, path), where('accountType', '==', 'customer'), limit(100)),
      (snap) => {
        customerList = snap.docs.map((d) => d.data() as DirectoryProfile);
        emit();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    const unsub2 = onSnapshot(
      query(collection(db, path), where('role', '==', 'Customer Service Agent'), limit(50)),
      (snap) => {
        agentList = snap.docs.map((d) => d.data() as DirectoryProfile);
        emit();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => {
      unsub1();
      unsub2();
    };
  }

  return onSnapshot(
    query(collection(db, path), limit(200)),
    (snap) => cb(snap.docs.map((d) => d.data() as DirectoryProfile)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

// ---------------------------------------------------------------------------
// Meetings & Conflict Detection & Attendance
// ---------------------------------------------------------------------------
export function detectMeetingConflicts(
  candidateStartIso: string,
  candidateEndIso: string,
  existingMeetings: Meeting[],
  excludeMeetingId?: string
): Meeting[] {
  const start = new Date(candidateStartIso).getTime();
  const end = new Date(candidateEndIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return [];
  return existingMeetings.filter((m) => {
    if (m.id === excludeMeetingId) return false;
    if (m.status === 'ended' || m.status === 'cancelled') return false;
    const mStart = new Date(m.scheduledStart).getTime();
    const mEnd = new Date(m.scheduledEnd).getTime();
    return start < mEnd && end > mStart;
  });
}

export function subscribeMeetings(user: UserPrivateProfile, cb: (meetings: Meeting[]) => void) {
  const path = 'meetings';
  if (user.accountType === 'customer') {
    let hosted: Meeting[] = [];
    let invited: Meeting[] = [];
    const emit = () => {
      const map = new Map<string, Meeting>();
      [...hosted, ...invited].forEach((m) => map.set(m.id, m));
      cb(
        Array.from(map.values()).sort(
          (a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime()
        )
      );
    };
    const u1 = onSnapshot(
      query(collection(db, path), where('hostUid', '==', user.uid), limit(100)),
      (snap) => {
        hosted = snap.docs.map((d) => d.data() as Meeting);
        emit();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    const u2 = onSnapshot(
      query(collection(db, path), where('participantUids', 'array-contains', user.uid), limit(100)),
      (snap) => {
        invited = snap.docs.map((d) => d.data() as Meeting);
        emit();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => {
      u1();
      u2();
    };
  }

  return onSnapshot(
    query(collection(db, path), orderBy('scheduledStart', 'desc'), limit(200)),
    (snap) => cb(snap.docs.map((d) => d.data() as Meeting)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createMeetingDoc(
  user: UserPrivateProfile,
  input: Omit<Meeting, 'id' | 'code' | 'hostUid' | 'hostName' | 'createdAt' | 'updatedAt'> & { code?: string }
): Promise<Meeting> {
  const id = makeId('mtg');
  const r1 = Math.floor(100 + Math.random() * 900);
  const r2 = Math.floor(100 + Math.random() * 900);
  const code = sanitizeId(input.code || `7sm-${r1}-${r2}`).slice(0, 64);

  const safeScope = user.accountType === 'customer' && input.meetingScope === 'internal' ? 'customer' : input.meetingScope;

  const payload: Meeting = {
    id,
    code,
    title: clampStr(input.title, 200) || '7Sunday Meet Session',
    description: clampStr(input.description, 2000),
    agenda: clampStr(input.agenda, 4000),
    meetingScope: safeScope,
    type: input.type,
    callMode: input.callMode || 'video',
    capacity: typeof input.capacity === 'number' ? Math.max(2, Math.min(1000, Math.round(input.capacity))) : 50,
    isPermanentRoom: Boolean(input.isPermanentRoom || input.type === 'conference_room' || input.type === 'virtual_room'),
    priority: input.priority || 'normal',
    status: input.status || (input.type === 'instant' ? 'live' : 'waiting'),
    hostUid: user.uid,
    hostName: clampStr(user.displayName, 120),
    organizerUid: sanitizeId(input.organizerUid || user.uid),
    moderatorUids: (input.moderatorUids || []).slice(0, 20),
    department: clampStr(input.department || user.department || '', 100),
    scheduledStart: clampStr(input.scheduledStart, 64),
    scheduledEnd: clampStr(input.scheduledEnd, 64),
    timezone: clampStr(input.timezone || 'Africa/Addis_Ababa', 80),
    recurrenceRule: input.recurrenceRule || 'none',
    waitingRoomEnabled: Boolean(input.waitingRoomEnabled),
    isLocked: Boolean(input.isLocked),
    hasPassword: Boolean(input.hasPassword),
    allowScreenShare: input.allowScreenShare ?? true,
    allowChat: input.allowChat ?? true,
    allowWhiteboard: input.allowWhiteboard ?? true,
    recordingConsentRequired: input.recordingConsentRequired ?? true,
    participantUids: Array.from(new Set([user.uid, ...(input.participantUids || [])])).slice(0, 100),
    invitedEmails: (input.invitedEmails || []).map((e) => clampStr(e, 180)).filter(Boolean).slice(0, 100),
    documentUrls: (input.documentUrls || []).slice(0, 25),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'meetings', id), payload);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `meetings/${id}`);
  }
}

export async function updateMeetingDoc(meetingId: string, updates: Partial<Meeting>) {
  try {
    const clean: Record<string, any> = { updatedAt: serverTimestamp() };
    if (updates.title !== undefined) clean.title = clampStr(updates.title, 200);
    if (updates.description !== undefined) clean.description = clampStr(updates.description, 2000);
    if (updates.agenda !== undefined) clean.agenda = clampStr(updates.agenda, 4000);
    if (updates.priority !== undefined) clean.priority = updates.priority;
    if (updates.status !== undefined) clean.status = updates.status;
    if (updates.callMode !== undefined) clean.callMode = updates.callMode;
    if (updates.capacity !== undefined) clean.capacity = Math.max(2, Math.min(1000, Math.round(updates.capacity)));
    if (updates.scheduledStart !== undefined) clean.scheduledStart = clampStr(updates.scheduledStart, 64);
    if (updates.scheduledEnd !== undefined) clean.scheduledEnd = clampStr(updates.scheduledEnd, 64);
    if (updates.isLocked !== undefined) clean.isLocked = Boolean(updates.isLocked);
    if (updates.waitingRoomEnabled !== undefined) clean.waitingRoomEnabled = Boolean(updates.waitingRoomEnabled);
    if (updates.participantUids !== undefined) clean.participantUids = updates.participantUids.slice(0, 100);
    if (updates.invitedEmails !== undefined) clean.invitedEmails = updates.invitedEmails.slice(0, 100);
    if (updates.documentUrls !== undefined) clean.documentUrls = updates.documentUrls.slice(0, 25);
    await updateDoc(doc(db, 'meetings', meetingId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `meetings/${meetingId}`);
  }
}

export async function deleteMeetingDoc(meetingId: string) {
  try {
    await deleteDoc(doc(db, 'meetings', meetingId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `meetings/${meetingId}`);
  }
}

export async function recordMeetingAttendanceJoin(
  meetingId: string,
  meetingCode: string,
  meetingTitle: string,
  user: { uid: string; name: string; role: string }
): Promise<string> {
  const id = makeId('att');
  try {
    await setDoc(doc(db, 'meeting_attendance', id), {
      id,
      meetingId: sanitizeId(meetingId),
      meetingCode: clampStr(meetingCode, 64),
      meetingTitle: clampStr(meetingTitle, 200),
      participantUid: sanitizeId(user.uid),
      participantName: clampStr(user.name, 120),
      participantRole: clampStr(user.role, 64),
      joinedAt: new Date().toISOString(),
      leftAt: '',
      durationSeconds: 0,
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `meeting_attendance/${id}`);
  }
}

export async function recordMeetingAttendanceLeave(attendanceId: string, durationSeconds: number) {
  try {
    await updateDoc(doc(db, 'meeting_attendance', attendanceId), {
      leftAt: new Date().toISOString(),
      durationSeconds: Math.max(0, Math.round(durationSeconds)),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `meeting_attendance/${attendanceId}`);
  }
}

export function subscribeMeetingAttendance(user: UserPrivateProfile, cb: (records: MeetingAttendance[]) => void) {
  const path = 'meeting_attendance';
  const q =
    user.accountType === 'customer'
      ? query(collection(db, path), where('participantUid', '==', user.uid), limit(100))
      : query(collection(db, path), orderBy('createdAt', 'desc'), limit(200));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as MeetingAttendance)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

// ---------------------------------------------------------------------------
// Scoped Chats & Messages
// ---------------------------------------------------------------------------
export function subscribeChats(user: UserPrivateProfile, cb: (chats: ChatConversation[]) => void) {
  const path = 'chats';
  if (user.accountType === 'customer') {
    let dmAndSupport: ChatConversation[] = [];
    let community: ChatConversation[] = [];
    const emit = () => {
      const map = new Map<string, ChatConversation>();
      [...dmAndSupport, ...community].forEach((c) => map.set(c.id, c));
      cb(Array.from(map.values()));
    };
    const u1 = onSnapshot(
      query(collection(db, path), where('memberUids', 'array-contains', user.uid), limit(100)),
      (snap) => {
        dmAndSupport = snap.docs
          .map((d) => d.data() as ChatConversation)
          .filter((c) => c.chatScope === 'customer_dm' || c.chatScope === 'support' || c.chatScope === 'customer_community');
        emit();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    const u2 = onSnapshot(
      query(collection(db, path), where('chatScope', '==', 'customer_community'), limit(25)),
      (snap) => {
        community = snap.docs.map((d) => d.data() as ChatConversation);
        emit();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => {
      u1();
      u2();
    };
  }

  // Employees & Support Agents
  let memberChats: ChatConversation[] = [];
  let supportQueue: ChatConversation[] = [];
  const isSupportCapable =
    user.accountType === 'admin' ||
    user.role === 'Super Administrator' ||
    user.role === 'Company Administrator' ||
    user.role === 'Customer Service Agent';

  const emit = () => {
    const map = new Map<string, ChatConversation>();
    [...memberChats, ...supportQueue].forEach((c) => map.set(c.id, c));
    cb(Array.from(map.values()));
  };

  const u1 = onSnapshot(
    query(collection(db, path), where('memberUids', 'array-contains', user.uid), limit(100)),
    (snap) => {
      memberChats = snap.docs.map((d) => d.data() as ChatConversation);
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );

  let u2 = () => {};
  if (isSupportCapable) {
    u2 = onSnapshot(
      query(collection(db, path), where('chatScope', '==', 'support'), limit(100)),
      (snap) => {
        supportQueue = snap.docs.map((d) => d.data() as ChatConversation);
        emit();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
  }
  return () => {
    u1();
    u2();
  };
}

export async function createChatConversation(params: {
  chatScope: ChatScope;
  name?: string;
  description?: string;
  memberUids: string[];
  adminUids?: string[];
  orderId?: string;
}): Promise<ChatConversation> {
  const id = makeId('chat');
  const payload: ChatConversation = {
    id,
    chatScope: params.chatScope,
    name: clampStr(params.name, 150),
    description: clampStr(params.description, 500),
    memberUids: Array.from(new Set(params.memberUids.map(sanitizeId))).slice(0, 100),
    adminUids: (params.adminUids || []).map(sanitizeId).slice(0, 25),
    orderId: params.orderId ? sanitizeId(params.orderId) : undefined,
    lastMessage: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (!payload.orderId) delete payload.orderId;

  try {
    await setDoc(doc(db, 'chats', id), payload);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${id}`);
  }
}

export async function updateChatMembership(
  chatId: string,
  updates: Partial<Pick<ChatConversation, 'name' | 'description' | 'memberUids' | 'adminUids' | 'assignedAgentUid'>>
) {
  try {
    const clean: Record<string, any> = { updatedAt: serverTimestamp() };
    if (updates.name !== undefined) clean.name = clampStr(updates.name, 150);
    if (updates.description !== undefined) clean.description = clampStr(updates.description, 500);
    if (updates.memberUids !== undefined) clean.memberUids = updates.memberUids.slice(0, 100);
    if (updates.adminUids !== undefined) clean.adminUids = updates.adminUids.slice(0, 25);
    if (updates.assignedAgentUid !== undefined) clean.assignedAgentUid = sanitizeId(updates.assignedAgentUid);
    await updateDoc(doc(db, 'chats', chatId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export function subscribeChatMessages(chatId: string, cb: (messages: ChatMessage[]) => void) {
  const path = `chats/${chatId}/messages`;
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limit(250));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as ChatMessage)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function sendChatMessage(
  chatId: string,
  user: UserPrivateProfile,
  input: {
    content: string;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentType?: string;
    attachmentSizeBytes?: number;
    replyToId?: string;
    replyToPreview?: string;
    forwardedFrom?: string;
    voiceNoteUrl?: string;
    voiceNoteDurationSec?: number;
    recipientUids?: string[];
  }
) {
  const msgId = makeId('msg');
  const payload: Record<string, any> = {
    id: msgId,
    senderUid: user.uid,
    senderName: clampStr(user.displayName, 120),
    senderAccountType: user.accountType,
    content: clampStr(input.content, 4000),
    edited: false,
    deleted: false,
    moderated: false,
    pinned: false,
    bookmarkedByUids: [],
    reportedByUids: [],
    readByUids: [user.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.attachmentUrl) payload.attachmentUrl = clampStr(input.attachmentUrl, 600);
  if (input.attachmentName) payload.attachmentName = clampStr(input.attachmentName, 200);
  if (input.attachmentType) payload.attachmentType = clampStr(input.attachmentType, 100);
  if (typeof input.attachmentSizeBytes === 'number' && input.attachmentSizeBytes >= 0) {
    payload.attachmentSizeBytes = Math.round(input.attachmentSizeBytes);
  }
  if (input.replyToId) payload.replyToId = sanitizeId(input.replyToId);
  if (input.replyToPreview) payload.replyToPreview = clampStr(input.replyToPreview, 300);
  if (input.forwardedFrom) payload.forwardedFrom = clampStr(input.forwardedFrom, 120);
  if (input.voiceNoteUrl) payload.voiceNoteUrl = clampStr(input.voiceNoteUrl, 600);
  if (typeof input.voiceNoteDurationSec === 'number') payload.voiceNoteDurationSec = input.voiceNoteDurationSec;

  try {
    await setDoc(doc(db, 'chats', chatId, 'messages', msgId), payload);
    const summary = input.voiceNoteUrl
      ? 'Voice note'
      : input.attachmentName
      ? `Attachment: ${input.attachmentName}`
      : input.content;
    await updateDoc(doc(db, 'chats', chatId), {
      lastMessage: clampStr(summary, 500),
      updatedAt: serverTimestamp(),
    });

    const blockedSet = new Set(user.blockedUids || []);
    const notifyTargets = (input.recipientUids || [])
      .filter((uid) => uid && uid !== user.uid && !blockedSet.has(uid))
      .slice(0, 15);
    for (const targetUid of notifyTargets) {
      createNotification(targetUid, {
        senderUid: user.uid,
        type: 'message',
        title: `New message from ${user.displayName}`,
        body: clampStr(summary, 240),
        link: `/?tab=messaging&chat=${chatId}`,
      }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}/messages/${msgId}`);
  }
}

export async function updateChatMessage(
  chatId: string,
  msgId: string,
  updates: {
    content?: string;
    edited?: boolean;
    deleted?: boolean;
    pinned?: boolean;
    bookmarkUid?: string;
    unbookmarkUid?: string;
    reportUid?: string;
    readUid?: string;
  }
) {
  try {
    const clean: Record<string, any> = { updatedAt: serverTimestamp() };
    if (updates.content !== undefined) clean.content = clampStr(updates.content, 4000);
    if (updates.edited !== undefined) clean.edited = updates.edited;
    if (updates.deleted !== undefined) clean.deleted = updates.deleted;
    if (updates.pinned !== undefined) clean.pinned = updates.pinned;
    if (updates.bookmarkUid) clean.bookmarkedByUids = arrayUnion(updates.bookmarkUid);
    if (updates.unbookmarkUid) clean.bookmarkedByUids = arrayRemove(updates.unbookmarkUid);
    if (updates.reportUid) clean.reportedByUids = arrayUnion(updates.reportUid);
    if (updates.readUid) clean.readByUids = arrayUnion(updates.readUid);
    await updateDoc(doc(db, 'chats', chatId, 'messages', msgId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${msgId}`);
  }
}

// ---------------------------------------------------------------------------
// Scheduled Messages
// ---------------------------------------------------------------------------
export function subscribeScheduledMessages(
  chatId: string,
  senderUid: string,
  cb: (items: ScheduledMessage[]) => void
) {
  const path = `chats/${chatId}/scheduled_messages`;
  const q = query(
    collection(db, 'chats', chatId, 'scheduled_messages'),
    where('senderUid', '==', senderUid),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as ScheduledMessage)
        .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
      cb(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createScheduledMessage(
  chatId: string,
  user: UserPrivateProfile,
  content: string,
  scheduledForIso: string
): Promise<ScheduledMessage> {
  const schedId = makeId('sch');
  const payload: ScheduledMessage = {
    id: schedId,
    chatId: sanitizeId(chatId),
    senderUid: user.uid,
    senderName: clampStr(user.displayName, 120),
    content: clampStr(content, 4000),
    scheduledFor: clampStr(scheduledForIso, 64),
    status: 'scheduled',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'chats', chatId, 'scheduled_messages', schedId), payload);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}/scheduled_messages/${schedId}`);
  }
}

export async function updateScheduledMessageStatus(
  chatId: string,
  schedId: string,
  status: 'sent' | 'cancelled'
) {
  try {
    await updateDoc(doc(db, 'chats', chatId, 'scheduled_messages', schedId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/scheduled_messages/${schedId}`);
  }
}

export async function deleteScheduledMessage(chatId: string, schedId: string) {
  try {
    await deleteDoc(doc(db, 'chats', chatId, 'scheduled_messages', schedId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/scheduled_messages/${schedId}`);
  }
}

export async function deliverDueScheduledMessages(
  chatId: string,
  user: UserPrivateProfile,
  scheduledItems: ScheduledMessage[],
  recipientUids?: string[]
) {
  const now = Date.now();
  const due = scheduledItems.filter(
    (s) => s.status === 'scheduled' && s.senderUid === user.uid && new Date(s.scheduledFor).getTime() <= now
  );
  for (const item of due) {
    await updateScheduledMessageStatus(chatId, item.id, 'sent');
    await sendChatMessage(chatId, user, {
      content: item.content,
      recipientUids,
    });
  }
}

// ---------------------------------------------------------------------------
// Spam Reporting & Message Moderation
// ---------------------------------------------------------------------------
export async function submitModerationReport(
  chatId: string,
  msg: ChatMessage,
  reporter: UserPrivateProfile,
  reason: ModerationReason,
  details?: string
) {
  const reportId = makeId('mod');
  const payload: Record<string, any> = {
    id: reportId,
    chatId: sanitizeId(chatId),
    messageId: sanitizeId(msg.id),
    messageContent: clampStr(msg.content || msg.attachmentName || 'Message attachment', 1000),
    reportedUid: sanitizeId(msg.senderUid),
    reportedName: clampStr(msg.senderName, 120),
    reporterUid: reporter.uid,
    reporterName: clampStr(reporter.displayName, 120),
    reason,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (details && details.trim()) {
    payload.details = clampStr(details, 500);
  }
  try {
    await setDoc(doc(db, 'moderation_reports', reportId), payload);
    await updateChatMessage(chatId, msg.id, { reportUid: reporter.uid }).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `moderation_reports/${reportId}`);
  }
}

export function subscribeModerationReports(
  user: UserPrivateProfile,
  cb: (reports: ModerationReport[]) => void
) {
  const path = 'moderation_reports';
  const isMod =
    user.accountType === 'admin' ||
    [
      'Super Administrator',
      'Company Administrator',
      'Customer Service Agent',
      'Meeting Moderator',
      'Meeting Administrator',
      'HR Manager',
    ].includes(user.role);

  const q = isMod
    ? query(collection(db, path), orderBy('createdAt', 'desc'), limit(200))
    : query(collection(db, path), where('reporterUid', '==', user.uid), limit(50));

  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as ModerationReport)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function moderateReportedMessage(
  moderator: UserPrivateProfile,
  report: ModerationReport,
  action: 'removed' | 'dismissed',
  resolutionNote?: string
) {
  const note = clampStr(resolutionNote || (action === 'removed' ? `Removed for ${report.reason}` : 'Reviewed and dismissed'), 500);
  try {
    await updateDoc(doc(db, 'moderation_reports', report.id), {
      status: action,
      reviewedByUid: moderator.uid,
      resolutionNote: note,
      updatedAt: serverTimestamp(),
    });
    if (action === 'removed') {
      await updateDoc(doc(db, 'chats', report.chatId, 'messages', report.messageId), {
        deleted: true,
        moderated: true,
        moderationReason: clampStr(note, 200),
        content: '[Removed by moderator]',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    await writeAuditLog(
      moderator,
      action === 'removed' ? 'MESSAGE_MODERATED_REMOVED' : 'MODERATION_REPORT_DISMISSED',
      'moderation_report',
      report.id,
      `${action.toUpperCase()} message ${report.messageId} from ${report.reportedName}: ${note}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `moderation_reports/${report.id}`);
  }
}

// ---------------------------------------------------------------------------
// Products & Customer Orders
// ---------------------------------------------------------------------------
export function subscribeProducts(includeInactive: boolean, cb: (products: Product[]) => void) {
  const path = 'products';
  const q = includeInactive
    ? query(collection(db, path), orderBy('updatedAt', 'desc'), limit(200))
    : query(collection(db, path), where('active', '==', true), limit(200));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as Product)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function saveProductDoc(
  actorUid: string,
  product: Omit<Product, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'> & { id?: string }
) {
  const id = product.id ? sanitizeId(product.id) : makeId('prd');
  try {
    if (product.id) {
      await updateDoc(doc(db, 'products', id), {
        name: clampStr(product.name, 160),
        category: clampStr(product.category, 80),
        description: clampStr(product.description, 2000),
        price: Number(product.price) || 0,
        currency: clampStr(product.currency || 'ETB', 16),
        imageUrl: clampStr(product.imageUrl, 600),
        stockStatus: product.stockStatus,
        active: Boolean(product.active),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'products', id), {
        id,
        name: clampStr(product.name, 160),
        category: clampStr(product.category, 80),
        description: clampStr(product.description, 2000),
        price: Number(product.price) || 0,
        currency: clampStr(product.currency || 'ETB', 16),
        imageUrl: clampStr(product.imageUrl, 600),
        stockStatus: product.stockStatus,
        active: Boolean(product.active),
        createdByUid: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `products/${id}`);
  }
}

export async function deleteProductDoc(productId: string) {
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
  }
}

export function subscribeOrders(user: UserPrivateProfile, cb: (orders: CustomerOrder[]) => void) {
  const path = 'orders';
  const isStaff =
    user.accountType === 'admin' ||
    user.role === 'Super Administrator' ||
    user.role === 'Company Administrator' ||
    user.role === 'Customer Service Agent';

  const q = isStaff
    ? query(collection(db, path), orderBy('createdAt', 'desc'), limit(200))
    : query(collection(db, path), where('customerUid', '==', user.uid), limit(100));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as CustomerOrder);
      list.sort((a, b) => (b.orderNumber || '').localeCompare(a.orderNumber || ''));
      cb(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createCustomerOrder(
  user: UserPrivateProfile,
  input: {
    items: CustomerOrder['items'];
    totalAmount: number;
    currency: string;
    shippingAddress?: string;
    notes?: string;
  }
): Promise<CustomerOrder> {
  const id = makeId('ord');
  const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
  const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
  const payload: CustomerOrder = {
    id,
    orderNumber,
    invoiceNumber,
    customerUid: user.uid,
    customerName: clampStr(user.displayName, 120),
    customerEmail: clampStr(user.email, 200),
    items: input.items.slice(0, 50),
    totalAmount: Number(input.totalAmount) || 0,
    currency: clampStr(input.currency || 'ETB', 16),
    status: 'pending',
    shippingAddress: clampStr(input.shippingAddress, 400),
    notes: clampStr(input.notes, 1000),
    dmsSyncStatus: 'not_configured',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'orders', id), payload);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `orders/${id}`);
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  dmsSyncStatus?: CustomerOrder['dmsSyncStatus']
) {
  try {
    const clean: Record<string, any> = { status, updatedAt: serverTimestamp() };
    if (dmsSyncStatus) clean.dmsSyncStatus = dmsSyncStatus;
    await updateDoc(doc(db, 'orders', orderId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

// ---------------------------------------------------------------------------
// Reports & Announcements
// ---------------------------------------------------------------------------
export function subscribeReports(user: UserPrivateProfile, cb: (reports: ReportEntry[]) => void) {
  const path = 'reports';
  const q =
    user.accountType === 'customer'
      ? query(collection(db, path), where('visibility', '==', 'customer_public'), limit(100))
      : query(collection(db, path), orderBy('createdAt', 'desc'), limit(150));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as ReportEntry)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createReportEntry(
  user: UserPrivateProfile,
  input: Pick<ReportEntry, 'title' | 'category' | 'description' | 'content' | 'department' | 'visibility' | 'pinned'>
) {
  const id = makeId('rep');
  try {
    await setDoc(doc(db, 'reports', id), {
      id,
      title: clampStr(input.title, 200),
      category: clampStr(input.category, 80),
      description: clampStr(input.description, 1000),
      content: clampStr(input.content, 15000),
      authorUid: user.uid,
      authorName: clampStr(user.displayName, 120),
      department: clampStr(input.department || user.department || 'General', 100),
      visibility: input.visibility || 'internal',
      pinned: Boolean(input.pinned),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${id}`);
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export function subscribeNotifications(uid: string, cb: (items: NotificationItem[]) => void) {
  const path = 'notifications';
  const q = query(collection(db, path), where('recipientUid', '==', uid), limit(100));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as NotificationItem)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createNotification(
  recipientUid: string,
  input: Pick<NotificationItem, 'type' | 'title' | 'body' | 'link'> & {
    senderUid?: string;
    callMode?: 'audio' | 'video';
  }
) {
  const id = makeId('ntf');
  const senderUid = input.senderUid || auth.currentUser?.uid;
  const payload: Record<string, any> = {
    id,
    recipientUid: sanitizeId(recipientUid),
    type: input.type,
    title: clampStr(input.title, 180),
    body: clampStr(input.body, 1000),
    read: false,
    link: clampStr(input.link, 300),
    createdAt: serverTimestamp(),
  };
  if (senderUid) payload.senderUid = sanitizeId(senderUid);
  if (input.callMode) payload.callMode = input.callMode;

  try {
    await setDoc(doc(db, 'notifications', id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `notifications/${id}`);
  }
}

export async function startDirectCallNotification(
  caller: UserPrivateProfile,
  targetUids: string[],
  roomCode: string,
  callMode: 'audio' | 'video'
) {
  const blockedSet = new Set(caller.blockedUids || []);
  const targets = targetUids.filter((u) => u && u !== caller.uid && !blockedSet.has(u)).slice(0, 20);
  for (const targetUid of targets) {
    await createNotification(targetUid, {
      senderUid: caller.uid,
      type: 'call_invite',
      callMode,
      title: `Incoming ${callMode === 'audio' ? 'Voice' : 'Video'} Call`,
      body: `${caller.displayName} is calling you on 7Sunday Meet (Room: ${roomCode}).`,
      link: `/?room=${roomCode}&mode=${callMode}`,
    }).catch(() => {});
  }
}

export async function markNotificationRead(notifId: string) {
  try {
    await updateDoc(doc(db, 'notifications', notifId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notifId}`);
  }
}

// ---------------------------------------------------------------------------
// Administration: Users, Roles, Departments, Integrations, Audit Logs
// ---------------------------------------------------------------------------
export function subscribeAllUsersForAdmin(cb: (users: UserPrivateProfile[]) => void) {
  const path = 'users';
  return onSnapshot(
    query(collection(db, path), limit(250)),
    (snap) => cb(snap.docs.map((d) => d.data() as UserPrivateProfile)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function adminUpdateUserAccount(
  actor: UserPrivateProfile,
  targetUid: string,
  updates: {
    role?: UserRole;
    accountType?: AccountType;
    status?: AccountStatus;
    department?: string;
    jobTitle?: string;
  }
) {
  try {
    const cleanUser: Record<string, any> = { updatedAt: serverTimestamp() };
    const cleanDir: Record<string, any> = { updatedAt: serverTimestamp() };

    if (updates.role !== undefined) {
      cleanUser.role = updates.role;
      cleanDir.role = updates.role;
    }
    if (updates.accountType !== undefined) {
      cleanUser.accountType = updates.accountType;
      cleanDir.accountType = updates.accountType;
    }
    if (updates.status !== undefined) {
      cleanUser.status = updates.status;
      cleanDir.status = updates.status;
    }
    if (updates.department !== undefined) {
      cleanUser.department = clampStr(updates.department, 100);
      cleanDir.department = cleanUser.department;
    }
    if (updates.jobTitle !== undefined) {
      cleanUser.jobTitle = clampStr(updates.jobTitle, 100);
      cleanDir.jobTitle = cleanUser.jobTitle;
    }

    await updateDoc(doc(db, 'users', targetUid), cleanUser);
    await updateDoc(doc(db, 'directory_profiles', targetUid), cleanDir);

    // Sync /admins/{uid} marker when promoting/demoting Super or Company Admin
    if (updates.role === 'Super Administrator' || updates.role === 'Company Administrator') {
      const targetSnap = await getDoc(doc(db, 'users', targetUid));
      const targetEmail = targetSnap.exists() ? (targetSnap.data().email as string) : '';
      await setDoc(doc(db, 'admins', targetUid), {
        uid: targetUid,
        email: targetEmail,
        role: updates.role,
        createdAt: serverTimestamp(),
      });
    } else if (updates.role !== undefined) {
      await deleteDoc(doc(db, 'admins', targetUid)).catch(() => {});
    }

    await writeAuditLog(actor, 'USER_ACCOUNT_UPDATED', 'user', targetUid, JSON.stringify(updates));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
  }
}

export async function writeAuditLog(
  actor: { uid: string; email: string; role: string },
  action: string,
  targetType: string,
  targetId: string,
  details: string
) {
  const id = makeId('aud');
  try {
    await setDoc(doc(db, 'audit_logs', id), {
      id,
      actorUid: sanitizeId(actor.uid),
      actorEmail: clampStr(actor.email, 200),
      actorRole: clampStr(actor.role, 80),
      action: clampStr(action, 120),
      targetType: clampStr(targetType, 80),
      targetId: sanitizeId(targetId),
      details: clampStr(details, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `audit_logs/${id}`);
  }
}

export function subscribeAuditLogs(cb: (logs: AuditLog[]) => void) {
  const path = 'audit_logs';
  return onSnapshot(
    query(collection(db, path), orderBy('createdAt', 'desc'), limit(200)),
    (snap) => cb(snap.docs.map((d) => d.data() as AuditLog)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeDepartments(cb: (depts: Department[]) => void) {
  const path = 'departments';
  return onSnapshot(
    query(collection(db, path), limit(100)),
    (snap) => cb(snap.docs.map((d) => d.data() as Department)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createDepartment(actor: UserPrivateProfile, name: string, description?: string) {
  const id = makeId('dept');
  try {
    await setDoc(doc(db, 'departments', id), {
      id,
      name: clampStr(name, 120),
      description: clampStr(description, 500),
      createdAt: serverTimestamp(),
    });
    await writeAuditLog(actor, 'DEPARTMENT_CREATED', 'department', id, `Created department ${name}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `departments/${id}`);
  }
}

export async function deleteDepartment(actor: UserPrivateProfile, deptId: string) {
  try {
    await deleteDoc(doc(db, 'departments', deptId));
    await writeAuditLog(actor, 'DEPARTMENT_DELETED', 'department', deptId, `Deleted department ${deptId}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `departments/${deptId}`);
  }
}

export function subscribeCustomRoles(cb: (roles: CustomRole[]) => void) {
  const path = 'custom_roles';
  return onSnapshot(
    query(collection(db, path), limit(100)),
    (snap) => cb(snap.docs.map((d) => d.data() as CustomRole)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function saveCustomRole(
  actor: UserPrivateProfile,
  role: { id?: string; name: string; accountScope: AccountType; permissions: Record<string, boolean> }
) {
  const id = role.id ? sanitizeId(role.id) : makeId('role');
  try {
    await setDoc(doc(db, 'custom_roles', id), {
      id,
      name: clampStr(role.name, 80),
      accountScope: role.accountScope,
      permissions: role.permissions,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog(actor, 'RBAC_ROLE_SAVED', 'custom_role', id, `Saved RBAC config for ${role.name}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `custom_roles/${id}`);
  }
}

export function subscribeIntegrationConfig(cb: (config: IntegrationConfig | null) => void) {
  const path = 'integration_configs/primary';
  return onSnapshot(
    doc(db, 'integration_configs', 'primary'),
    (snap) => cb(snap.exists() ? (snap.data() as IntegrationConfig) : null),
    (err) => handleFirestoreError(err, OperationType.GET, path)
  );
}

export async function saveIntegrationConfig(actor: UserPrivateProfile, config: Omit<IntegrationConfig, 'id' | 'updatedAt'>) {
  try {
    await setDoc(doc(db, 'integration_configs', 'primary'), {
      id: 'primary',
      whatsappEnabled: Boolean(config.whatsappEnabled),
      whatsappBusinessNumber: clampStr(config.whatsappBusinessNumber, 64),
      telegramEnabled: Boolean(config.telegramEnabled),
      telegramBotUsername: clampStr(config.telegramBotUsername, 100),
      emailEnabled: Boolean(config.emailEnabled),
      smtpHost: clampStr(config.smtpHost, 180),
      smsEnabled: Boolean(config.smsEnabled),
      smsSenderId: clampStr(config.smsSenderId, 64),
      sevenSundayDmsEndpoint: clampStr(config.sevenSundayDmsEndpoint, 300),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog(actor, 'INTEGRATION_CONFIG_UPDATED', 'integration_config', 'primary', 'Updated channel integrations');
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'integration_configs/primary');
  }
}

// Helper for fetching total counts or verifying sync status
export async function triggerManualSyncCheck(uid: string): Promise<string> {
  const ts = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'users', uid), { lastSyncAt: ts, updatedAt: serverTimestamp() });
    await getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', uid), limit(1)));
    return ts;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

// ---------------------------------------------------------------------------
// Live AI Meeting Transcripts (/meeting_transcripts/{entryId})
// ---------------------------------------------------------------------------
export async function saveMeetingTranscriptEntry(params: {
  id?: string;
  meetingCode: string;
  speakerUid: string;
  speakerName: string;
  text: string;
  language?: string;
  source: 'gemini_ai' | 'gemini_summary' | 'manual_note';
  meetingScope: MeetingScope;
  participantUids?: string[];
  timestampLabel: string;
}): Promise<MeetingTranscriptEntry> {
  const id = params.id ? sanitizeId(params.id) : makeId('trn');
  const participantUids = Array.from(
    new Set([params.speakerUid, ...(params.participantUids || [])].filter(Boolean).map(sanitizeId))
  ).slice(0, 100);

  const payload: MeetingTranscriptEntry = {
    id,
    meetingCode: sanitizeId(params.meetingCode).slice(0, 64),
    speakerUid: sanitizeId(params.speakerUid),
    speakerName: clampStr(params.speakerName, 120) || 'Participant',
    text: clampStr(params.text, 4000),
    language: clampStr(params.language || 'auto', 32),
    source: params.source,
    meetingScope: params.meetingScope,
    participantUids,
    timestampLabel: clampStr(params.timestampLabel, 32) || '00:00',
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'meeting_transcripts', id), payload);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `meeting_transcripts/${id}`);
  }
}

export function subscribeMeetingTranscripts(
  meetingCode: string,
  user: { uid: string; accountType?: AccountType },
  cb: (entries: MeetingTranscriptEntry[]) => void
) {
  const path = 'meeting_transcripts';
  const cleanCode = sanitizeId(meetingCode).slice(0, 64);

  const sortEntries = (docs: MeetingTranscriptEntry[]) =>
    docs.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });

  if (user.accountType === 'customer') {
    let spokenByMe: MeetingTranscriptEntry[] = [];
    let sharedWithMe: MeetingTranscriptEntry[] = [];
    const emit = () => {
      const merged = new Map<string, MeetingTranscriptEntry>();
      [...spokenByMe, ...sharedWithMe].forEach((e) => merged.set(e.id, e));
      cb(sortEntries(Array.from(merged.values())));
    };

    const u1 = onSnapshot(
      query(
        collection(db, path),
        where('meetingCode', '==', cleanCode),
        where('speakerUid', '==', user.uid),
        limit(200)
      ),
      (snap) => {
        spokenByMe = snap.docs.map((d) => d.data() as MeetingTranscriptEntry);
        emit();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );

    const u2 = onSnapshot(
      query(
        collection(db, path),
        where('meetingCode', '==', cleanCode),
        where('participantUids', 'array-contains', user.uid),
        limit(200)
      ),
      (snap) => {
        sharedWithMe = snap.docs.map((d) => d.data() as MeetingTranscriptEntry);
        emit();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );

    return () => {
      u1();
      u2();
    };
  }

  return onSnapshot(
    query(collection(db, path), where('meetingCode', '==', cleanCode), limit(250)),
    (snap) => cb(sortEntries(snap.docs.map((d) => d.data() as MeetingTranscriptEntry))),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function deleteMeetingTranscriptEntry(entryId: string) {
  try {
    await deleteDoc(doc(db, 'meeting_transcripts', entryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `meeting_transcripts/${entryId}`);
  }
}
