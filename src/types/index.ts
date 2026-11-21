export type AccountType = 'employee' | 'customer' | 'admin';

export type UserRole =
  | 'Super Administrator'
  | 'Company Administrator'
  | 'IT Administrator'
  | 'HR Manager'
  | 'Department Manager'
  | 'Meeting Administrator'
  | 'Meeting Organizer'
  | 'Meeting Moderator'
  | 'Employee'
  | 'Customer Service Agent'
  | 'Customer'
  | 'External Guest';

export const ALL_SYSTEM_ROLES: UserRole[] = [
  'Super Administrator',
  'Company Administrator',
  'IT Administrator',
  'HR Manager',
  'Department Manager',
  'Meeting Administrator',
  'Meeting Organizer',
  'Meeting Moderator',
  'Employee',
  'Customer Service Agent',
  'Customer',
  'External Guest',
];

export type AccountStatus =
  | 'active'
  | 'inactive'
  | 'suspended'
  | 'blocked_temp'
  | 'blocked_perm'
  | 'deleted';

export type PresenceStatus = 'online' | 'in_meeting' | 'away' | 'busy' | 'dnd' | 'offline';

export interface UserPrivateProfile {
  uid: string;
  email: string;
  phone?: string;
  displayName: string;
  accountType: AccountType;
  role: UserRole;
  status: AccountStatus;
  department?: string;
  jobTitle?: string;
  avatarUrl?: string;
  mfaEnabled?: boolean;
  biometricEnabled?: boolean;
  dndMode?: boolean;
  presenceStatus?: PresenceStatus;
  statusMessage?: string;
  blockedUids?: string[];
  contactUids?: string[];
  favoriteUids?: string[];
  lastSyncAt?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface DirectoryProfile {
  uid: string;
  displayName: string;
  accountType: AccountType;
  role: UserRole;
  department?: string;
  jobTitle?: string;
  avatarUrl?: string;
  presenceStatus?: PresenceStatus;
  statusMessage?: string;
  status: AccountStatus;
  updatedAt?: any;
}

export interface UserSession {
  id: string;
  uid: string;
  deviceName: string;
  platform: string;
  authMethod: string;
  revoked: boolean;
  createdAt?: any;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  managerUid?: string;
  createdAt?: any;
}

export interface CustomRole {
  id: string;
  name: string;
  accountScope: AccountType;
  permissions: Record<string, boolean>;
  updatedAt?: any;
}

export type MeetingScope = 'internal' | 'customer' | 'external';
export type MeetingType =
  | 'instant'
  | 'scheduled'
  | 'recurring'
  | 'webinar'
  | 'classroom'
  | 'conference_room'
  | 'virtual_room';
export type MeetingPriority = 'low' | 'normal' | 'high' | 'urgent';
export type MeetingStatus = 'waiting' | 'live' | 'ended' | 'cancelled';
export type RecurrenceRule = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Meeting {
  id: string;
  code: string;
  title: string;
  description?: string;
  agenda?: string;
  meetingScope: MeetingScope;
  type: MeetingType;
  callMode?: 'video' | 'audio';
  capacity?: number;
  isPermanentRoom?: boolean;
  priority: MeetingPriority;
  status: MeetingStatus;
  hostUid: string;
  hostName: string;
  organizerUid?: string;
  moderatorUids?: string[];
  department?: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone?: string;
  recurrenceRule?: RecurrenceRule;
  waitingRoomEnabled?: boolean;
  isLocked?: boolean;
  hasPassword?: boolean;
  allowScreenShare?: boolean;
  allowChat?: boolean;
  allowWhiteboard?: boolean;
  recordingConsentRequired?: boolean;
  participantUids?: string[];
  invitedEmails?: string[];
  documentUrls?: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface MeetingAttendance {
  id: string;
  meetingId: string;
  meetingCode: string;
  meetingTitle?: string;
  participantUid: string;
  participantName: string;
  participantRole?: string;
  joinedAt: string;
  leftAt?: string;
  durationSeconds: number;
  createdAt?: any;
}

export interface MeetingTranscriptEntry {
  id: string;
  meetingCode: string;
  speakerUid: string;
  speakerName: string;
  text: string;
  language?: string;
  source: 'gemini_ai' | 'gemini_summary' | 'manual_note';
  meetingScope: MeetingScope;
  participantUids?: string[];
  timestampLabel: string;
  createdAt?: any;
}

export interface Participant {
  id: string;
  name: string;
  email: string;
  role: 'host' | 'co-host' | 'moderator' | 'participant' | 'student' | 'guest';
  avatar: string;
  isCameraOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isSpeaking: boolean;
  inWaitingRoom?: boolean;
  joinedAt: string;
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface Poll {
  id: string;
  meetingId: string;
  creatorId: string;
  question: string;
  options: { id: string; text: string; votes: number }[];
  totalVotes: number;
  isActive: boolean;
  isAnonymous: boolean;
  userVotedOptionId?: string;
}

export interface WhiteboardStroke {
  id: string;
  type: 'draw' | 'line' | 'rect' | 'circle' | 'arrow' | 'text' | 'eraser' | 'highlighter';
  points: { x: number; y: number }[];
  color: string;
  size: number;
  text?: string;
  userId: string;
}

export type ChatScope =
  | 'employee_dm'
  | 'employee_group'
  | 'customer_dm'
  | 'customer_community'
  | 'support';

export interface ChatConversation {
  id: string;
  chatScope: ChatScope;
  name?: string;
  description?: string;
  memberUids: string[];
  adminUids?: string[];
  assignedAgentUid?: string;
  orderId?: string;
  lastMessage?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderAccountType: AccountType;
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
  edited?: boolean;
  deleted?: boolean;
  moderated?: boolean;
  moderationReason?: string;
  pinned?: boolean;
  bookmarkedByUids?: string[];
  reportedByUids?: string[];
  readByUids?: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface ScheduledMessage {
  id: string;
  chatId: string;
  senderUid: string;
  senderName: string;
  content: string;
  scheduledFor: string;
  status: 'scheduled' | 'sent' | 'cancelled';
  createdAt?: any;
  updatedAt?: any;
}

export type ModerationReason = 'spam' | 'harassment' | 'phishing' | 'inappropriate' | 'other';

export interface ModerationReport {
  id: string;
  chatId: string;
  messageId: string;
  messageContent: string;
  reportedUid: string;
  reportedName: string;
  reporterUid: string;
  reporterName: string;
  reason: ModerationReason;
  details?: string;
  status: 'pending' | 'removed' | 'dismissed';
  reviewedByUid?: string;
  resolutionNote?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface ReportEntry {
  id: string;
  title: string;
  category: string;
  description?: string;
  content: string;
  authorUid: string;
  authorName: string;
  department?: string;
  visibility: 'internal' | 'customer_public';
  pinned?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  description?: string;
  price: number;
  currency: string;
  imageUrl?: string;
  stockStatus: 'in_stock' | 'made_to_order' | 'out_of_stock';
  active: boolean;
  createdByUid: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  customerUid: string;
  customerName: string;
  customerEmail: string;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  shippingAddress?: string;
  notes?: string;
  invoiceNumber?: string;
  dmsSyncStatus?: 'not_configured' | 'queued' | 'synced' | 'error';
  createdAt?: any;
  updatedAt?: any;
}

export interface NotificationItem {
  id: string;
  recipientUid: string;
  senderUid?: string;
  type:
    | 'meeting_reminder'
    | 'meeting_invite'
    | 'meeting_update'
    | 'call_invite'
    | 'message'
    | 'order_update'
    | 'support_reply'
    | 'security_alert';
  callMode?: 'audio' | 'video';
  title: string;
  body: string;
  read: boolean;
  link?: string;
  createdAt?: any;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string;
  details: string;
  createdAt?: any;
}

export interface IntegrationConfig {
  id: string;
  whatsappEnabled?: boolean;
  whatsappBusinessNumber?: string;
  telegramEnabled?: boolean;
  telegramBotUsername?: string;
  emailEnabled?: boolean;
  smtpHost?: string;
  smsEnabled?: boolean;
  smsSenderId?: string;
  sevenSundayDmsEndpoint?: string;
  updatedAt?: any;
}

export interface IntegrationEnvStatus {
  telegramConfigured: boolean;
  whatsappConfigured: boolean;
  emailConfigured: boolean;
  smsConfigured: boolean;
  dmsConfigured: boolean;
}
