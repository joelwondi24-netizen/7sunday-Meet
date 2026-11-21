import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building,
  Calendar as CalendarIcon,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Lock,
  Phone,
  Plus,
  Share2,
  Trash2,
  Upload,
  Users,
  Video,
} from 'lucide-react';
import { api } from '../services/api';
import { exportMeetingsExcel, exportMeetingsPDF } from '../services/exportService';
import {
  createMeetingDoc,
  createNotification,
  deleteMeetingDoc,
  detectMeetingConflicts,
} from '../services/firestoreService';
import {
  DirectoryProfile,
  Meeting,
  MeetingPriority,
  MeetingScope,
  MeetingType,
  RecurrenceRule,
  UserPrivateProfile,
} from '../types';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { MeetingInviteModal } from './MeetingInviteModal';

interface MeetingSchedulerProps {
  currentUser: UserPrivateProfile;
  meetings: Meeting[];
  directory: DirectoryProfile[];
  onJoinMeeting: (code: string, callMode?: 'video' | 'audio') => void;
}

type CalendarMode =
  | 'list'
  | 'rooms'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'department'
  | 'personal';

export const MeetingScheduler: React.FC<MeetingSchedulerProps> = ({
  currentUser,
  meetings,
  directory,
  onJoinMeeting,
}) => {
  const isCustomer = currentUser.accountType === 'customer';
  const [viewMode, setViewMode] = useState<CalendarMode>('list');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [inviteMeeting, setInviteMeeting] = useState<Meeting | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null);

  // Create form state
  const nowPlus1h = new Date(Date.now() + 30 * 60 * 1000);
  const nowPlus2h = new Date(Date.now() + 90 * 60 * 1000);
  const toLocalInput = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agenda, setAgenda] = useState('');
  const [meetingScope, setMeetingScope] = useState<MeetingScope>(isCustomer ? 'customer' : 'internal');
  const [type, setType] = useState<MeetingType>('scheduled');
  const [callMode, setCallMode] = useState<'video' | 'audio'>('video');
  const [capacity, setCapacity] = useState<number>(50);
  const [priority, setPriority] = useState<MeetingPriority>('normal');
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>('none');
  const [scheduledStart, setScheduledStart] = useState(toLocalInput(nowPlus1h));
  const [scheduledEnd, setScheduledEnd] = useState(toLocalInput(nowPlus2h));
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [meetingPassword, setMeetingPassword] = useState('');
  const [selectedParticipantUids, setSelectedParticipantUids] = useState<string[]>([]);
  const [invitedEmailsText, setInvitedEmailsText] = useState('');
  const [documentUrls, setDocumentUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isPermanentType = type === 'conference_room' || type === 'virtual_room';

  const conflicts = useMemo(() => {
    if (!showCreate || isPermanentType) return [];
    return detectMeetingConflicts(
      new Date(scheduledStart).toISOString(),
      new Date(scheduledEnd).toISOString(),
      meetings
    );
  }, [showCreate, isPermanentType, scheduledStart, scheduledEnd, meetings]);

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (viewMode === 'rooms') {
        return (
          m.type === 'conference_room' ||
          m.type === 'virtual_room' ||
          Boolean(m.isPermanentRoom)
        );
      }
      if (viewMode === 'personal') {
        return (
          m.hostUid === currentUser.uid ||
          (m.participantUids || []).includes(currentUser.uid)
        );
      }
      if (viewMode === 'department' && departmentFilter !== 'all') {
        return (m.department || '').toLowerCase() === departmentFilter.toLowerCase();
      }
      if (viewMode === 'daily') {
        return m.scheduledStart.slice(0, 10) === selectedDate;
      }
      if (viewMode === 'weekly') {
        const ref = new Date(selectedDate).getTime();
        const start = new Date(m.scheduledStart).getTime();
        return Math.abs(start - ref) <= 7 * 24 * 60 * 60 * 1000;
      }
      if (viewMode === 'monthly') {
        return m.scheduledStart.slice(0, 7) === selectedDate.slice(0, 7);
      }
      return true;
    });
  }, [meetings, viewMode, selectedDate, departmentFilter, currentUser.uid]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    meetings.forEach((m) => m.department && set.add(m.department));
    return Array.from(set);
  }, [meetings]);

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await api.uploadFile(file, file.name);
      setDocumentUrls((prev) => [...prev, `${res.name}|${res.url}`]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Document upload failed.');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!isPermanentType && new Date(scheduledEnd) <= new Date(scheduledStart)) {
      setErrorMsg('End time must be after start time.');
      return;
    }

    setSubmitting(true);
    try {
      const invitedEmails = invitedEmailsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const created = await createMeetingDoc(currentUser, {
        title,
        description,
        agenda,
        meetingScope,
        type,
        callMode,
        capacity,
        isPermanentRoom: isPermanentType,
        priority,
        status: isPermanentType ? 'live' : 'waiting',
        department: currentUser.department || 'General',
        scheduledStart: new Date(scheduledStart).toISOString(),
        scheduledEnd: new Date(scheduledEnd).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Addis_Ababa',
        recurrenceRule,
        waitingRoomEnabled,
        isLocked,
        hasPassword: Boolean(meetingPassword.trim()),
        allowScreenShare: true,
        allowChat: true,
        allowWhiteboard: true,
        recordingConsentRequired: true,
        participantUids: selectedParticipantUids,
        invitedEmails,
        documentUrls,
      });

      await api
        .registerRoomRuntime({
          code: created.code,
          title: created.title,
          meetingScope: created.meetingScope,
          callMode: created.callMode,
          capacity: created.capacity,
          waitingRoomEnabled: created.waitingRoomEnabled,
          isLocked: created.isLocked,
          password: meetingPassword.trim() || undefined,
        })
        .catch(() => {});

      for (const pUid of selectedParticipantUids) {
        if (pUid !== currentUser.uid) {
          await createNotification(pUid, {
            senderUid: currentUser.uid,
            type: 'meeting_invite',
            callMode,
            title: `${isPermanentType ? 'Room Access' : 'Meeting Invitation'}: ${created.title}`,
            body: `${currentUser.displayName} invited you to "${created.title}" (${created.code}).`,
            link: `/?room=${created.code}&mode=${callMode}`,
          }).catch(() => {});
        }
      }

      setShowCreate(false);
      setTitle('');
      setDescription('');
      setAgenda('');
      setMeetingPassword('');
      setSelectedParticipantUids([]);
      setInvitedEmailsText('');
      setDocumentUrls([]);
      if (isPermanentType) setViewMode('rooms');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to schedule meeting.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Meetings, Conference & Virtual Rooms
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Schedule video/voice meetings, open persistent conference & virtual rooms, and preview documents
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportMeetingsPDF(filteredMeetings)}
            disabled={filteredMeetings.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40"
          >
            <FileText className="w-3.5 h-3.5 text-rose-500" />
            <span>Export PDF</span>
          </button>

          <button
            onClick={() => exportMeetingsExcel(filteredMeetings)}
            disabled={filteredMeetings.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={() => {
              setType('conference_room');
              setShowCreate(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm"
          >
            <Building className="w-4 h-4" />
            <span>New Conference Room</span>
          </button>

          <button
            onClick={() => {
              setType('scheduled');
              setShowCreate((s) => !s);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Meeting</span>
          </button>
        </div>
      </div>

      {/* Calendar View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'list', label: 'All Meetings' },
              { id: 'rooms', label: 'Conference & Virtual Rooms' },
              { id: 'daily', label: 'Daily' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              ...(isCustomer ? [] : [{ id: 'department', label: 'Department' }]),
              { id: 'personal', label: 'Personal' },
            ] as { id: CalendarMode; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                viewMode === tab.id
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {(viewMode === 'daily' || viewMode === 'weekly' || viewMode === 'monthly') && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
            />
          )}
          {viewMode === 'department' && (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Create Meeting / Room Form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm"
        >
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {isPermanentType ? 'Create Persistent Conference / Virtual Room' : 'New Scheduled Meeting'}
          </h3>

          {conflicts.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Scheduling Conflict Detected ({conflicts.length})</p>
                <p className="mt-0.5">
                  Overlaps with: {conflicts.map((c) => `"${c.title}" (${new Date(c.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`).join(', ')}
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {isPermanentType ? 'Room Name' : 'Meeting Title'}
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isPermanentType ? 'e.g. Executive Boardroom A' : 'e.g. Weekly Operations Sync'}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Scope
                </label>
                <select
                  value={meetingScope}
                  onChange={(e) => setMeetingScope(e.target.value as MeetingScope)}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                >
                  {!isCustomer && <option value="internal">Internal</option>}
                  <option value="customer">Customer</option>
                  <option value="external">External Guest</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Room Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as MeetingType)}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <option value="scheduled">Scheduled Meeting</option>
                  <option value="conference_room">Conference Room</option>
                  <option value="virtual_room">Virtual Meeting Room</option>
                  <option value="recurring">Recurring</option>
                  <option value="webinar">Webinar</option>
                  <option value="classroom">Classroom</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Call Mode
                </label>
                <select
                  value={callMode}
                  onChange={(e) => setCallMode(e.target.value as 'video' | 'audio')}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <option value="video">Video & Audio</option>
                  <option value="audio">Voice Only</option>
                </select>
              </div>
            </div>

            {!isPermanentType && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Start Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledStart}
                    onChange={(e) => setScheduledStart(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    End Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledEnd}
                    onChange={(e) => setScheduledEnd(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as MeetingPriority)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Seat Capacity
                </label>
                <input
                  type="number"
                  min={2}
                  max={1000}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value) || 50)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Optional Meeting Password
              </label>
              <input
                type="password"
                value={meetingPassword}
                onChange={(e) => setMeetingPassword(e.target.value)}
                placeholder="Leave blank for link-only access"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>

            {!isPermanentType && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Recurrence
                </label>
                <select
                  value={recurrenceRule}
                  onChange={(e) => setRecurrenceRule(e.target.value as RecurrenceRule)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  <option value="none">One-time Meeting</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Purpose of the meeting or room..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Meeting Agenda
              </label>
              <textarea
                rows={2}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder="1. Topic one&#10;2. Topic two"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
          </div>

          {/* Participants & Attachments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Invite Directory Contacts
              </label>
              <div className="max-h-32 overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                {directory.filter((d) => d.uid !== currentUser.uid).length === 0 ? (
                  <p className="text-[11px] text-slate-500 p-1">No contacts available yet.</p>
                ) : (
                  directory
                    .filter((d) => d.uid !== currentUser.uid)
                    .map((person) => (
                      <label key={person.uid} className="flex items-center gap-2 text-xs p-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedParticipantUids.includes(person.uid)}
                          onChange={(e) =>
                            setSelectedParticipantUids((prev) =>
                              e.target.checked
                                ? [...prev, person.uid]
                                : prev.filter((id) => id !== person.uid)
                            )
                          }
                        />
                        <span className="truncate">{person.displayName}</span>
                        <span className="text-[10px] text-slate-400">({person.role})</span>
                      </label>
                    ))
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  External Guest Emails (comma separated)
                </label>
                <input
                  type="text"
                  value={invitedEmailsText}
                  onChange={(e) => setInvitedEmailsText(e.target.value)}
                  placeholder="guest1@company.com, guest2@company.com"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Attach Document</span>
                  <input type="file" onChange={handleUploadAttachment} className="hidden" />
                </label>
                {documentUrls.length > 0 && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                    {documentUrls.length} file(s) attached
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-4 text-xs font-semibold">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={waitingRoomEnabled}
                  onChange={(e) => setWaitingRoomEnabled(e.target.checked)}
                />
                <span>Enable Waiting Room</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isLocked}
                  onChange={(e) => setIsLocked(e.target.checked)}
                />
                <span>Start Locked</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
              >
                {submitting ? 'Saving...' : isPermanentType ? 'Create Room' : 'Save Meeting'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Meetings List */}
      {filteredMeetings.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <CalendarIcon className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {viewMode === 'rooms' ? 'No conference or virtual rooms yet' : 'No meetings scheduled'}
          </p>
          <p className="text-xs text-slate-500">
            Click "New Conference Room" or "Schedule Meeting" above to launch live voice/video sessions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMeetings.map((m) => (
            <div
              key={m.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
                        {m.meetingScope}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                        {m.type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {m.callMode === 'audio' ? 'Voice' : 'Video'} · {m.capacity || 50} seats
                      </span>
                      {m.hasPassword && <Lock className="w-3 h-3 text-amber-500" />}
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{m.title}</h4>
                  </div>

                  <span className="font-mono text-[11px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                    {m.code}
                  </span>
                </div>

                {m.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{m.description}</p>
                )}

                {m.agenda && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-line">
                    <strong className="block text-slate-800 dark:text-slate-200 mb-0.5">Agenda:</strong>
                    {m.agenda}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
                  {!(m.isPermanentRoom || m.type === 'conference_room' || m.type === 'virtual_room') && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock className="w-3.5 h-3.5 text-sky-500" />
                      {new Date(m.scheduledStart).toLocaleString()}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-emerald-500" />
                    {(m.participantUids || []).length} member(s)
                  </span>
                </div>

                {m.documentUrls && m.documentUrls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {m.documentUrls.map((entry, idx) => {
                      const [name, url] = entry.includes('|') ? entry.split('|') : [`Document ${idx + 1}`, entry];
                      return (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px]"
                        >
                          <button
                            type="button"
                            onClick={() => setPreviewDoc({ url, name })}
                            className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-semibold hover:underline"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{name}</span>
                          </button>
                          <a
                            href={url}
                            download={name}
                            className="text-slate-500 hover:text-slate-900 dark:hover:text-white pl-1"
                            title="Download"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setInviteMeeting(m)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Invite</span>
                  </button>

                  {m.hostUid === currentUser.uid && (
                    <button
                      onClick={() => deleteMeetingDoc(m.id)}
                      className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-500/10"
                      title="Delete meeting"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onJoinMeeting(m.code, 'audio')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-400 hover:text-white text-xs font-bold transition-colors"
                    title="Join Audio-Only Voice Call"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Voice</span>
                  </button>
                  <button
                    onClick={() => onJoinMeeting(m.code, 'video')}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Join Room</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {inviteMeeting && (
        <MeetingInviteModal meeting={inviteMeeting} onClose={() => setInviteMeeting(null)} />
      )}

      {previewDoc && (
        <DocumentPreviewModal
          url={previewDoc.url}
          name={previewDoc.name}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
};
