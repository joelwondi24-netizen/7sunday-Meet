import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Mail,
  MessageCircle,
  Phone,
  Send,
  Share2,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { IntegrationEnvStatus, Meeting } from '../types';

interface MeetingInviteModalProps {
  meeting: Meeting;
  onClose: () => void;
}

export const MeetingInviteModal: React.FC<MeetingInviteModalProps> = ({ meeting, onClose }) => {
  const [channel, setChannel] = useState<'whatsapp' | 'telegram' | 'email' | 'sms'>('whatsapp');
  const [recipient, setRecipient] = useState('');
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [envStatus, setEnvStatus] = useState<IntegrationEnvStatus | null>(null);

  const joinUrl = `${window.location.origin}/?room=${encodeURIComponent(meeting.code)}`;

  useEffect(() => {
    api.getIntegrationStatus().then(setEnvStatus).catch(() => {});
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(
      `7Sunday Meet Invitation\nMeeting: ${meeting.title}\nCode: ${meeting.code}\nJoin Link: ${joinUrl}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim()) return;
    setSending(true);
    setResultMsg(null);
    try {
      const resp = await api.sendMeetingInvite({
        channel,
        recipient: recipient.trim(),
        meetingTitle: meeting.title,
        meetingCode: meeting.code,
        scheduledStart: new Date(meeting.scheduledStart).toLocaleString(),
        joinUrl,
      });
      if (resp.sent) {
        setResultMsg(`Invitation sent via ${channel.toUpperCase()}.`);
        setRecipient('');
      } else if (resp.fallbackUrl) {
        setResultMsg(resp.message || 'Opening external messaging client...');
        const a = document.createElement('a');
        a.href = resp.fallbackUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
      } else {
        setResultMsg(resp.message || 'Invitation queued.');
      }
    } catch (err: any) {
      setResultMsg(err?.message || 'Failed to send invitation.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl space-y-5 my-auto">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <Share2 className="w-5 h-5 text-sky-500 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">Share Meeting Invitation</h3>
              <p className="text-xs text-slate-500 truncate">{meeting.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Direct Link Copy */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-400">Meeting Code: <strong className="font-mono text-slate-900 dark:text-white">{meeting.code}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={joinUrl}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Multi-Channel Dispatch */}
        <form onSubmit={handleSend} className="space-y-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, configured: envStatus?.whatsappConfigured },
              { id: 'telegram', label: 'Telegram', icon: Send, configured: envStatus?.telegramConfigured },
              { id: 'email', label: 'Email', icon: Mail, configured: envStatus?.emailConfigured },
              { id: 'sms', label: 'SMS', icon: Phone, configured: envStatus?.smsConfigured },
            ].map((ch) => {
              const Icon = ch.icon;
              const active = channel === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setChannel(ch.id as any)}
                  className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-colors ${
                    active
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{ch.label}</span>
                </button>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {channel === 'email'
                ? 'Recipient Email Address'
                : channel === 'telegram'
                ? 'Telegram Chat ID or Username'
                : 'Recipient Phone Number (with country code)'}
            </label>
            <input
              type={channel === 'email' ? 'email' : 'text'}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              required
              placeholder={
                channel === 'email'
                  ? 'participant@example.com'
                  : channel === 'telegram'
                  ? '123456789'
                  : '+251911000000'
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
            />
          </div>

          {resultMsg && (
            <p className="text-xs text-sky-600 dark:text-sky-400 bg-sky-500/10 border border-sky-500/30 rounded-xl p-2.5">
              {resultMsg}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={sending}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              {sending ? 'Sending...' : `Send via ${channel.toUpperCase()}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
