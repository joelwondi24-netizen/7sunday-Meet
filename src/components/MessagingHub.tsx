import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Check,
  CheckCheck,
  Clock,
  Download,
  Edit3,
  Eye,
  File as FileIcon,
  Flag,
  Forward,
  Headphones,
  MessageSquare,
  Mic,
  Paperclip,
  Phone,
  Pin,
  Plus,
  Reply,
  Search,
  Send,
  ShieldAlert,
  ShieldBan,
  Square,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import {
  createChatConversation,
  createScheduledMessage,
  deliverDueScheduledMessages,
  sendChatMessage,
  subscribeChatMessages,
  subscribeScheduledMessages,
  submitModerationReport,
  toggleBlockUser,
  updateChatMessage,
  updateScheduledMessageStatus,
} from '../services/firestoreService';
import {
  ChatConversation,
  ChatMessage,
  ChatScope,
  DirectoryProfile,
  ModerationReason,
  PresenceStatus,
  ScheduledMessage,
  UserPrivateProfile,
} from '../types';
import { DocumentPreviewModal, formatFileSize } from './DocumentPreviewModal';

interface MessagingHubProps {
  currentUser: UserPrivateProfile;
  chats: ChatConversation[];
  directory: DirectoryProfile[];
  initialChatId?: string | null;
  onStartDirectCall?: (targetUids: string[], mode: 'audio' | 'video', title?: string) => void;
  onProfileUpdated?: (updated: Partial<UserPrivateProfile>) => void;
}

type ThreadFilter = 'all' | 'bookmarks' | 'files' | 'pinned' | 'scheduled';

const PRESENCE_DOT: Record<PresenceStatus, string> = {
  online: 'bg-emerald-500',
  busy: 'bg-rose-500',
  away: 'bg-amber-400',
  in_meeting: 'bg-sky-500',
  dnd: 'bg-rose-600',
  offline: 'bg-slate-400',
};

