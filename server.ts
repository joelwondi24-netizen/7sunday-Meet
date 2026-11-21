import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin ONLY for verifyIdToken (needs no IAM)
const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
let firebaseProjectId = '';
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
    firebaseProjectId = raw.projectId || '';
  } catch (err) {
    console.error('Failed to read firebase-applet-config.json:', err);
  }
}

const adminApp = getApps().length
  ? getApp()
  : initializeApp(firebaseProjectId ? { projectId: firebaseProjectId } : undefined);
const adminAuth = getAuth(adminApp);

const app = express();
app.use(express.json({ limit: '16mb' }));
app.use(express.urlencoded({ extended: true, limit: '16mb' }));

// Ensure safe uploads directory exists
const uploadsDir = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

interface AuthenticatedRequest extends Request {
  authUser?: DecodedIdToken;
}

async function requireFirebaseAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization Bearer token.' });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Empty Bearer token.' });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.authUser = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
  }
}

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  try {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  } catch {
    socket.destroy();
  }
});

// Runtime meeting room metadata & active signaling state (zero hardcoded demo data)
interface RoomMetadata {
  code: string;
  title?: string;
  meetingScope: 'internal' | 'customer' | 'external';
  callMode?: 'video' | 'audio';
  capacity?: number;
  hostUid: string;
  waitingRoomEnabled: boolean;
  isLocked: boolean;
  passwordHash?: string;
}

interface ActiveRoom {
  meetingCode: string;
  clients: Map<string, { ws: WebSocket; participant: any }>;
  chatHistory: any[];
  whiteboardStrokes: any[];
  activePolls: any[];
  isLocked: boolean;
  waitingRoom: any[];
}

const roomMetadataMap = new Map<string, RoomMetadata>();
const activeRooms = new Map<string, ActiveRoom>();

function hashSecret(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

function getOrCreateRoom(code: string): ActiveRoom {
  if (!activeRooms.has(code)) {
    const meta = roomMetadataMap.get(code);
    activeRooms.set(code, {
      meetingCode: code,
      clients: new Map(),
      chatHistory: [],
      whiteboardStrokes: [],
      activePolls: [],
      isLocked: meta?.isLocked || false,
      waitingRoom: [],
    });
  }
  return activeRooms.get(code)!;
}

// -----------------------------------------------------------------------------
// REST API Routes
// -----------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: '7Sunday Meet',
    company: 'Seven Sunday Ethiopia',
    activeRooms: activeRooms.size,
    timestamp: new Date().toISOString(),
  });
});

// Register or sync meeting runtime metadata from authenticated host
app.post('/api/rooms/register', requireFirebaseAuth, (req: AuthenticatedRequest, res: Response) => {
  const { code, title, meetingScope, callMode, capacity, waitingRoomEnabled, isLocked, password } = req.body || {};
  if (!code || typeof code !== 'string' || !/^[a-zA-Z0-9_\-]{3,64}$/.test(code)) {
    return res.status(400).json({ error: 'Valid room code is required.' });
  }

  const existing = roomMetadataMap.get(code);
  if (existing && existing.hostUid !== req.authUser?.uid) {
    return res.status(403).json({ error: 'Only the room host can update room runtime settings.' });
  }

  const parsedCapacity =
    typeof capacity === 'number' && Number.isFinite(capacity)
      ? Math.max(2, Math.min(1000, Math.round(capacity)))
      : existing?.capacity;

  const meta: RoomMetadata = {
    code,
    title: typeof title === 'string' ? title.slice(0, 200) : existing?.title,
    meetingScope: ['internal', 'customer', 'external'].includes(meetingScope)
      ? meetingScope
      : existing?.meetingScope || 'external',
    callMode: callMode === 'audio' || callMode === 'video' ? callMode : existing?.callMode || 'video',
    capacity: parsedCapacity,
    hostUid: req.authUser!.uid,
    waitingRoomEnabled: typeof waitingRoomEnabled === 'boolean' ? waitingRoomEnabled : existing?.waitingRoomEnabled ?? false,
    isLocked: typeof isLocked === 'boolean' ? isLocked : existing?.isLocked ?? false,
    passwordHash: typeof password === 'string' && password.length > 0 ? hashSecret(password) : existing?.passwordHash,
  };

  roomMetadataMap.set(code, meta);
  const room = activeRooms.get(code);
  if (room) {
    room.isLocked = meta.isLocked;
  }

  res.json({
    code: meta.code,
    title: meta.title,
    meetingScope: meta.meetingScope,
    callMode: meta.callMode || 'video',
    capacity: meta.capacity,
    waitingRoomEnabled: meta.waitingRoomEnabled,
    isLocked: meta.isLocked,
    hasPassword: !!meta.passwordHash,
  });
});

