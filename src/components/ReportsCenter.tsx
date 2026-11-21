import React, { useState } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  FileText,
  Pin,
  Plus,
} from 'lucide-react';
import {
  exportAttendancePDF,
  exportMeetingsExcel,
  exportMeetingsPDF,
  exportOrdersExcel,
} from '../services/exportService';
import { createReportEntry } from '../services/firestoreService';
import {
  CustomerOrder,
  Meeting,
  MeetingAttendance,
  ReportEntry,
  UserPrivateProfile,
} from '../types';

interface ReportsAndAnalyticsProps {
  mode: 'reports' | 'analytics';
  currentUser: UserPrivateProfile;
  reports: ReportEntry[];
  meetings: Meeting[];
  attendance: MeetingAttendance[];
  orders: CustomerOrder[];
}

export const ReportsAndAnalytics: React.FC<ReportsAndAnalyticsProps> = ({
  mode,
  currentUser,
  reports,
  meetings,
  attendance,
  orders,
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Company Report');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'internal' | 'customer_public'>('internal');
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createReportEntry(currentUser, {
        title,
        category,
        description,
        content,
        department: currentUser.department || 'General',
        visibility,
        pinned,
      });
      setShowCreate(false);
      setTitle('');
      setDescription('');
      setContent('');
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'analytics') {
    const totalMinutes = Math.round(
      attendance.reduce((sum, r) => sum + (r.durationSeconds || 0), 0) / 60
    );
    const totalRevenue = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Analytics & Operational Exports
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Real-time metrics computed directly from your Firestore records
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => exportMeetingsPDF(meetings)}
              disabled={meetings.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold disabled:opacity-40"
            >
              <FileText className="w-3.5 h-3.5 text-rose-500" />
              <span>Meetings PDF</span>
            </button>
            <button
              onClick={() => exportMeetingsExcel(meetings)}
              disabled={meetings.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold disabled:opacity-40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
              <span>Meetings Excel</span>
            </button>
            <button
              onClick={() => exportAttendancePDF(attendance)}
              disabled={attendance.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold disabled:opacity-40"
            >
              <FileText className="w-3.5 h-3.5 text-sky-500" />
              <span>Attendance PDF</span>
            </button>
            <button
              onClick={() => exportOrdersExcel(orders)}
              disabled={orders.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold disabled:opacity-40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500" />
              <span>Orders Excel</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500">Total Meetings</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
              {meetings.length}
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500">Attendance Logs</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
              {attendance.length}
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500">Logged Meeting Minutes</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
              {totalMinutes} min
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500">Customer Orders Volume</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
              {totalRevenue.toLocaleString()} ETB
            </p>
          </div>
        </div>

        {/* Attendance Log Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-500" />
            <span>Recent Meeting Attendance</span>
          </h3>
          {attendance.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No meeting attendance logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-xs">
                <thead className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 pr-4">Participant</th>
                    <th className="py-2 pr-4">Meeting Code</th>
                    <th className="py-2 pr-4">Joined</th>
                    <th className="py-2">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {attendance.slice(0, 25).map((rec) => (
                    <tr key={rec.id}>
                      <td className="py-2.5 pr-4 font-semibold">{rec.participantName}</td>
                      <td className="py-2.5 pr-4 font-mono">{rec.meetingCode}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{new Date(rec.joinedAt).toLocaleString()}</td>
                      <td className="py-2.5 tabular-nums">{rec.durationSeconds}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Reports & Announcements</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Internal company announcements and meeting minute records
          </p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
        >
          <Plus className="w-4 h-4" />
          <span>Publish Report</span>
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handlePublish}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Report / Announcement Title"
              className="sm:col-span-2 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold"
            >
              <option value="Company Report">Company Report</option>
              <option value="Announcement">Announcement</option>
              <option value="Meeting Minutes">Meeting Minutes</option>
              <option value="Project Progress">Project Progress</option>
            </select>
          </div>

          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief summary..."
            className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
          />

          <textarea
            rows={4}
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Full report or announcement content..."
            className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-xs font-semibold">
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              >
                <option value="internal">Internal Employees Only</option>
                <option value="customer_public">Visible to Customers Too</option>
              </select>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                <span>Pin Notice</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              {submitting ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </form>
      )}

      {reports.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <FileText className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">No reports published yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((rep) => (
            <div
              key={rep.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {rep.pinned && <Pin className="w-3.5 h-3.5 text-amber-500" />}
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    {rep.category}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">{rep.visibility}</span>
                </div>
                <span className="text-[11px] text-slate-500">By {rep.authorName}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{rep.title}</h3>
              {rep.description && <p className="text-xs text-slate-500">{rep.description}</p>}
              <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line pt-1">{rep.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
