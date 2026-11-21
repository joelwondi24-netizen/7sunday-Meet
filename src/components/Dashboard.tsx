import React from 'react';
import {
  Calendar,
  Clock,
  MessageSquare,
  Plus,
  Users,
  Video,
} from 'lucide-react';
import { ChatConversation, DirectoryProfile, Meeting, UserPrivateProfile } from '../types';

interface DashboardProps {
  currentUser: UserPrivateProfile;
  meetings: Meeting[];
  chats: ChatConversation[];
  directory: DirectoryProfile[];
  onStartInstantMeeting: () => void;
  onJoinMeeting: (code: string) => void;
  onNavigateTab: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  meetings,
  chats,
  directory,
  onStartInstantMeeting,
  onJoinMeeting,
  onNavigateTab,
}) => {
  const upcomingMeetings = meetings
    .filter((m) => m.status === 'live' || m.status === 'waiting')
    .slice(0, 5);
  const liveMeetings = meetings.filter((m) => m.status === 'live');
  const employeeCount = directory.filter((d) => d.accountType !== 'customer').length;

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src="/assets/aistudio/seven_sunday_app_icon_crcle_c5b9c7db.png"
            alt="7Sunday Meet"
            className="w-12 h-12 rounded-2xl object-cover shadow-sm"
          />
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Welcome, {currentUser.displayName}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {currentUser.role} · {currentUser.department || 'Seven Sunday Ethiopia'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onStartInstantMeeting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-sm"
          >
            <Video className="w-4 h-4" />
            <span>Start Instant Meeting</span>
          </button>
          <button
            onClick={() => onNavigateTab('meetings')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Meeting</span>
          </button>
        </div>
      </div>

      {/* Live Metrics derived purely from Firestore */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Live Meetings</span>
            <Video className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
            {liveMeetings.length}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Scheduled Meetings</span>
            <Calendar className="w-4 h-4 text-sky-500" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
            {meetings.length}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Active Conversations</span>
            <MessageSquare className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
            {chats.length}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Workspace Staff</span>
            <Users className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
            {employeeCount}
          </p>
        </div>
      </div>

      {/* Upcoming Meetings Queue */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Upcoming & Live Meetings</h2>
          <button
            onClick={() => onNavigateTab('meetings')}
            className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
          >
            Open Calendar
          </button>
        </div>

        {upcomingMeetings.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            No upcoming meetings yet. Use "Schedule Meeting" or "Start Instant Meeting" to create one.
          </p>
        ) : (
          <div className="space-y-2.5">
            {upcomingMeetings.map((m) => (
              <div
                key={m.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {m.title}
                    </span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {m.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 tabular-nums">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(m.scheduledStart).toLocaleString()}</span>
                    <span>· Host: {m.hostName}</span>
                  </p>
                </div>

                <button
                  onClick={() => onJoinMeeting(m.code)}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shrink-0"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Join</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
