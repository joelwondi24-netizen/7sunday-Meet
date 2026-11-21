import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Download,
  Eye,
  File as FileIcon,
  FileText,
  Hand,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Paperclip,
  PenTool,
  Phone,
  PhoneOff,
  Search,
  Send,
  Smile,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  Video,
  VideoOff,
  X,
  XCircle,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { api } from '../services/api';
import {
  deleteMeetingTranscriptEntry,
  makeId,
  recordMeetingAttendanceJoin,
  recordMeetingAttendanceLeave,
  saveMeetingTranscriptEntry,
  subscribeMeetingTranscripts,
  updateOwnProfile,
} from '../services/firestoreService';
import { realtime } from '../services/websocket';
import {
  AccountType,
  MeetingScope,
  MeetingTranscriptEntry,
  Participant,
  Poll,
  PresenceStatus,
} from '../types';
import { DocumentPreviewModal, formatFileSize } from './DocumentPreviewModal';
import { Whiteboard } from './Whiteboard';

interface MeetingRoomProps {
  meetingCode: string;
  meetingScope?: MeetingScope;
  currentUser: {
    uid: string;
    displayName: string;
    email: string;
    role: string;
    accountType?: AccountType;
    avatarUrl?: string;
    isAuthenticated: boolean;
    dndMode?: boolean;
    presenceStatus?: PresenceStatus;
  };
  initialPassword?: string;
  initialCallMode?: 'video' | 'audio';
  onPresenceChange?: (status: PresenceStatus) => void;
  onLeave: () => void;
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({
  meetingCode,
  meetingScope,
  currentUser,
  initialPassword,
  initialCallMode = 'video',
  onPresenceChange,
  onLeave,
}) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  const [callMode, setCallMode] = useState<'video' | 'audio'>(initialCallMode);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(initialCallMode === 'video');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingConsentAccepted, setRecordingConsentAccepted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [inWaitingRoom, setInWaitingRoom] = useState(false);
  const [waitingList, setWaitingList] = useState<any[]>([]);
  const [passwordNeeded, setPasswordNeeded] = useState(false);
  const [roomPassword, setRoomPassword] = useState(initialPassword || '');
  const [joinError, setJoinError] = useState<string | null>(null);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const participantsRef = useRef<Participant[]>([]);
  const [activeSidePanel, setActiveSidePanel] = useState<'none' | 'chat' | 'participants' | 'polls' | 'transcript'>('none');
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; name: string }[]>([]);

  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{
    url: string;
    name: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null>(null);

  const [polls, setPolls] = useState<Poll[]>([]);
  const [newPollQuestion, setNewPollQuestion] = useState('');
  const [newPollOptions] = useState(['Yes', 'No']);

  // Live AI Transcript state
  const [resolvedScope, setResolvedScope] = useState<MeetingScope>(
    meetingScope || (currentUser.accountType === 'customer' ? 'customer' : 'external')
  );
  const [firestoreTranscripts, setFirestoreTranscripts] = useState<MeetingTranscriptEntry[]>([]);
  const [wsTranscripts, setWsTranscripts] = useState<MeetingTranscriptEntry[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessingChunk, setIsProcessingChunk] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [transcriptLanguage, setTranscriptLanguage] = useState<'auto' | 'English' | 'Amharic'>('auto');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [manualNoteInput, setManualNoteInput] = useState('');
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  const attendanceIdRef = useRef<string | null>(null);
  const joinTimeMsRef = useRef<number>(Date.now());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const isHostOrMod =
    currentUser.isAuthenticated &&
    [
      'Super Administrator',
      'Company Administrator',
      'Meeting Administrator',
      'Meeting Organizer',
      'Meeting Moderator',
      'Department Manager',
    ].includes(currentUser.role);

  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Automatically set authenticated user's presenceStatus to 'in_meeting' during call
  useEffect(() => {
    if (!currentUser.isAuthenticated) return;
    const prevPresence: PresenceStatus = currentUser.dndMode
      ? 'dnd'
      : currentUser.presenceStatus && currentUser.presenceStatus !== 'in_meeting'
      ? currentUser.presenceStatus
      : 'online';

    if (!currentUser.dndMode) {
      updateOwnProfile(currentUser.uid, { presenceStatus: 'in_meeting' }).catch(() => {});
      onPresenceChange?.('in_meeting');
    }

    return () => {
      if (!currentUser.dndMode) {
        updateOwnProfile(currentUser.uid, { presenceStatus: prevPresence }).catch(() => {});
        onPresenceChange?.(prevPresence);
      }
    };
  }, [currentUser.uid, currentUser.isAuthenticated]);

  const formatDuration = (totalSec: number) => {
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const renegotiateAllPeers = async () => {
    for (const [targetId, pc] of peerConnectionsRef.current.entries()) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        realtime.send('signal-offer', meetingCode, { targetId, offer });
      } catch {
        // ignore transient renegotiation race
      }
    }
  };

  // Start local camera/mic (or audio-only in Voice mode) + connect signaling
  useEffect(() => {
    let mounted = true;
    let resolvedCallMode = initialCallMode;

    const init = async () => {
      try {
        const meta = await api.getRoomMeta(meetingCode).catch(() => null);
        if (meta?.meetingScope && !meetingScope) {
          setResolvedScope(
            currentUser.accountType === 'customer' && meta.meetingScope === 'internal'
              ? 'customer'
              : meta.meetingScope
          );
        }
        if (meta?.callMode === 'audio' && initialCallMode !== 'video') {
          resolvedCallMode = 'audio';
          setCallMode('audio');
          setIsCameraOn(false);
        }
      } catch {
        // ignore
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: resolvedCallMode === 'video',
          audio: true,
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsCameraOn(stream.getVideoTracks().length > 0);
        setIsMicOn(stream.getAudioTracks().length > 0);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch {
        setIsCameraOn(false);
        setIsMicOn(false);
      }

      const idToken = currentUser.isAuthenticated
        ? await auth.currentUser?.getIdToken().catch(() => null)
        : null;

      realtime.connect();
      realtime.joinRoom(
        meetingCode,
        {
          id: currentUser.uid,
          name: currentUser.displayName,
          email: currentUser.email,
          role: isHostOrMod ? 'host' : currentUser.isAuthenticated ? 'participant' : 'guest',
          avatar: currentUser.avatarUrl || '',
          isCameraOn: resolvedCallMode === 'video',
          isMicOn: true,
          isScreenSharing: false,
          isHandRaised: false,
          isSpeaking: false,
          joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          networkQuality: 'excellent',
        },
        { idToken, password: roomPassword || undefined }
      );

      if (currentUser.isAuthenticated) {
        recordMeetingAttendanceJoin(meetingCode, meetingCode, `Meeting ${meetingCode}`, {
          uid: currentUser.uid,
          name: currentUser.displayName,
          role: currentUser.role,
        })
          .then((attId) => {
            attendanceIdRef.current = attId;
          })
          .catch(() => {});
      }
    };

    init();

    const createPeer = (targetId: string, initiator: boolean) => {
      if (peerConnectionsRef.current.has(targetId)) {
        return peerConnectionsRef.current.get(targetId)!;
      }
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      const activeLocal = localStreamRef.current;
      if (activeLocal) {
        activeLocal.getTracks().forEach((track) => pc.addTrack(track, activeLocal));
      }
      const activeScreen = screenStreamRef.current;
      if (activeScreen) {
        activeScreen.getVideoTracks().forEach((scrTrack) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(scrTrack);
          else pc.addTrack(scrTrack, activeScreen);
        });
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          realtime.send('signal-ice', meetingCode, { targetId, candidate: e.candidate });
        }
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0] || new MediaStream([e.track]);
        setRemoteStreams((prev) => ({ ...prev, [targetId]: stream }));
      };
      peerConnectionsRef.current.set(targetId, pc);

      if (initiator) {
        pc.createOffer().then((offer) => {
          pc.setLocalDescription(offer);
          realtime.send('signal-offer', meetingCode, { targetId, offer });
        });
      }
      return pc;
    };

    const uJoined = realtime.on('room-joined', (data) => {
      setInWaitingRoom(false);
      setPasswordNeeded(false);
      setParticipants(data.participants || []);
      setMessages(data.chatHistory || []);
      if (Array.isArray(data.transcripts)) setWsTranscripts(data.transcripts);
      setPolls(data.polls || []);
      setIsLocked(Boolean(data.isLocked));
      setWaitingList(data.waitingList || []);
    });

    const uWait = realtime.on('in-waiting-room', () => setInWaitingRoom(true));
    const uPass = realtime.on('password-required', (d) => {
      setPasswordNeeded(true);
      setJoinError(d.error || 'Meeting password required');
    });
    const uLocked = realtime.on('room-locked', (d) => setJoinError(d.error || 'Meeting is locked.'));
    const uErr = realtime.on('join-error', (d) => setJoinError(d.error || 'Unable to join room.'));

    const uAdmitted = realtime.on('waiting-room-admitted', (data) => {
      setInWaitingRoom(false);
      setParticipants(data.participants || []);
      setMessages(data.chatHistory || []);
      if (Array.isArray(data.transcripts)) setWsTranscripts(data.transcripts);
      setPolls(data.polls || []);
    });

    const uRejected = realtime.on('waiting-room-rejected', () => {
      setInWaitingRoom(false);
      setJoinError('The host declined entry to this meeting.');
    });

    const uWaitList = realtime.on('waiting-room-update', (data) => setWaitingList(data.waitingList || []));

    const uPeerJoin = realtime.on('participant-joined', (data) => {
      if (!data.participant) return;
      setParticipants((prev) =>
        prev.some((p) => p.id === data.participant.id) ? prev : [...prev, data.participant]
      );
      if (data.participant.id !== currentUser.uid) {
        createPeer(data.participant.id, true);
      }
    });

    const uPeerMedia = realtime.on('participant-media-changed', (data) => {
      if (!data.participantId || !data.media) return;
      setParticipants((prev) =>
        prev.map((p) => (p.id === data.participantId ? { ...p, ...data.media } : p))
      );
    });

    const uPeerLeave = realtime.on('participant-left', (data) => {
      setParticipants((prev) => prev.filter((p) => p.id !== data.participantId));
      const pc = peerConnectionsRef.current.get(data.participantId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(data.participantId);
      }
      setRemoteStreams((prev) => {
        const copy = { ...prev };
        delete copy[data.participantId];
        return copy;
      });
    });

    const uOffer = realtime.on('signal-offer', async (data) => {
      const pc = createPeer(data.senderId, false);
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      realtime.send('signal-answer', meetingCode, { targetId: data.senderId, answer });
    });

    const uAnswer = realtime.on('signal-answer', async (data) => {
      const pc = peerConnectionsRef.current.get(data.senderId);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    const uIce = realtime.on('signal-ice', async (data) => {
      const pc = peerConnectionsRef.current.get(data.senderId);
      if (pc && data.candidate) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    const uChat = realtime.on('chat-received', (data) => {
      if (data.message) setMessages((prev) => [...prev, data.message]);
    });

    const uPollCreated = realtime.on('poll-created', (data) => {
      if (data.poll) setPolls((prev) => [...prev, data.poll]);
    });

    const uPollUpdated = realtime.on('poll-updated', (data) => {
      if (data.poll) setPolls((prev) => prev.map((p) => (p.id === data.poll.id ? data.poll : p)));
    });

    const uReaction = realtime.on('reaction-received', (data) => {
      const id = `${Date.now()}-${Math.random()}`;
      setFloatingReactions((prev) => [...prev, { id, emoji: data.emoji, name: data.participantName }]);
      setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 3000);
    });

    const uForceMute = realtime.on('force-mute', () => {
      if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
      setIsMicOn(false);
    });

    const uKicked = realtime.on('kicked-from-meeting', () => {
      onLeave();
    });

    const uTranscript = realtime.on('transcript-entry-added', (data) => {
      if (data.entry) {
        setWsTranscripts((prev) =>
          prev.some((e) => e.id === data.entry.id) ? prev : [...prev, data.entry]
        );
      }
    });

    const uLockStatus = realtime.on('room-lock-status', (d) => setIsLocked(Boolean(d.isLocked)));

    return () => {
      mounted = false;
      uJoined();
      uWait();
      uPass();
      uLocked();
      uErr();
      uAdmitted();
      uRejected();
      uWaitList();
      uPeerJoin();
      uPeerMedia();
      uPeerLeave();
      uOffer();
      uAnswer();
      uIce();
      uChat();
      uPollCreated();
      uPollUpdated();
      uReaction();
      uForceMute();
      uKicked();
      uTranscript();
      uLockStatus();

      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop());
      realtime.leaveRoom(meetingCode, currentUser.uid);

      if (attendanceIdRef.current) {
        const dur = (Date.now() - joinTimeMsRef.current) / 1000;
        recordMeetingAttendanceLeave(attendanceIdRef.current, dur).catch(() => {});
      }
    };
  }, [meetingCode]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // Subscribe to persistent Firestore live transcript entries for authenticated participants
  useEffect(() => {
    if (!currentUser.isAuthenticated) return;
    const unsub = subscribeMeetingTranscripts(
      meetingCode,
      { uid: currentUser.uid, accountType: currentUser.accountType },
      (entries) => setFirestoreTranscripts(entries)
    );
    return () => unsub();
  }, [meetingCode, currentUser.uid, currentUser.isAuthenticated, currentUser.accountType]);

  // Merged chronological transcript feed (Firestore authoritative + real-time WebSocket fallback)
  const mergedTranscripts: MeetingTranscriptEntry[] = React.useMemo(() => {
    const map = new Map<string, MeetingTranscriptEntry>();
    wsTranscripts.forEach((e) => map.set(e.id, e));
    firestoreTranscripts.forEach((e) => map.set(e.id, e));
    return Array.from(map.values()).sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      if (ta && tb && ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
  }, [firestoreTranscripts, wsTranscripts]);

  useEffect(() => {
    if (activeSidePanel === 'transcript') {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mergedTranscripts.length, activeSidePanel]);

  const persistAndBroadcastTranscript = async (
    text: string,
    source: 'gemini_ai' | 'gemini_summary' | 'manual_note',
    speakerNameOverride?: string
  ) => {
    const id = makeId('trn');
    const timestampLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const participantUids = Array.from(
      new Set([
        currentUser.uid,
        ...participantsRef.current.filter((p) => p.role !== 'guest').map((p) => p.id),
      ])
    );

    const localEntry: MeetingTranscriptEntry = {
      id,
      meetingCode,
      speakerUid: currentUser.uid,
      speakerName: speakerNameOverride || currentUser.displayName,
      text,
      language: transcriptLanguage,
      source,
      meetingScope: resolvedScope,
      participantUids,
      timestampLabel,
    };

    setWsTranscripts((prev) => (prev.some((e) => e.id === id) ? prev : [...prev, localEntry]));
    realtime.send('transcript-entry', meetingCode, { entry: localEntry });

    if (currentUser.isAuthenticated) {
      await saveMeetingTranscriptEntry({
        id,
        meetingCode,
        speakerUid: currentUser.uid,
        speakerName: speakerNameOverride || currentUser.displayName,
        text,
        language: transcriptLanguage,
        source,
        meetingScope: resolvedScope,
        participantUids,
        timestampLabel,
      });
    }
  };

  // Rolling AI audio chunk capture & Gemini transcription loop
  useEffect(() => {
    if (!isTranscribing || !currentUser.isAuthenticated || !isMicOn) return;
    const activeAudioTrack = localStreamRef.current?.getAudioTracks().find((t) => t.readyState === 'live');
    if (!activeAudioTrack) return;

    let cancelled = false;
    let sliceRecorder: MediaRecorder | null = null;
    let sliceTimeout: ReturnType<typeof setTimeout> | null = null;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let rmsInterval: ReturnType<typeof setInterval> | null = null;
    let maxRms = 0;

    const audioOnlyStream = new MediaStream([activeAudioTrack]);
    const preferredMime =
      ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
      ) || '';

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        const source = audioCtx.createMediaStreamSource(audioOnlyStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        rmsInterval = setInterval(() => {
          if (!analyser) return;
          analyser.getByteTimeDomainData(samples);
          let sumSq = 0;
          for (let i = 0; i < samples.length; i++) {
            const norm = (samples[i] - 128) / 128;
            sumSq += norm * norm;
          }
          const rms = Math.sqrt(sumSq / samples.length);
          if (rms > maxRms) maxRms = rms;
        }, 120);
      }
    } catch {
      // Fallback without WebAudio RMS gating
    }

    const startNextSlice = () => {
      if (cancelled || typeof MediaRecorder === 'undefined') return;
      maxRms = 0;
      const chunks: Blob[] = [];
      try {
        sliceRecorder = preferredMime
          ? new MediaRecorder(audioOnlyStream, { mimeType: preferredMime })
          : new MediaRecorder(audioOnlyStream);
      } catch {
        setTranscriptError('Audio recording for AI transcription is not supported in this browser.');
        setIsTranscribing(false);
        return;
      }

      sliceRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      sliceRecorder.onstop = async () => {
        const hadVoiceEnergy = !analyser || maxRms > 0.005;
        const blob = new Blob(chunks, { type: sliceRecorder?.mimeType || preferredMime || 'audio/webm' });

        if (!cancelled) {
          startNextSlice();
        }

        if (!hadVoiceEnergy || blob.size < 1800) {
          return;
        }

        setIsProcessingChunk(true);
        try {
          const result = await api.transcribeMeetingAudio({
            audioBlob: blob,
            meetingCode,
            speakerName: currentUser.displayName,
            languageHint: transcriptLanguage,
          });
          setTranscriptError(null);
          if (!result.isEmpty && result.text.trim()) {
            await persistAndBroadcastTranscript(result.text.trim(), 'gemini_ai');
          }
        } catch (err: any) {
          setTranscriptError(err?.message || 'AI transcription failed.');
        } finally {
          setIsProcessingChunk(false);
        }
      };

      sliceRecorder.start();
      sliceTimeout = setTimeout(() => {
        if (sliceRecorder && sliceRecorder.state === 'recording') {
          sliceRecorder.stop();
        }
      }, 5500);
    };

    startNextSlice();

    return () => {
      cancelled = true;
      if (sliceTimeout) clearTimeout(sliceTimeout);
      if (rmsInterval) clearInterval(rmsInterval);
      if (sliceRecorder && sliceRecorder.state === 'recording') {
        try {
          sliceRecorder.stop();
        } catch {
          // ignore stop race
        }
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [isTranscribing, isMicOn, localStream, meetingCode, transcriptLanguage, currentUser.isAuthenticated]);

  const toggleMic = () => {
    if (!localStream) return;
    const next = !isMicOn;
    localStream.getAudioTracks().forEach((t) => (t.enabled = next));
    setIsMicOn(next);
    realtime.send('media-state', meetingCode, { isMicOn: next });
  };

  const toggleCamera = async () => {
    const next = !isCameraOn;
    // Upgrade from Audio-Only Voice Call to Video Call on demand
    if (next && (!localStreamRef.current || localStreamRef.current.getVideoTracks().length === 0)) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const camTrack = camStream.getVideoTracks()[0];
        const base = localStreamRef.current || new MediaStream();
        base.addTrack(camTrack);
        localStreamRef.current = base;
        setLocalStream(new MediaStream(base.getTracks()));
        if (localVideoRef.current) localVideoRef.current.srcObject = base;
        setCallMode('video');
        setIsCameraOn(true);

        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(camTrack);
          } else {
            pc.addTrack(camTrack, base);
          }
        });
        await renegotiateAllPeers();
        realtime.send('media-state', meetingCode, { isCameraOn: true });
      } catch {
        setIsCameraOn(false);
      }
      return;
    }

    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = next));
    setIsCameraOn(next);
    if (next) setCallMode('video');
    realtime.send('media-state', meetingCode, { isCameraOn: next });
  };

  const stopScreenShareAndRestore = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setIsScreenSharing(false);

    const camTrack = isCameraOn ? localStreamRef.current?.getVideoTracks()[0] || null : null;
    let needsRenegotiate = false;
    peerConnectionsRef.current.forEach((pc) => {
      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        if (camTrack) {
          videoSender.replaceTrack(camTrack);
        } else {
          pc.removeTrack(videoSender);
          needsRenegotiate = true;
        }
      }
    });
    if (needsRenegotiate) await renegotiateAllPeers();
    realtime.send('media-state', meetingCode, { isScreenSharing: false });
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShareAndRestore();
      return;
    }
    try {
      const scr = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const scrTrack = scr.getVideoTracks()[0];
      screenStreamRef.current = scr;
      setScreenStream(scr);
      setIsScreenSharing(true);
      if (screenVideoRef.current) screenVideoRef.current.srcObject = scr;

      // Transmit shared screen track over WebRTC to all connected peers
      let needsRenegotiate = false;
      peerConnectionsRef.current.forEach((pc) => {
        const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(scrTrack);
        } else {
          pc.addTrack(scrTrack, scr);
          needsRenegotiate = true;
        }
      });
      if (needsRenegotiate) await renegotiateAllPeers();

      scrTrack.onended = () => {
        stopScreenShareAndRestore();
      };
      realtime.send('media-state', meetingCode, { isScreenSharing: true });
    } catch {
      // user cancelled
    }
  };

  const toggleRecording = () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    if (!localStream) return;
    if (!recordingConsentAccepted) {
      setRecordingConsentAccepted(true);
    }
    recordedChunksRef.current = [];
    const rec = new MediaRecorder(localStream);
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `7Sunday-Meet-${meetingCode}-${Date.now()}.webm`;
      a.click();
    };
    rec.start();
    mediaRecorderRef.current = rec;
    setIsRecording(true);
  };

  const handleInMeetingFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const uploaded = await api.uploadFile(file, file.name);
      realtime.send('chat-message', meetingCode, {
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        content: `Shared file: ${uploaded.name}`,
        attachmentUrl: uploaded.url,
        attachmentName: uploaded.name,
        attachmentType: uploaded.mimeType,
        attachmentSizeBytes: uploaded.sizeBytes,
      });
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleCopyInvite = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/?room=${meetingCode}&mode=${callMode}`
    );
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const retryJoinWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    const idToken = currentUser.isAuthenticated
      ? await auth.currentUser?.getIdToken().catch(() => null)
      : null;
    realtime.joinRoom(
      meetingCode,
      {
        id: currentUser.uid,
        name: currentUser.displayName,
        email: currentUser.email,
        role: isHostOrMod ? 'host' : currentUser.isAuthenticated ? 'participant' : 'guest',
        avatar: currentUser.avatarUrl || '',
        isCameraOn,
        isMicOn,
        isScreenSharing: false,
        isHandRaised: false,
        isSpeaking: false,
        joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        networkQuality: 'excellent',
      },
      { idToken, password: roomPassword }
    );
  };

  if (passwordNeeded) {
    return (
      <div className="min-h-[100dvh] w-full bg-slate-950 text-white flex items-center justify-center p-4 sm:p-6">
        <form
          onSubmit={retryJoinWithPassword}
          className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
        >
          <h2 className="text-base font-bold">Meeting Password Required</h2>
          {joinError && <p className="text-xs text-rose-400">{joinError}</p>}
          <input
            type="password"
            required
            value={roomPassword}
            onChange={(e) => setRoomPassword(e.target.value)}
            placeholder="Enter meeting password"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" onClick={onLeave} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-xs font-semibold">
              Cancel
            </button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-sky-600 text-xs font-bold">
              Join Room
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (inWaitingRoom) {
    return (
      <div className="min-h-[100dvh] w-full bg-slate-950 text-white flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-4">
          <img
            src="/assets/aistudio/seven_sunday_app_icon_crcle_c5b9c7db.png"
            alt="7Sunday Meet"
            className="w-14 h-14 rounded-2xl mx-auto"
          />
          <h2 className="text-lg font-extrabold">Waiting Room</h2>
          <p className="text-xs text-slate-400">
            Please wait — the host of <strong>{meetingCode}</strong> will admit you shortly.
          </p>
          <button onClick={onLeave} className="px-5 py-2.5 rounded-xl bg-rose-600 text-xs font-bold">
            Leave Waiting Room
          </button>
        </div>
      </div>
    );
  }

  const remoteList = participants.filter((p) => p.id !== currentUser.uid);

  return (
    <div className="h-[100dvh] w-full pt-[env(safe-area-inset-top)] bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none">
      {/* Top Bar */}
      <header className="min-h-[3.25rem] px-3 sm:px-4 py-1.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-2 sm:gap-3 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img
            src="/assets/aistudio/seven_sunday_app_icon_crcle_c5b9c7db.png"
            alt="7Sunday Meet"
            className="w-7 h-7 rounded-lg shrink-0"
          />
          <span className="font-bold text-xs sm:text-sm truncate">
            <span className="hidden sm:inline">7Sunday Meet · </span>
            {meetingCode}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
              callMode === 'audio' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-sky-500/20 text-sky-300'
            }`}
          >
            {callMode === 'audio' ? <Phone className="w-3 h-3" /> : <Video className="w-3 h-3" />}
            <span className="hidden xs:inline sm:inline">{callMode === 'audio' ? 'Voice' : 'Video'}</span>
          </span>
          {isLocked && (
            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold shrink-0">
              <Lock className="w-3 h-3" />
              <span className="hidden md:inline">Locked</span>
            </span>
          )}
          {isRecording && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600/20 text-rose-400 text-[10px] font-bold animate-pulse shrink-0">
              REC<span className="hidden md:inline"> (Consent Active)</span>
            </span>
          )}
          {isTranscribing && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold shrink-0">
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span className="hidden sm:inline">AI Transcript</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="font-mono text-[11px] sm:text-xs text-slate-400 flex items-center gap-1 tabular-nums">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            {formatDuration(elapsedSeconds)}
          </span>
          <button
            onClick={handleCopyInvite}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
            title="Copy Meeting Invite Link"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
          </button>
        </div>
      </header>

      {joinError && (
        <div className="bg-rose-600/20 border-b border-rose-500/30 px-3 sm:px-4 py-2 text-xs text-rose-300 flex items-center justify-between gap-2 shrink-0">
          <span className="truncate">{joinError}</span>
          <button onClick={onLeave} className="underline font-bold shrink-0">
            Return
          </button>
        </div>
      )}

      {/* Stage + Optional Side Panel */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <main className="flex-1 min-w-0 p-2.5 sm:p-4 overflow-y-auto flex flex-col gap-3 sm:gap-4 relative">
          {/* Floating Reactions */}
          <div className="pointer-events-none fixed bottom-24 left-3 sm:left-6 z-40 space-y-1">
            {floatingReactions.map((r) => (
              <div key={r.id} className="px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700 text-sm shadow-lg">
                {r.emoji} <span className="text-xs text-slate-300">{r.name}</span>
              </div>
            ))}
          </div>

          {showWhiteboard ? (
            <div className="flex-1 min-h-[260px] rounded-2xl overflow-hidden border border-slate-800">
              <Whiteboard
                meetingCode={meetingCode}
                currentUser={{ uid: currentUser.uid, displayName: currentUser.displayName }}
              />
            </div>
          ) : (
            <div
              className={`flex-1 grid gap-2.5 sm:gap-4 auto-rows-fr ${
                remoteList.length === 0 && !isScreenSharing
                  ? 'grid-cols-1'
                  : remoteList.length === 1 && !isScreenSharing
                  ? 'grid-cols-1 md:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {isScreenSharing && (
                <div className="sm:col-span-2 lg:col-span-2 relative rounded-2xl overflow-hidden bg-slate-900 border border-sky-500/40 flex items-center justify-center min-h-[180px] sm:min-h-[240px]">
                  <video ref={screenVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
                  <span className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-slate-950/80 text-[11px] sm:text-xs font-semibold">
                    Your Shared Screen (Broadcasting Live)
                  </span>
                </div>
              )}

              {/* Local Video / Voice Tile */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center min-h-[160px] sm:min-h-[220px]">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${isCameraOn ? '' : 'hidden'}`}
                />
                {!isCameraOn && (
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={`w-20 h-20 rounded-full font-bold text-xl flex items-center justify-center ${
                        isMicOn ? 'bg-emerald-600/20 text-emerald-400 ring-2 ring-emerald-500/40' : 'bg-sky-600/20 text-sky-400'
                      }`}
                    >
                      {currentUser.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {callMode === 'audio' ? 'Voice Call Connected' : 'Camera Off'}
                    </span>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 text-xs font-semibold truncate">
                    {currentUser.displayName} (You)
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isHandRaised && <Hand className="w-4 h-4 text-amber-400" />}
                    {!isMicOn && <MicOff className="w-4 h-4 text-rose-400" />}
                  </div>
                </div>
              </div>

              {/* Remote Real Peers */}
              {remoteList.map((peer) => {
                const stream = remoteStreams[peer.id];
                const hasVideo = stream && stream.getVideoTracks().some((t) => t.enabled);
                return (
                  <div
                    key={peer.id}
                    className={`relative rounded-2xl overflow-hidden bg-slate-900 border flex items-center justify-center min-h-[160px] sm:min-h-[220px] ${
                      peer.isScreenSharing ? 'sm:col-span-2 border-sky-500/50' : 'border-slate-800'
                    }`}
                  >
                    {stream && (
                      <video
                        autoPlay
                        playsInline
                        ref={(el) => {
                          if (el && el.srcObject !== stream) el.srcObject = stream;
                        }}
                        className={`w-full h-full ${peer.isScreenSharing ? 'object-contain' : 'object-cover'} ${
                          hasVideo || peer.isScreenSharing ? '' : 'hidden'
                        }`}
                      />
                    )}
                    {(!stream || (!hasVideo && !peer.isScreenSharing)) && (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-20 h-20 rounded-full bg-slate-800 text-slate-300 font-bold text-xl flex items-center justify-center">
                          {peer.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {peer.isMicOn ? 'Audio Active' : 'Muted'}
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 text-xs font-semibold truncate">
                        {peer.name} {peer.isScreenSharing ? '· Sharing Screen' : ''}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {peer.isHandRaised && <Hand className="w-4 h-4 text-amber-400" />}
                        {!peer.isMicOn && <MicOff className="w-4 h-4 text-rose-400" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* Side Drawer: full-stage overlay on <md screens, right column on md+ */}
        {activeSidePanel !== 'none' && (
          <aside className="fixed inset-x-0 top-[calc(3.25rem+env(safe-area-inset-top))] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 md:static md:inset-auto md:w-80 lg:w-96 max-w-full bg-slate-900 border-l border-slate-800 flex flex-col shrink-0">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {activeSidePanel}
              </span>
              <button
                onClick={() => setActiveSidePanel('none')}
                className="p-1.5 rounded-lg hover:bg-slate-800"
                aria-label="Close panel"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {activeSidePanel === 'participants' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {isHostOrMod && waitingList.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                      <span>Waiting Room ({waitingList.length})</span>
                      <button
                        onClick={() => realtime.send('waiting-room-admit-all', meetingCode, {})}
                        className="underline text-[11px]"
                      >
                        Admit All
                      </button>
                    </div>
                    {waitingList.map((w) => (
                      <div key={w.id} className="flex items-center justify-between text-xs bg-slate-950/70 p-2 rounded-lg">
                        <span className="truncate">{w.name}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => realtime.send('waiting-room-admit', meetingCode, { participantId: w.id })}
                            className="p-1 text-emerald-400"
                            title="Admit"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => realtime.send('waiting-room-reject', meetingCode, { participantId: w.id })}
                            className="p-1 text-rose-400"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  {participants.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-500">{p.role}</p>
                      </div>
                      {isHostOrMod && p.id !== currentUser.uid && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => realtime.send('mute-participant', meetingCode, { participantId: p.id })}
                            className="px-2 py-1 rounded bg-slate-800 text-[10px]"
                          >
                            Mute
                          </button>
                          <button
                            onClick={() => realtime.send('kick-participant', meetingCode, { participantId: p.id })}
                            className="px-2 py-1 rounded bg-rose-600/20 text-rose-400 text-[10px]"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSidePanel === 'chat' && (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {messages.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      No in-meeting messages yet. Share messages or transfer files below.
                    </p>
                  ) : (
                    messages.map((m: any) => (
                      <div key={m.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span className="font-bold text-sky-400">{m.senderName}</span>
                          <span>{m.timestamp}</span>
                        </div>
                        <p className="text-slate-200 whitespace-pre-wrap">{m.content}</p>
                        {m.attachmentUrl && (
                          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <FileIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold truncate">{m.attachmentName || 'File'}</p>
                                {m.attachmentSizeBytes && (
                                  <p className="text-[10px] text-slate-400">{formatFileSize(m.attachmentSizeBytes)}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() =>
                                  setPreviewDoc({
                                    url: m.attachmentUrl,
                                    name: m.attachmentName || 'Document',
                                    mimeType: m.attachmentType,
                                    sizeBytes: m.attachmentSizeBytes,
                                  })
                                }
                                className="p-1.5 rounded bg-sky-600/20 text-sky-400 hover:bg-sky-600 hover:text-white"
                                title="Preview Document"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <a
                                href={m.attachmentUrl}
                                download={m.attachmentName || 'download'}
                                className="p-1.5 rounded bg-slate-800 text-slate-300 hover:text-white"
                                title="Download"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chatInput.trim()) return;
                    realtime.send('chat-message', meetingCode, {
                      senderId: currentUser.uid,
                      senderName: currentUser.displayName,
                      content: chatInput.trim(),
                    });
                    setChatInput('');
                  }}
                  className="p-3 border-t border-slate-800 flex items-center gap-2"
                >
                  {currentUser.isAuthenticated && (
                    <label
                      className="cursor-pointer p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0"
                      title="Share File in Meeting"
                    >
                      <Paperclip className="w-4 h-4" />
                      <input
                        type="file"
                        onChange={handleInMeetingFileUpload}
                        disabled={uploadingFile}
                        className="hidden"
                      />
                    </label>
                  )}
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={uploadingFile ? 'Uploading file...' : 'Send message...'}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                  />
                  <button type="submit" className="p-2 rounded-xl bg-sky-600 text-white shrink-0">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            )}

            {activeSidePanel === 'polls' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {isHostOrMod && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newPollQuestion.trim()) return;
                      realtime.send('poll-create', meetingCode, {
                        question: newPollQuestion.trim(),
                        options: newPollOptions.filter(Boolean),
                      });
                      setNewPollQuestion('');
                    }}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs"
                  >
                    <input
                      type="text"
                      value={newPollQuestion}
                      onChange={(e) => setNewPollQuestion(e.target.value)}
                      placeholder="Ask a live poll question..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
                    />
                    <button type="submit" className="w-full py-1.5 rounded-lg bg-sky-600 font-bold">
                      Launch Poll
                    </button>
                  </form>
                )}

                {polls.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">No live polls yet.</p>
                ) : (
                  polls.map((poll) => (
                    <div key={poll.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                      <p className="font-bold">{poll.question}</p>
                      {poll.options.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => realtime.send('poll-vote', meetingCode, { pollId: poll.id, optionId: opt.id })}
                          className="w-full flex justify-between px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800"
                        >
                          <span>{opt.text}</span>
                          <span className="font-mono text-sky-400 tabular-nums">{opt.votes}</span>
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeSidePanel === 'transcript' && (
              <>
                {/* AI Transcription Controls Bar */}
                <div className="p-3 border-b border-slate-800 bg-slate-950/60 space-y-2.5 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {currentUser.isAuthenticated ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTranscriptError(null);
                          if (!isTranscribing && !localStreamRef.current?.getAudioTracks().length) {
                            setTranscriptError('Microphone audio track is required to capture AI transcription.');
                            return;
                          }
                          setIsTranscribing((v) => !v);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                          isTranscribing
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-sky-600 hover:bg-sky-500 text-white'
                        }`}
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-pulse' : ''}`} />
                        <span>{isTranscribing ? 'Stop AI Capture' : 'Start AI Transcript'}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        Viewing live meeting transcript
                      </span>
                    )}

                    <div className="flex items-center gap-1.5">
                      {currentUser.isAuthenticated && (
                        <select
                          value={transcriptLanguage}
                          onChange={(e) => setTranscriptLanguage(e.target.value as 'auto' | 'English' | 'Amharic')}
                          className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-200 focus:outline-none"
                          title="Spoken language hint"
                        >
                          <option value="auto">Auto Lang</option>
                          <option value="English">English</option>
                          <option value="Amharic">Amharic</option>
                        </select>
                      )}

                      {currentUser.isAuthenticated && mergedTranscripts.length > 0 && (
                        <button
                          type="button"
                          disabled={isSummarizing}
                          onClick={async () => {
                            setIsSummarizing(true);
                            setTranscriptError(null);
                            try {
                              const { summary } = await api.summarizeMeetingTranscript({
                                meetingCode,
                                entries: mergedTranscripts.map((e) => ({
                                  speakerName: e.speakerName,
                                  timestampLabel: e.timestampLabel,
                                  text: e.text,
                                })),
                              });
                              await persistAndBroadcastTranscript(summary, 'gemini_summary', '7Sunday AI Summary');
                            } catch (err: any) {
                              setTranscriptError(err?.message || 'Unable to generate AI summary.');
                            } finally {
                              setIsSummarizing(false);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-[11px] font-semibold disabled:opacity-50"
                          title="Generate AI Summary & Action Items"
                        >
                          {isSummarizing ? 'Summarizing...' : 'AI Summary'}
                        </button>
                      )}

                      {mergedTranscripts.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const content = mergedTranscripts
                              .map((e) => `[${e.timestampLabel}] ${e.speakerName} (${e.source}):\n${e.text}`)
                              .join('\n\n');
                            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `7Sunday-Transcript-${meetingCode}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title="Download Transcript (.txt)"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Status / Mic Indicator */}
                  {isTranscribing && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isMicOn ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                        {!isMicOn
                          ? 'Mic muted — unmute to transcribe'
                          : isProcessingChunk
                          ? 'Gemini AI transcribing speech...'
                          : 'Listening & saving to Firestore'}
                      </span>
                    </div>
                  )}

                  {transcriptError && (
                    <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-[11px] text-rose-300">
                      {transcriptError}
                    </div>
                  )}

                  {/* Transcript Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      value={transcriptSearch}
                      onChange={(e) => setTranscriptSearch(e.target.value)}
                      placeholder="Search transcript or speaker..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Live Transcript Feed */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {mergedTranscripts.length === 0 ? (
                    <div className="text-center py-8 px-3 space-y-2">
                      <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs font-semibold text-slate-300">No transcript entries yet</p>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        {currentUser.isAuthenticated
                          ? 'Click "Start AI Transcript" above to capture live speech with Gemini AI and save directly to Firestore.'
                          : 'Transcript entries captured by meeting participants will appear here live.'}
                      </p>
                    </div>
                  ) : (
                    mergedTranscripts
                      .filter((entry) => {
                        if (!transcriptSearch.trim()) return true;
                        const q = transcriptSearch.trim().toLowerCase();
                        return (
                          entry.text.toLowerCase().includes(q) ||
                          entry.speakerName.toLowerCase().includes(q)
                        );
                      })
                      .map((entry) => {
                        const isSummary = entry.source === 'gemini_summary';
                        const isManual = entry.source === 'manual_note';
                        return (
                          <div
                            key={entry.id}
                            className={`p-2.5 rounded-xl border text-xs space-y-1.5 ${
                              isSummary
                                ? 'bg-indigo-950/40 border-indigo-500/40'
                                : 'bg-slate-950 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[10px]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`font-bold truncate ${isSummary ? 'text-indigo-300' : 'text-sky-400'}`}>
                                  {entry.speakerName}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[9px] uppercase font-semibold shrink-0">
                                  {isSummary ? 'AI Summary' : isManual ? 'Note' : 'AI'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 text-slate-500">
                                <span className="tabular-nums">{entry.timestampLabel}</span>
                                {currentUser.isAuthenticated &&
                                  (entry.speakerUid === currentUser.uid ||
                                    ['Super Administrator', 'Company Administrator'].includes(currentUser.role)) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setWsTranscripts((prev) => prev.filter((e) => e.id !== entry.id));
                                        deleteMeetingTranscriptEntry(entry.id).catch(() => {});
                                      }}
                                      className="p-0.5 text-slate-500 hover:text-rose-400"
                                      title="Delete transcript entry"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                              </div>
                            </div>
                            <p className="text-slate-200 whitespace-pre-wrap leading-relaxed break-words">
                              {entry.text}
                            </p>
                          </div>
                        );
                      })
                  )}
                  <div ref={transcriptEndRef} />
                </div>

                {/* Timestamped Manual Note Composer (Authenticated Users) */}
                {currentUser.isAuthenticated && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!manualNoteInput.trim()) return;
                      const note = manualNoteInput.trim();
                      setManualNoteInput('');
                      try {
                        await persistAndBroadcastTranscript(note, 'manual_note');
                      } catch (err: any) {
                        setTranscriptError(err?.message || 'Failed to save transcript note.');
                      }
                    }}
                    className="p-3 border-t border-slate-800 flex items-center gap-2 shrink-0"
                  >
                    <input
                      type="text"
                      value={manualNoteInput}
                      onChange={(e) => setManualNoteInput(e.target.value)}
                      placeholder="Add manual note to transcript..."
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                    />
                    <button type="submit" className="p-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white shrink-0" title="Save Note">
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </>
            )}
          </aside>
        )}
      </div>

      {/* Floating Reactions Picker (placed outside scroll footer so it never clips) */}
      {showReactions && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex gap-2 p-2 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl">
          {['👍', '👏', '🎉', '❤️', '🔥'].map((em) => (
            <button
              key={em}
              onClick={() => {
                realtime.send('send-reaction', meetingCode, { name: currentUser.displayName, emoji: em });
                setShowReactions(false);
              }}
              className="text-xl hover:scale-125 transition-transform px-1.5 py-0.5"
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {/* Bottom Controls */}
      <footer className="min-h-[4.5rem] px-3 sm:px-4 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] bg-slate-900 border-t border-slate-800 flex items-center justify-start sm:justify-center gap-2 sm:gap-2.5 shrink-0 overflow-x-auto">
        <button
          onClick={toggleMic}
          className={`p-3 rounded-2xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${isMicOn ? 'bg-slate-800 hover:bg-slate-700' : 'bg-rose-600 text-white'}`}
          title="Microphone"
        >
          {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleCamera}
          className={`p-3 rounded-2xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${isCameraOn ? 'bg-slate-800 hover:bg-slate-700' : 'bg-rose-600 text-white'}`}
          title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera / Upgrade to Video'}
        >
          {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleScreenShare}
          className={`p-3 rounded-2xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${isScreenSharing ? 'bg-sky-600 text-white' : 'bg-slate-800 hover:bg-slate-700'}`}
          title="Share Screen (Live WebRTC)"
        >
          {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        <button
          onClick={() => setShowWhiteboard((s) => !s)}
          className={`p-3 rounded-2xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${showWhiteboard ? 'bg-sky-600 text-white' : 'bg-slate-800 hover:bg-slate-700'}`}
          title="Whiteboard"
        >
          <PenTool className="w-5 h-5" />
        </button>

        <button
          onClick={toggleRecording}
          className={`px-3.5 py-2.5 rounded-2xl shrink-0 min-h-[44px] text-xs font-bold whitespace-nowrap transition-colors ${
            isRecording ? 'bg-rose-600 text-white' : 'bg-slate-800 hover:bg-slate-700'
          }`}
          title="Record Meeting Locally"
        >
          {isRecording ? 'Stop Rec' : 'Record'}
        </button>

        <button
          onClick={() => {
            const next = !isHandRaised;
            setIsHandRaised(next);
            realtime.send('raise-hand', meetingCode, { isHandRaised: next });
          }}
          className={`p-3 rounded-2xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${isHandRaised ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700'}`}
          title="Raise Hand"
        >
          <Hand className="w-5 h-5" />
        </button>

        <button
          onClick={() => setShowReactions((s) => !s)}
          className={`p-3 rounded-2xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${showReactions ? 'bg-sky-600 text-white' : 'bg-slate-800 hover:bg-slate-700'}`}
          title="Reactions"
        >
          <Smile className="w-5 h-5" />
        </button>

        <button
          onClick={() => setActiveSidePanel((p) => (p === 'chat' ? 'none' : 'chat'))}
          className={`p-3 rounded-2xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${activeSidePanel === 'chat' ? 'bg-sky-600' : 'bg-slate-800 hover:bg-slate-700'}`}
          title="Chat & File Transfer"
        >
          <MessageSquare className="w-5 h-5" />
        </button>

        <button
          onClick={() => setActiveSidePanel((p) => (p === 'participants' ? 'none' : 'participants'))}
          className={`relative p-3 rounded-2xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${
            activeSidePanel === 'participants' ? 'bg-sky-600' : 'bg-slate-800 hover:bg-slate-700'
          }`}
          title="Participants & Waiting Room"
        >
          <Users className="w-5 h-5" />
          {waitingList.length > 0 && isHostOrMod && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
              {waitingList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSidePanel((p) => (p === 'polls' ? 'none' : 'polls'))}
          className={`p-3 rounded-2xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${activeSidePanel === 'polls' ? 'bg-sky-600' : 'bg-slate-800 hover:bg-slate-700'}`}
          title="Polls"
        >
          <BarChart3 className="w-5 h-5" />
        </button>

        <button
          onClick={() => setActiveSidePanel((p) => (p === 'transcript' ? 'none' : 'transcript'))}
          className={`relative p-3 rounded-2xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${
            activeSidePanel === 'transcript'
              ? 'bg-sky-600 text-white'
              : isTranscribing
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30'
              : 'bg-slate-800 hover:bg-slate-700'
          }`}
          title="AI Live Transcript"
        >
          <FileText className="w-5 h-5" />
          {isTranscribing && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          )}
        </button>

        {isHostOrMod && (
          <button
            onClick={() => realtime.send('lock-meeting', meetingCode, { isLocked: !isLocked })}
            className={`p-3 rounded-2xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${isLocked ? 'bg-amber-600' : 'bg-slate-800 hover:bg-slate-700'}`}
            title={isLocked ? 'Unlock Meeting' : 'Lock Meeting'}
          >
            {isLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
          </button>
        )}

        <button
          onClick={onLeave}
          className="px-4 py-3 rounded-2xl shrink-0 min-h-[44px] bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <PhoneOff className="w-4 h-4" />
          <span>Leave</span>
        </button>
      </footer>

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