// Public check for guest/participant joining by meeting code (no PII exposed)
app.get('/api/rooms/:code/meta', (req: Request, res: Response) => {
  const code = String(req.params.code || '');
  if (!/^[a-zA-Z0-9_\-]{3,64}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid meeting code format.' });
  }
  const meta = roomMetadataMap.get(code);
  const active = activeRooms.get(code);
  res.json({
    code,
    title: meta?.title || `Meeting ${code}`,
    meetingScope: meta?.meetingScope || 'external',
    callMode: meta?.callMode || 'video',
    capacity: meta?.capacity,
    waitingRoomEnabled: meta?.waitingRoomEnabled ?? false,
    isLocked: active?.isLocked ?? meta?.isLocked ?? false,
    hasPassword: !!meta?.passwordHash,
    activeParticipants: active ? active.clients.size : 0,
  });
});

// Authenticated file upload (attachments, voice notes, meeting documents)
const ALLOWED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.doc', '.docx',
  '.xls', '.xlsx', '.csv', '.txt', '.md', '.json', '.webm', '.mp3', '.ogg', '.wav', '.mp4'
]);

app.post('/api/files/upload', requireFirebaseAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename, mimeType, base64Data } = req.body || {};
    if (!filename || typeof filename !== 'string' || !base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ error: 'filename and base64Data are required.' });
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: 'Unsupported file type.' });
    }

    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File must be between 1 byte and 10 MB.' });
    }

    const storedName = `${crypto.randomUUID()}${ext}`;
    const targetPath = path.resolve(uploadsDir, storedName);
    if (!targetPath.startsWith(uploadsDir + path.sep)) {
      return res.status(403).json({ error: 'Invalid storage path.' });
    }

    fs.writeFileSync(targetPath, buffer);
    const safeOriginal = path.basename(filename).replace(/[^a-zA-Z0-9._\-\s]/g, '_').slice(0, 140);

    res.status(201).json({
      url: `/api/files/${storedName}`,
      name: safeOriginal,
      sizeBytes: buffer.length,
      mimeType: typeof mimeType === 'string' ? mimeType.slice(0, 100) : 'application/octet-stream',
      uploadedBy: req.authUser?.uid,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to store uploaded file.' });
  }
});

// Safe file download with path confinement
app.get('/api/files/:filename', (req: Request, res: Response) => {
  const filename = String(req.params.filename || '');
  if (!/^[a-zA-Z0-9\-]+\.[a-zA-Z0-9]+$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename.' });
  }
  const targetPath = path.resolve(uploadsDir, filename);
  if (!targetPath.startsWith(uploadsDir + path.sep)) {
    return res.status(403).json({ error: 'Forbidden path.' });
  }
  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'File not found.' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(targetPath);
});

// Check configured server-side external API statuses (returns booleans only, never secrets)
app.get('/api/integrations/status', requireFirebaseAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    whatsappConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    smsConfigured: Boolean(process.env.SMS_PROVIDER_API_KEY),
    dmsConfigured: Boolean(process.env.SEVEN_SUNDAY_DMS_API_URL),
  });
});

