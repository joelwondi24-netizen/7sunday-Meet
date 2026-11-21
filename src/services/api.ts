import { auth } from '../lib/firebase';
import { IntegrationEnvStatus } from '../types';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token
    ? {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }
    : {
        'Content-Type': 'application/json',
      };
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const api = {
  async getHealth(): Promise<{ status: string; app: string; activeRooms: number; timestamp: string }> {
    const resp = await fetch('/api/health');
    if (!resp.ok) throw new Error('Server health check failed');
    return resp.json();
  },

  async registerRoomRuntime(params: {
    code: string;
    title?: string;
    meetingScope: 'internal' | 'customer' | 'external';
    callMode?: 'video' | 'audio';
    capacity?: number;
    waitingRoomEnabled?: boolean;
    isLocked?: boolean;
    password?: string;
  }) {
    const headers = await getAuthHeaders();
    const resp = await fetch('/api/rooms/register', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to register room settings');
    }
    return resp.json();
  },

  async getRoomMeta(code: string): Promise<{
    code: string;
    title: string;
    meetingScope: 'internal' | 'customer' | 'external';
    callMode?: 'video' | 'audio';
    capacity?: number;
    waitingRoomEnabled: boolean;
    isLocked: boolean;
    hasPassword: boolean;
    activeParticipants: number;
  }> {
    const resp = await fetch(`/api/rooms/${encodeURIComponent(code)}/meta`);
    if (!resp.ok) throw new Error('Failed to load room details');
    return resp.json();
  },

  async uploadFile(
    file: Blob,
    filename: string
  ): Promise<{ url: string; name: string; sizeBytes: number; mimeType: string }> {
    const headers = await getAuthHeaders();
    const base64Data = await fileToBase64(file);
    const resp = await fetch('/api/files/upload', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filename,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'File upload failed');
    }
    return resp.json();
  },

  async getIntegrationStatus(): Promise<IntegrationEnvStatus> {
    const headers = await getAuthHeaders();
    const resp = await fetch('/api/integrations/status', { headers });
    if (!resp.ok) throw new Error('Failed to check integration status');
    return resp.json();
  },

  async sendMeetingInvite(params: {
    channel: 'telegram' | 'whatsapp' | 'email' | 'sms';
    recipient: string;
    meetingTitle: string;
    meetingCode: string;
    scheduledStart?: string;
    joinUrl: string;
  }): Promise<{ sent: boolean; status: string; message?: string; fallbackUrl?: string }> {
    const headers = await getAuthHeaders();
    const resp = await fetch('/api/integrations/send-invite', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to send invitation');
    }
    return resp.json();
  },

  async syncOrderToDms(order: any): Promise<{ synced: boolean; dmsSyncStatus: string; message?: string }> {
    const headers = await getAuthHeaders();
    const resp = await fetch('/api/dms/sync-order', {
      method: 'POST',
      headers,
      body: JSON.stringify({ order }),
    });
    if (!resp.ok) throw new Error('Failed to sync order with DMS');
    return resp.json();
  },

  async transcribeMeetingAudio(params: {
    audioBlob: Blob;
    meetingCode: string;
    speakerName: string;
    languageHint?: string;
  }): Promise<{ text: string; isEmpty: boolean }> {
    const headers = await getAuthHeaders();
    const audioBase64 = await fileToBase64(params.audioBlob);
    const resp = await fetch('/api/meetings/transcribe', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        audioBase64,
        mimeType: params.audioBlob.type || 'audio/webm',
        meetingCode: params.meetingCode,
        speakerName: params.speakerName,
        languageHint: params.languageHint || 'auto',
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'AI transcription failed');
    }
    return resp.json();
  },

  async summarizeMeetingTranscript(params: {
    meetingCode: string;
    entries: Array<{ speakerName: string; timestampLabel: string; text: string }>;
  }): Promise<{ summary: string }> {
    const headers = await getAuthHeaders();
    const resp = await fetch('/api/meetings/summarize', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'AI summary generation failed');
    }
    return resp.json();
  },
};