export const MessagingHub: React.FC<MessagingHubProps> = ({
  currentUser,
  chats,
  directory,
  initialChatId,
  onStartDirectCall,
  onProfileUpdated,
}) => {
  const isCustomer = currentUser.accountType === 'customer';
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId || null);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>(initialChatId ? 'thread' : 'list');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>('all');
  const [showPinnedDrawer, setShowPinnedDrawer] = useState(false);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);

  // Document preview state
  const [previewDoc, setPreviewDoc] = useState<{
    url: string;
    name: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null>(null);

  // Schedule message modal/popover state
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleTime, setScheduleTime] = useState(() => {
    const d = new Date(Date.now() + 15 * 60 * 1000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  // Spam report modal state
  const [reportTargetMsg, setReportTargetMsg] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState<ModerationReason>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);

  // New chat creation state
  const [newChatScope, setNewChatScope] = useState<ChatScope>(
    isCustomer ? 'support' : 'employee_dm'
  );
  const [newChatName, setNewChatName] = useState('');
  const [selectedMemberUids, setSelectedMemberUids] = useState<string[]>([]);

  // Attachments & Voice Recording
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const cancelVoiceRef = useRef<boolean>(false);

  useEffect(() => {
    if (initialChatId) {
      setSelectedChatId(initialChatId);
      setMobileView('thread');
    }
  }, [initialChatId]);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) || chats[0] || null,
    [chats, selectedChatId]
  );

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      setScheduledMessages([]);
      return;
    }
    const unsubMsgs = subscribeChatMessages(selectedChat.id, setMessages);
    const unsubSched = subscribeScheduledMessages(selectedChat.id, currentUser.uid, setScheduledMessages);
    return () => {
      unsubMsgs();
      unsubSched();
    };
  }, [selectedChat?.id, currentUser.uid]);

  // Auto-deliver due scheduled messages
  useEffect(() => {
    if (!selectedChat || scheduledMessages.length === 0) return;
    const runCheck = () => {
      deliverDueScheduledMessages(
        selectedChat.id,
        currentUser,
        scheduledMessages,
        selectedChat.memberUids
      ).catch(() => {});
    };
    runCheck();
    const timer = setInterval(runCheck, 15000);
    return () => clearInterval(timer);
  }, [selectedChat?.id, scheduledMessages, currentUser]);

  // Voice recording elapsed timer
  useEffect(() => {
    if (!isRecordingVoice) {
      setRecordSeconds(0);
      return;
    }
    const t = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecordingVoice]);

  // Mark incoming messages as read
  useEffect(() => {
    if (!selectedChat) return;
    messages.forEach((m) => {
      if (
        m.senderUid !== currentUser.uid &&
        !(m.readByUids || []).includes(currentUser.uid)
      ) {
        updateChatMessage(selectedChat.id, m.id, { readUid: currentUser.uid }).catch(() => {});
      }
    });
  }, [messages, selectedChat?.id, currentUser.uid]);

  const blockedSet = useMemo(() => new Set(currentUser.blockedUids || []), [currentUser.blockedUids]);

  const baseMessages = useMemo(() => {
    return messages.filter((m) => !blockedSet.has(m.senderUid));
  }, [messages, blockedSet]);

  const pinnedMessages = useMemo(
    () => baseMessages.filter((m) => m.pinned && !m.deleted),
    [baseMessages]
  );

  const visibleMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return baseMessages.filter((m) => {
      if (threadFilter === 'bookmarks' && !(m.bookmarkedByUids || []).includes(currentUser.uid)) {
        return false;
      }
      if (threadFilter === 'pinned' && (!m.pinned || m.deleted)) {
        return false;
      }
      if (threadFilter === 'files' && !m.attachmentUrl && !m.voiceNoteUrl) {
        return false;
      }
      if (
        q &&
        !m.content.toLowerCase().includes(q) &&
        !m.senderName.toLowerCase().includes(q) &&
        !(m.attachmentName || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [baseMessages, threadFilter, searchQuery, currentUser.uid]);

  const pendingScheduled = useMemo(
    () => scheduledMessages.filter((s) => s.status === 'scheduled'),
    [scheduledMessages]
  );

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !messageText.trim()) return;

    if (editingMsg) {
      await updateChatMessage(selectedChat.id, editingMsg.id, {
        content: messageText.trim(),
        edited: true,
      });
      setEditingMsg(null);
      setMessageText('');
      return;
    }

    await sendChatMessage(selectedChat.id, currentUser, {
      content: messageText.trim(),
      replyToId: replyTo?.id,
      replyToPreview: replyTo ? `${replyTo.senderName}: ${replyTo.content.slice(0, 80)}` : undefined,
      recipientUids: selectedChat.memberUids,
    });
    setMessageText('');
    setReplyTo(null);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !messageText.trim()) return;
    const targetIso = new Date(scheduleTime).toISOString();
    await createScheduledMessage(selectedChat.id, currentUser, messageText.trim(), targetIso);
    setMessageText('');
    setShowSchedulePicker(false);
    setThreadFilter('scheduled');
    setNoticeBanner(`Message scheduled for ${new Date(targetIso).toLocaleString()}.`);
    setTimeout(() => setNoticeBanner(null), 3500);
  };

  const uploadAndSendFile = async (file: File) => {
    if (!selectedChat) return;
    setUploading(true);
    try {
      const uploaded = await api.uploadFile(file, file.name);
      await sendChatMessage(selectedChat.id, currentUser, {
        content: messageText.trim() || `Shared file: ${uploaded.name}`,
        attachmentUrl: uploaded.url,
        attachmentName: uploaded.name,
        attachmentType: uploaded.mimeType,
        attachmentSizeBytes: uploaded.sizeBytes,
        recipientUids: selectedChat.memberUids,
      });
      setMessageText('');
    } finally {
      setUploading(false);
    }
  };

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAndSendFile(file);
    e.target.value = '';
  };

  const toggleVoiceRecording = async (cancel = false) => {
    if (!selectedChat) return;
    if (isRecordingVoice && mediaRecorderRef.current) {
      cancelVoiceRef.current = cancel;
      mediaRecorderRef.current.stop();
      setIsRecordingVoice(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      cancelVoiceRef.current = false;
      recordStartRef.current = Date.now();
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelVoiceRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const dur = Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
        setUploading(true);
        try {
          const uploaded = await api.uploadFile(blob, `voice-${Date.now()}.webm`);
          await sendChatMessage(selectedChat.id, currentUser, {
            content: `Voice note (${dur}s)`,
            voiceNoteUrl: uploaded.url,
            voiceNoteDurationSec: dur,
            recipientUids: selectedChat.memberUids,
          });
        } finally {
          setUploading(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecordingVoice(true);
    } catch {
      setIsRecordingVoice(false);
    }
  };

  const handleCreateConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    const members = Array.from(new Set([currentUser.uid, ...selectedMemberUids]));
    const created = await createChatConversation({
      chatScope: newChatScope,
      name:
        newChatName.trim() ||
        (newChatScope === 'support'
          ? `Support Inquiry — ${currentUser.displayName}`
          : newChatScope === 'customer_community'
          ? 'Customer Community Lounge'
          : 'Direct Conversation'),
      memberUids: members,
      adminUids: [currentUser.uid],
    });
    setSelectedChatId(created.id);
    setMobileView('thread');
    setShowNewChat(false);
    setNewChatName('');
    setSelectedMemberUids([]);
  };

  const handleForwardTo = async (targetChatId: string) => {
    if (!forwardMsg) return;
    const targetChat = chats.find((c) => c.id === targetChatId);
    await sendChatMessage(targetChatId, currentUser, {
      content: forwardMsg.content,
      attachmentUrl: forwardMsg.attachmentUrl,
      attachmentName: forwardMsg.attachmentName,
      attachmentType: forwardMsg.attachmentType,
      attachmentSizeBytes: forwardMsg.attachmentSizeBytes,
      forwardedFrom: forwardMsg.senderName,
      recipientUids: targetChat?.memberUids,
    });
    setForwardMsg(null);
  };

  const handleSubmitSpamReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !reportTargetMsg) return;
    await submitModerationReport(
      selectedChat.id,
      reportTargetMsg,
      currentUser,
      reportReason,
      reportDetails
    );
    setReportTargetMsg(null);
    setReportDetails('');
    setReportReason('spam');
    setNoticeBanner('Report submitted to 7Sunday Meet moderators for review.');
    setTimeout(() => setNoticeBanner(null), 4000);
  };

  const handleBlockSender = async (targetUid: string) => {
    await toggleBlockUser(currentUser.uid, targetUid, true);
    onProfileUpdated?.({
      blockedUids: Array.from(new Set([...(currentUser.blockedUids || []), targetUid])),
    });
  };

  const getOtherMember = (chat: ChatConversation): DirectoryProfile | undefined => {
    const otherUid = chat.memberUids.find((u) => u !== currentUser.uid);
    return directory.find((d) => d.uid === otherUid);
  };

  const getChatTitle = (chat: ChatConversation) => {
    if (chat.name) return chat.name;
    const match = getOtherMember(chat);
    return match ? match.displayName : chat.chatScope.replace('_', ' ');
  };

  const selectableContacts = useMemo(() => {
    return directory.filter((d) => {
      if (d.uid === currentUser.uid || blockedSet.has(d.uid)) return false;
      if (isCustomer) {
        if (newChatScope === 'support') return d.role === 'Customer Service Agent';
        return d.accountType === 'customer';
      }
      return true;
    });
  }, [directory, currentUser.uid, blockedSet, isCustomer, newChatScope]);

  const otherRecipient = selectedChat ? getOtherMember(selectedChat) : undefined;
  const callTargets = selectedChat
    ? selectedChat.memberUids.filter((u) => u !== currentUser.uid && !blockedSet.has(u))
    : [];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 h-[calc(100dvh-6.25rem)] sm:h-[calc(100dvh-8.5rem)] min-h-[460px]">
      {/* Left Conversation List */}
      <div
        className={`${
          mobileView === 'list' ? 'flex' : 'hidden'
        } lg:flex lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex-col min-h-0`}
      >
        <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
              {isCustomer ? 'Community & Support' : 'Messaging & Support Queue'}
            </h2>
            <p className="text-[11px] text-slate-500 truncate">
              {isCustomer ? 'Isolated customer & support threads' : 'Real-time employee & support messaging'}
            </p>
          </div>
          <button
            onClick={() => setShowNewChat((s) => !s)}
            className="p-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white"
            title="Start Conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showNewChat && (
          <form
            onSubmit={handleCreateConversation}
            className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-3"
          >
            <select
              value={newChatScope}
              onChange={(e) => setNewChatScope(e.target.value as ChatScope)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold"
            >
              {isCustomer ? (
                <>
                  <option value="support">Customer Support Ticket</option>
                  <option value="customer_dm">Customer Direct Message</option>
                  <option value="customer_community">Customer Community Room</option>
                </>
              ) : (
                <>
                  <option value="employee_dm">Employee Direct Message</option>
                  <option value="employee_group">Employee Group Channel</option>
                  <option value="support">Customer Support Thread</option>
                </>
              )}
            </select>

            <input
              type="text"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              placeholder="Conversation title (optional)"
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />

            <div className="max-h-28 overflow-y-auto space-y-1">
              {selectableContacts.map((person) => (
                <label key={person.uid} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMemberUids.includes(person.uid)}
                    onChange={(e) =>
                      setSelectedMemberUids((prev) =>
                        e.target.checked
                          ? [...prev, person.uid]
                          : prev.filter((id) => id !== person.uid)
                      )
                    }
                  />
                  <span className="truncate">{person.displayName}</span>
                  <span className="text-[10px] text-slate-400">({person.role})</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewChat(false)}
                className="px-3 py-1.5 rounded-lg text-xs bg-slate-200 dark:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 text-white"
              >
                Create
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {chats.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <MessageSquare className="w-6 h-6 mx-auto text-slate-400" />
              <p>No conversations yet. Click + above to start messaging.</p>
            </div>
          ) : (
            chats.map((chat) => {
              const active = selectedChat?.id === chat.id;
              const peer = getOtherMember(chat);
              const peerPresence: PresenceStatus = peer?.presenceStatus || 'online';
              return (
                <button
                  key={chat.id}
                  onClick={() => {
                    setSelectedChatId(chat.id);
                    setMobileView('thread');
                  }}
                  className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 ${
                    active ? 'bg-sky-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="relative w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    {chat.chatScope === 'support' ? (
                      <Headphones className="w-4 h-4 text-emerald-500" />
                    ) : chat.chatScope.includes('group') || chat.chatScope === 'customer_community' ? (
                      <Users className="w-4 h-4 text-sky-500" />
                    ) : (
                      <MessageSquare className="w-4 h-4 text-indigo-500" />
                    )}
                    {peer && (
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${PRESENCE_DOT[peerPresence]}`}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {getChatTitle(chat)}
                      </span>
                      <span className="text-[10px] uppercase font-semibold text-slate-400">
                        {chat.chatScope.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {chat.lastMessage || 'No messages yet'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Message Thread */}
      <div
        className={`${
          mobileView === 'thread' ? 'flex' : 'hidden'
        } lg:flex lg:col-span-8 flex-col relative min-h-0 min-w-0 ${dragOver ? 'ring-2 ring-inset ring-sky-500 bg-sky-500/5' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && selectedChat) await uploadAndSendFile(f);
        }}
      >
        {!selectedChat ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 text-center text-xs text-slate-500">
            <MessageSquare className="w-8 h-8 text-slate-400 mb-2" />
            <p>Select a conversation or create a new one to send messages, voice notes, files, or start a call.</p>
            <button
              type="button"
              onClick={() => setMobileView('list')}
              className="lg:hidden mt-4 px-4 py-2 rounded-xl bg-sky-600 text-white font-bold text-xs"
            >
              Browse Conversations
            </button>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5 sm:space-y-3 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setMobileView('list')}
                    className="lg:hidden p-2 -ml-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0"
                    title="Back to Conversations"
                    aria-label="Back to Conversations"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {getChatTitle(selectedChat)}
                      </h3>
                      {otherRecipient && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold shrink-0">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              PRESENCE_DOT[otherRecipient.presenceStatus || 'online']
                            }`}
                          />
                          <span className="hidden xs:inline sm:inline">{otherRecipient.presenceStatus || 'online'}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      {otherRecipient?.statusMessage
                        ? `“${otherRecipient.statusMessage}” · `
                        : ''}
                      {selectedChat.memberUids.length} participant(s) · Scope: {selectedChat.chatScope}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {onStartDirectCall && callTargets.length > 0 && (
                    <>
                      <button
                        onClick={() =>
                          onStartDirectCall(callTargets, 'audio', `Voice Call · ${getChatTitle(selectedChat)}`)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-400 hover:text-white text-xs font-bold transition-colors shrink-0"
                        title="Start Voice Call"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Voice Call</span>
                      </button>
                      <button
                        onClick={() =>
                          onStartDirectCall(callTargets, 'video', `Video Call · ${getChatTitle(selectedChat)}`)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-600/10 hover:bg-sky-600 text-sky-700 dark:text-sky-400 hover:text-white text-xs font-bold transition-colors shrink-0"
                        title="Start Video Call"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Video Call</span>
                      </button>
                    </>
                  )}

                  <div className="relative flex-1 sm:flex-initial min-w-[140px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search text, sender, file..."
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs w-full sm:w-48"
                    />
                  </div>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: 'All Messages' },
                    { id: 'bookmarks', label: 'Bookmarks' },
                    { id: 'pinned', label: `Pinned (${pinnedMessages.length})` },
                    { id: 'files', label: 'Files & Voice' },
                    { id: 'scheduled', label: `Scheduled (${pendingScheduled.length})` },
                  ] as { id: ThreadFilter; label: string }[]
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setThreadFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                      threadFilter === f.id
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {noticeBanner && (
              <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                <span>{noticeBanner}</span>
                <button onClick={() => setNoticeBanner(null)}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Pinned Banner + Drawer */}
            {pinnedMessages.length > 0 && threadFilter !== 'scheduled' && (
              <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Pin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      <strong>Pinned ({pinnedMessages.length}):</strong>{' '}
                      {pinnedMessages[pinnedMessages.length - 1].content}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowPinnedDrawer((s) => !s)}
                    className="text-[11px] font-bold underline shrink-0"
                  >
                    {showPinnedDrawer ? 'Hide All' : 'View All'}
                  </button>
                </div>
                {showPinnedDrawer && (
                  <div className="space-y-1.5 pt-1 border-t border-amber-500/20 max-h-32 overflow-y-auto">
                    {pinnedMessages.map((pm) => (
                      <div key={pm.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate">
                          <strong>{pm.senderName}:</strong> {pm.content}
                        </span>
                        <button
                          onClick={() => updateChatMessage(selectedChat.id, pm.id, { pinned: false })}
                          className="text-amber-700 dark:text-amber-300 hover:underline shrink-0"
                        >
                          Unpin
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Thread Stream OR Scheduled Queue */}
            {threadFilter === 'scheduled' ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-sky-500" />
                    <span>Scheduled Messages ({scheduledMessages.length})</span>
                  </h4>
                </div>
                {scheduledMessages.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-10">
                    No scheduled messages for this conversation. Type a message below and click the Clock icon to schedule delivery.
                  </p>
                ) : (
                  scheduledMessages.map((sm) => (
                    <div
                      key={sm.id}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              sm.status === 'scheduled'
                                ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                                : sm.status === 'sent'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            {sm.status}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(sm.scheduledFor).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap">{sm.content}</p>
                      </div>

                      {sm.status === 'scheduled' && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={async () => {
                              await updateScheduledMessageStatus(selectedChat.id, sm.id, 'sent');
                              await sendChatMessage(selectedChat.id, currentUser, {
                                content: sm.content,
                                recipientUids: selectedChat.memberUids,
                              });
                            }}
                            className="px-2.5 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-bold"
                          >
                            Send Now
                          </button>
                          <button
                            onClick={() => updateScheduledMessageStatus(selectedChat.id, sm.id, 'cancelled')}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px] font-bold"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
                {visibleMessages.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-10">
                    No matching messages in this view. Drag & drop a file here or start typing below.
                  </p>
                ) : (
                  visibleMessages.map((msg) => {
                    const isOwn = msg.senderUid === currentUser.uid;
                    const isBookmarked = (msg.bookmarkedByUids || []).includes(currentUser.uid);
                    const readCount = (msg.readByUids || []).length;

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[90%] sm:max-w-[82%] rounded-2xl px-3.5 sm:px-4 py-2.5 text-xs space-y-1.5 ${
                            isOwn
                              ? 'bg-sky-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[10px] opacity-80">
                            <span className="font-bold">{msg.senderName}</span>
                            {msg.forwardedFrom && <span>Forwarded from {msg.forwardedFrom}</span>}
                          </div>

                          {msg.replyToPreview && (
                            <div className="p-1.5 rounded-lg bg-black/15 text-[10px] opacity-90 truncate">
                              ↩ {msg.replyToPreview}
                            </div>
                          )}

                          {msg.deleted ? (
                            <p className="italic opacity-80 flex items-center gap-1">
                              {msg.moderated && <ShieldAlert className="w-3.5 h-3.5 shrink-0" />}
                              <span>
                                {msg.moderated
                                  ? `Removed by moderator${msg.moderationReason ? ` (${msg.moderationReason})` : ''}`
                                  : 'Message deleted'}
                              </span>
                            </p>
                          ) : (
                            <>
                              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                              {msg.attachmentUrl && (
                                <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-black/15">
                                  <FileIcon className="w-4 h-4 shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-semibold truncate">
                                      {msg.attachmentName || 'Attachment'}
                                    </p>
                                    {msg.attachmentSizeBytes && (
                                      <p className="text-[10px] opacity-80">
                                        {formatFileSize(msg.attachmentSizeBytes)}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewDoc({
                                        url: msg.attachmentUrl!,
                                        name: msg.attachmentName || 'Document',
                                        mimeType: msg.attachmentType,
                                        sizeBytes: msg.attachmentSizeBytes,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[10px] font-bold"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>Preview</span>
                                  </button>
                                  <a
                                    href={msg.attachmentUrl}
                                    download={msg.attachmentName || 'download'}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-[10px] font-bold"
                                  >
                                    <Download className="w-3 h-3" />
                                  </a>
                                </div>
                              )}
                              {msg.voiceNoteUrl && (
                                <div className="pt-1 space-y-1">
                                  <audio controls src={msg.voiceNoteUrl} className="h-8 max-w-full" />
                                  {typeof msg.voiceNoteDurationSec === 'number' && (
                                    <span className="inline-block text-[10px] opacity-80">
                                      Voice Note · {msg.voiceNoteDurationSec}s
                                    </span>
                                  )}
                                </div>
                              )}
                            </>
                          )}

                          <div className="flex items-center justify-end gap-2 text-[10px] opacity-75 pt-0.5">
                            {msg.pinned && <Pin className="w-3 h-3" />}
                            {msg.edited && <span>(edited)</span>}
                            {isOwn && (readCount > 1 ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
                          </div>
                        </div>

                        {!msg.deleted && (
                          <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-slate-400">
                            <button onClick={() => setReplyTo(msg)} className="hover:text-sky-500" title="Reply">
                              <Reply className="w-3 h-3" />
                            </button>
                            <button onClick={() => setForwardMsg(msg)} className="hover:text-sky-500" title="Forward">
                              <Forward className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() =>
                                updateChatMessage(selectedChat.id, msg.id, { pinned: !msg.pinned })
                              }
                              className={msg.pinned ? 'text-amber-500' : 'hover:text-amber-500'}
                              title={msg.pinned ? 'Unpin' : 'Pin'}
                            >
                              <Pin className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() =>
                                updateChatMessage(selectedChat.id, msg.id, {
                                  [isBookmarked ? 'unbookmarkUid' : 'bookmarkUid']: currentUser.uid,
                                })
                              }
                              className={isBookmarked ? 'text-amber-500' : 'hover:text-amber-500'}
                              title={isBookmarked ? 'Remove Bookmark' : 'Bookmark'}
                            >
                              <Bookmark className="w-3 h-3" />
                            </button>
                            {isOwn ? (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingMsg(msg);
                                    setMessageText(msg.content);
                                  }}
                                  className="hover:text-sky-500"
                                  title="Edit"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() =>
                                    updateChatMessage(selectedChat.id, msg.id, { deleted: true, content: '[Deleted]' })
                                  }
                                  className="hover:text-rose-500"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setReportTargetMsg(msg)}
                                  className="hover:text-rose-500"
                                  title="Report Spam / Abuse"
                                >
                                  <Flag className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleBlockSender(msg.senderUid)}
                                  className="hover:text-rose-500"
                                  title="Block sender"
                                >
                                  <ShieldBan className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Schedule Picker Bar */}
            {showSchedulePicker && (
              <form
                onSubmit={handleScheduleSubmit}
                className="px-4 py-2.5 bg-sky-500/10 border-t border-sky-500/20 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-sky-500" />
                  <span className="font-semibold">Schedule Delivery:</span>
                  <input
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    required
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowSchedulePicker(false)}
                    className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-[11px] font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!messageText.trim()}
                    className="px-3 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-bold disabled:opacity-40"
                  >
                    Confirm Schedule
                  </button>
                </div>
              </form>
            )}

            {/* Reply / Edit Banner */}
            {(replyTo || editingMsg) && (
              <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="truncate">
                  {editingMsg ? `Editing: ${editingMsg.content}` : `Replying to ${replyTo?.senderName}: ${replyTo?.content}`}
                </span>
                <button
                  onClick={() => {
                    setReplyTo(null);
                    setEditingMsg(null);
                    setMessageText('');
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Composer */}
            <form
              onSubmit={handleSendText}
              className="p-2.5 sm:p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5 sm:gap-2 shrink-0"
            >
              <label
                className="cursor-pointer p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0"
                title="Attach & Transfer File"
              >
                <Paperclip className="w-4 h-4" />
                <input type="file" onChange={handleFileAttach} className="hidden" disabled={uploading} />
              </label>

              <button
                type="button"
                onClick={() => toggleVoiceRecording(false)}
                className={`p-2 rounded-xl shrink-0 transition-colors flex items-center gap-1.5 text-xs font-bold ${
                  isRecordingVoice
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
                title={isRecordingVoice ? 'Stop & Send Voice Note' : 'Record Voice Note'}
              >
                {isRecordingVoice ? (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span className="tabular-nums">
                      {Math.floor(recordSeconds / 60).toString().padStart(2, '0')}:
                      {(recordSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  </>
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              {isRecordingVoice && (
                <button
                  type="button"
                  onClick={() => toggleVoiceRecording(true)}
                  className="p-2 rounded-xl shrink-0 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs"
                  title="Cancel recording"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={uploading ? 'Uploading attachment...' : 'Write a message...'}
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
              />

              {!editingMsg && (
                <button
                  type="button"
                  onClick={() => setShowSchedulePicker((s) => !s)}
                  className={`p-2 rounded-xl shrink-0 transition-colors ${
                    showSchedulePicker
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title="Schedule Message"
                >
                  <Clock className="w-4 h-4" />
                </button>
              )}

              <button
                type="submit"
                disabled={!messageText.trim() || uploading}
                className="p-2.5 rounded-xl shrink-0 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </div>

      {/* Forward Modal */}
      {forwardMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold">Forward Message To</h4>
              <button onClick={() => setForwardMsg(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {chats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleForwardTo(c.id)}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-sky-500/10 text-xs font-semibold"
                >
                  {getChatTitle(c)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Spam & Abuse Report Modal */}
      {reportTargetMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleSubmitSpamReport}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-rose-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Report Spam or Abuse
                </h4>
              </div>
              <button type="button" onClick={() => setReportTargetMsg(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
              <p className="font-bold text-slate-700 dark:text-slate-300">{reportTargetMsg.senderName}</p>
              <p className="text-slate-500 mt-0.5 line-clamp-3">{reportTargetMsg.content}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Reason
              </label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value as ModerationReason)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold"
              >
                <option value="spam">Unsolicited Spam / Advertising</option>
                <option value="harassment">Harassment or Abusive Language</option>
                <option value="phishing">Phishing / Suspicious Link</option>
                <option value="inappropriate">Inappropriate Content</option>
                <option value="other">Other Policy Violation</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Additional Context (optional)
              </label>
              <textarea
                rows={2}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Describe why this message violates 7Sunday Meet guidelines..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTargetMsg(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          url={previewDoc.url}
          name={previewDoc.name}
          mimeType={previewDoc.mimeType}
          sizeBytes={previewDoc.sizeBytes}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
};