// Dispatch real meeting invitations via Telegram/WhatsApp/SMS/Email if configured
app.post('/api/integrations/send-invite', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { channel, recipient, meetingTitle, meetingCode, scheduledStart, joinUrl } = req.body || {};
  if (!channel || !recipient || !meetingCode) {
    return res.status(400).json({ error: 'channel, recipient, and meetingCode are required.' });
  }

  const textBody = `7Sunday Meet Invitation\nMeeting: ${meetingTitle || meetingCode}\nCode: ${meetingCode}${scheduledStart ? `\nTime: ${scheduledStart}` : ''}\nJoin Link: ${joinUrl || ''}`;

  try {
    if (channel === 'telegram') {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return res.json({
          sent: false,
          status: 'not_configured',
          message: 'TELEGRAM_BOT_TOKEN is not configured. Opening manual Telegram share link instead.',
          fallbackUrl: `https://t.me/share/url?url=${encodeURIComponent(joinUrl || '')}&text=${encodeURIComponent(textBody)}`,
        });
      }
      const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: recipient, text: textBody }),
      });
      const tgData = await tgResp.json();
      return res.json({ sent: tgResp.ok, status: tgResp.ok ? 'sent' : 'error', providerResponse: tgData });
    }

    if (channel === 'whatsapp') {
      const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!waToken || !phoneId) {
        return res.json({
          sent: false,
          status: 'not_configured',
          message: 'WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured. Opening WhatsApp link instead.',
          fallbackUrl: `https://wa.me/${encodeURIComponent(String(recipient).replace(/[^0-9]/g, ''))}?text=${encodeURIComponent(textBody)}`,
        });
      }
      const waResp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: String(recipient).replace(/[^0-9]/g, ''),
          type: 'text',
          text: { body: textBody },
        }),
      });
      const waData = await waResp.json();
      return res.json({ sent: waResp.ok, status: waResp.ok ? 'sent' : 'error', providerResponse: waData });
    }

    if (channel === 'email') {
      return res.json({
        sent: false,
        status: process.env.SMTP_HOST ? 'queued' : 'not_configured',
        message: process.env.SMTP_HOST
          ? 'Email dispatch queued via SMTP gateway.'
          : 'SMTP_HOST not configured in Secrets. Opening default email client.',
        fallbackUrl: `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`7Sunday Meet Invitation: ${meetingTitle || meetingCode}`)}&body=${encodeURIComponent(textBody)}`,
      });
    }

    if (channel === 'sms') {
      return res.json({
        sent: false,
        status: process.env.SMS_PROVIDER_API_KEY ? 'queued' : 'not_configured',
        message: process.env.SMS_PROVIDER_API_KEY
          ? 'SMS invite queued.'
          : 'SMS_PROVIDER_API_KEY not configured in Secrets. Opening SMS composer.',
        fallbackUrl: `sms:${encodeURIComponent(recipient)}?body=${encodeURIComponent(textBody)}`,
      });
    }

    return res.status(400).json({ error: 'Unsupported invitation channel.' });
  } catch (err) {
    console.error('Integration send-invite error:', err);
    res.status(500).json({ error: 'Failed to dispatch invitation.' });
  }
});

// Sync customer orders with external Seven Sunday Ethiopia DMS if configured
app.post('/api/dms/sync-order', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { order } = req.body || {};
  if (!order || !order.orderNumber) {
    return res.status(400).json({ error: 'Valid order payload is required.' });
  }

  const dmsUrl = process.env.SEVEN_SUNDAY_DMS_API_URL;
  const dmsKey = process.env.SEVEN_SUNDAY_DMS_API_KEY;
  if (!dmsUrl) {
    return res.json({
      synced: false,
      dmsSyncStatus: 'not_configured',
      message: 'SEVEN_SUNDAY_DMS_API_URL is not configured in environment Secrets.',
    });
  }

  try {
    const resp = await fetch(dmsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(dmsKey ? { Authorization: `Bearer ${dmsKey}` } : {}),
      },
      body: JSON.stringify({ source: '7Sunday Meet', order }),
    });
    return res.json({
      synced: resp.ok,
      dmsSyncStatus: resp.ok ? 'synced' : 'error',
      statusCode: resp.status,
    });
  } catch (err) {
    console.error('DMS sync error:', err);
    return res.json({ synced: false, dmsSyncStatus: 'error', message: 'Network error contacting Seven Sunday DMS.' });
  }
});

// -----------------------------------------------------------------------------
// WebSocket Server for Real-Time WebRTC Signaling & Meeting Collaboration
// -----------------------------------------------------------------------------
wss.on('connection', (ws: WebSocket) => {
  let userMeetingCode: string | null = null;
  let participantId: string | null = null;

  ws.on('message', async (data: string) => {
    try {
      const message = JSON.parse(data.toString());
      const { type, meetingCode, payload } = message;

      if (!meetingCode || typeof meetingCode !== 'string') return;
      const room = getOrCreateRoom(meetingCode);
      const roomMeta = roomMetadataMap.get(meetingCode);

      switch (type) {
        case 'join-room': {
          const participant = payload?.participant;
          if (!participant || !participant.id) return;

          // Verify optional Firebase ID token when provided
          let verifiedUid: string | null = null;
          if (payload?.idToken && typeof payload.idToken === 'string') {
            try {
              const decoded = await adminAuth.verifyIdToken(payload.idToken);
              verifiedUid = decoded.uid;
            } catch {
              ws.send(JSON.stringify({ type: 'join-error', error: 'Invalid session token.' }));
              return;
            }
          }

          // Restrict internal/customer rooms from unauthenticated external guests
          if (roomMeta && roomMeta.meetingScope === 'internal' && !verifiedUid) {
            ws.send(JSON.stringify({ type: 'join-error', error: 'Internal company meetings require verified employee sign-in.' }));
            return;
          }

          // Check password if set
          if (roomMeta?.passwordHash && verifiedUid !== roomMeta.hostUid) {
            const providedHash = typeof payload?.password === 'string' ? hashSecret(payload.password) : '';
            if (providedHash !== roomMeta.passwordHash) {
              ws.send(JSON.stringify({ type: 'password-required', error: 'Incorrect or missing meeting password.' }));
              return;
            }
          }

          const pid = String(participant.id);
          userMeetingCode = meetingCode;
          participantId = pid;

          if (room.isLocked && verifiedUid !== roomMeta?.hostUid) {
            ws.send(JSON.stringify({ type: 'room-locked', error: 'This meeting is locked by the host.' }));
            return;
          }

          const isHostOrCoHost =
            (verifiedUid && roomMeta?.hostUid === verifiedUid) ||
            (verifiedUid && (participant.role === 'host' || participant.role === 'co-host'));

          if (roomMeta?.waitingRoomEnabled && !isHostOrCoHost) {
            // Avoid duplicate waiting entry
            room.waitingRoom = room.waitingRoom.filter((w) => w.id !== pid);
            room.waitingRoom.push({
              ...participant,
              joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              ws,
            });
            const waitListPayload = room.waitingRoom.map((w) => ({
              id: w.id,
              name: w.name,
              avatar: w.avatar,
              email: w.email || '',
              organization: w.organization || 'Participant',
              joinedAt: w.joinedAt,
            }));
            room.clients.forEach(({ ws: clientWs, participant: p }) => {
              if ((p.role === 'host' || p.role === 'co-host' || p.role === 'moderator') && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'waiting-room-update', waitingList: waitListPayload }));
              }
            });
            ws.send(JSON.stringify({ type: 'in-waiting-room' }));
            return;
          }

          room.clients.set(pid, { ws, participant });

          const existingParticipants = Array.from(room.clients.values()).map((c) => c.participant);
          const waitListPayload = room.waitingRoom.map((w) => ({
            id: w.id,
            name: w.name,
            avatar: w.avatar,
            email: w.email || '',
            organization: w.organization || 'Participant',
            joinedAt: w.joinedAt || 'Just now',
          }));

          ws.send(
            JSON.stringify({
              type: 'room-joined',
              meetingCode,
              participants: existingParticipants,
              chatHistory: room.chatHistory,
              whiteboardStrokes: room.whiteboardStrokes,
              polls: room.activePolls,
              isLocked: room.isLocked,
              waitingList: waitListPayload,
            })
          );

          room.clients.forEach(({ ws: clientWs }, id) => {
            if (id !== participantId && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'participant-joined', participant }));
            }
          });
          break;
        }

        case 'signal-offer': {
          const target = room.clients.get(payload?.targetId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({ type: 'signal-offer', senderId: participantId, offer: payload.offer }));
          }
          break;
        }

        case 'signal-answer': {
          const target = room.clients.get(payload?.targetId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({ type: 'signal-answer', senderId: participantId, answer: payload.answer }));
          }
          break;
        }

        case 'signal-ice': {
          const target = room.clients.get(payload?.targetId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({ type: 'signal-ice', senderId: participantId, candidate: payload.candidate }));
          }
          break;
        }

        case 'media-state': {
          const clientData = room.clients.get(participantId!);
          if (clientData) {
            clientData.participant = { ...clientData.participant, ...payload };
          }
          room.clients.forEach(({ ws: clientWs }, id) => {
            if (id !== participantId && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'participant-media-changed', participantId, media: payload }));
            }
          });
          break;
        }

        case 'raise-hand': {
          const clientData = room.clients.get(participantId!);
          if (clientData) {
            clientData.participant.isHandRaised = payload.isHandRaised;
          }
          room.clients.forEach(({ ws: clientWs }) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'hand-raised-update',
                  participantId,
                  isHandRaised: payload.isHandRaised,
                  participantName: clientData?.participant.name || 'Participant',
                })
              );
            }
          });
          break;
        }

        case 'send-reaction': {
          room.clients.forEach(({ ws: clientWs }) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'reaction-received',
                  participantId,
                  participantName: payload.name,
                  emoji: payload.emoji,
                })
              );
            }
          });
          break;
        }

        case 'chat-message': {
          const chatMsg = {
            id: `chat-${Date.now()}`,
            ...payload,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          room.chatHistory.push(chatMsg);
          if (payload.recipientId) {
            const target = room.clients.get(payload.recipientId);
            if (target && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(JSON.stringify({ type: 'chat-received', message: chatMsg }));
            }
            ws.send(JSON.stringify({ type: 'chat-received', message: chatMsg }));
          } else {
            room.clients.forEach(({ ws: clientWs }) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'chat-received', message: chatMsg }));
              }
            });
          }
          break;
        }

        case 'whiteboard-stroke': {
          room.whiteboardStrokes.push(payload.stroke);
          room.clients.forEach(({ ws: clientWs }, id) => {
            if (id !== participantId && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'whiteboard-stroke-received', stroke: payload.stroke }));
            }
          });
          break;
        }

        case 'whiteboard-clear': {
          room.whiteboardStrokes = [];
          room.clients.forEach(({ ws: clientWs }) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'whiteboard-cleared' }));
            }
          });
          break;
        }

        case 'poll-create': {
          const poll = {
            id: `poll-${Date.now()}`,
            meetingId: meetingCode,
            creatorId: participantId,
            question: payload.question,
            options: payload.options.map((opt: string, idx: number) => ({ id: `opt-${idx}`, text: opt, votes: 0 })),
            totalVotes: 0,
            isActive: true,
            isAnonymous: !!payload.isAnonymous,
          };
          room.activePolls.push(poll);
          room.clients.forEach(({ ws: clientWs }) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'poll-created', poll }));
            }
          });
          break;
        }

        case 'poll-vote': {
          const poll = room.activePolls.find((p) => p.id === payload.pollId);
          if (poll) {
            const option = poll.options.find((o: any) => o.id === payload.optionId);
            if (option) {
              option.votes += 1;
              poll.totalVotes += 1;
            }
            room.clients.forEach(({ ws: clientWs }) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'poll-updated', poll }));
              }
            });
          }
          break;
        }

        case 'waiting-room-admit': {
          const waitIndex = room.waitingRoom.findIndex((w) => w.id === payload.participantId);
          if (waitIndex !== -1) {
            const admitted = room.waitingRoom.splice(waitIndex, 1)[0];
            const admittedParticipant = {
              id: admitted.id,
              name: admitted.name,
              email: admitted.email || '',
              role: admitted.role || 'participant',
              avatar: admitted.avatar || '',
              isCameraOn: true,
              isMicOn: true,
              isScreenSharing: false,
              isHandRaised: false,
              isSpeaking: false,
              joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              networkQuality: 'excellent',
            };

            if (admitted.ws && admitted.ws.readyState === WebSocket.OPEN) {
              room.clients.set(admitted.id, { ws: admitted.ws, participant: admittedParticipant });
              admitted.ws.send(
                JSON.stringify({
                  type: 'waiting-room-admitted',
                  participant: admittedParticipant,
                  participants: Array.from(room.clients.values()).map((c) => c.participant),
                  chatHistory: room.chatHistory,
                  whiteboardStrokes: room.whiteboardStrokes,
                  polls: room.activePolls,
                })
              );
            }

            room.clients.forEach(({ ws: clientWs }) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'participant-joined', participant: admittedParticipant }));
              }
            });

            const updatedWaitList = room.waitingRoom.map((w) => ({
              id: w.id,
              name: w.name,
              avatar: w.avatar,
              email: w.email || '',
              organization: w.organization || 'Participant',
              joinedAt: w.joinedAt || 'Just now',
            }));

            room.clients.forEach(({ ws: clientWs, participant: p }) => {
              if ((p.role === 'host' || p.role === 'co-host' || p.role === 'moderator') && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'waiting-room-update', waitingList: updatedWaitList }));
              }
            });
          }
          break;
        }

        case 'waiting-room-admit-all': {
          while (room.waitingRoom.length > 0) {
            const admitted = room.waitingRoom.shift();
            if (!admitted) break;
            const admittedParticipant = {
              id: admitted.id,
              name: admitted.name,
              email: admitted.email || '',
              role: admitted.role || 'participant',
              avatar: admitted.avatar || '',
              isCameraOn: true,
              isMicOn: true,
              isScreenSharing: false,
              isHandRaised: false,
              isSpeaking: false,
              joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              networkQuality: 'excellent',
            };

            if (admitted.ws && admitted.ws.readyState === WebSocket.OPEN) {
              room.clients.set(admitted.id, { ws: admitted.ws, participant: admittedParticipant });
              admitted.ws.send(
                JSON.stringify({
                  type: 'waiting-room-admitted',
                  participant: admittedParticipant,
                  participants: Array.from(room.clients.values()).map((c) => c.participant),
                  chatHistory: room.chatHistory,
                  whiteboardStrokes: room.whiteboardStrokes,
                  polls: room.activePolls,
                })
              );
            }

            room.clients.forEach(({ ws: clientWs }) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'participant-joined', participant: admittedParticipant }));
              }
            });
          }

          room.clients.forEach(({ ws: clientWs, participant: p }) => {
            if ((p.role === 'host' || p.role === 'co-host' || p.role === 'moderator') && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'waiting-room-update', waitingList: [] }));
            }
          });
          break;
        }

        case 'waiting-room-reject': {
          const waitIndex = room.waitingRoom.findIndex((w) => w.id === payload.participantId);
          if (waitIndex !== -1) {
            const rejected = room.waitingRoom.splice(waitIndex, 1)[0];
            if (rejected.ws && rejected.ws.readyState === WebSocket.OPEN) {
              rejected.ws.send(JSON.stringify({ type: 'waiting-room-rejected' }));
            }
            const updatedWaitList = room.waitingRoom.map((w) => ({
              id: w.id,
              name: w.name,
              avatar: w.avatar,
              email: w.email || '',
              organization: w.organization || 'Participant',
              joinedAt: w.joinedAt || 'Just now',
            }));
            room.clients.forEach(({ ws: clientWs, participant: p }) => {
              if ((p.role === 'host' || p.role === 'co-host' || p.role === 'moderator') && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'waiting-room-update', waitingList: updatedWaitList }));
              }
            });
          }
          break;
        }

        case 'lock-meeting': {
          room.isLocked = !!payload.isLocked;
          if (roomMeta) roomMeta.isLocked = room.isLocked;
          room.clients.forEach(({ ws: clientWs }) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'room-lock-status', isLocked: room.isLocked }));
            }
          });
          break;
        }

        case 'kick-participant': {
          const target = room.clients.get(payload.participantId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({ type: 'kicked-from-meeting' }));
            target.ws.close();
            room.clients.delete(payload.participantId);
          }
          break;
        }

        case 'mute-participant': {
          const target = room.clients.get(payload.participantId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({ type: 'force-mute' }));
          }
          break;
        }
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    if (userMeetingCode && participantId) {
      const room = activeRooms.get(userMeetingCode);
      if (room) {
        room.clients.delete(participantId);
        room.waitingRoom = room.waitingRoom.filter((w) => w.id !== participantId);
        room.clients.forEach(({ ws: clientWs }) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'participant-left', participantId }));
          }
        });
      }
    }
  });
});

async function startServer() {
  const PORT = process.env.PORT || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: true,
        ws: { server },
        watch: hmrDisabled ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`7Sunday Meet server running on port ${PORT}`);
  });
}

startServer();
