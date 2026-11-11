export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  isOnline: boolean | null;
  lastSeen: string | null;
  createdAt: string | null;
}

export interface Me extends PublicUser {
  email: string | null;
  isAdmin?: boolean;
}

export type Relationship = 'self' | 'friends' | 'outgoing' | 'incoming' | 'none' | 'blocked';

export interface UserWithRelationship extends PublicUser {
  relationship: Relationship;
  requestId: string | null;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'voice' | 'file' | 'system' | 'call';

export interface Attachment {
  url: string | null;
  name: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
}

export interface Receipt {
  userId: string;
  at: string;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
  senderId: string | null;
  messageType: MessageType;
  content: string;
  attachment: Attachment | null;
  replyTo: {
    id: string;
    senderName: string;
    senderId: string | null;
    content: string;
    messageType: MessageType;
    isDeleted: boolean;
    attachmentName: string | null;
  } | null;
  forwarded: boolean;
  reactions: { userId: string; emoji: string }[];
  deliveredTo: Receipt[];
  readBy: Receipt[];
  editedAt: string | null;
  isDeleted: boolean;
  call: { callId: string; callType: 'audio' | 'video'; status: string; duration: number } | null;
  system: { action: string; actorId: string | null; targetIds: string[]; value: string | null } | null;
  clientId: string | null;
  createdAt: string;
  // client-only
  localStatus?: 'sending' | 'failed';
  uploadProgress?: number;
  localFile?: File;
}

export interface Conversation {
  id: string;
  type: 'private' | 'group';
  participants: PublicUser[];
  admins: string[];
  createdBy: string;
  groupName: string | null;
  groupDescription: string;
  groupImageUrl: string | null;
  permissions: { onlyAdminsCanMessage: boolean; onlyAdminsCanEditInfo: boolean; onlyAdminsCanAddMembers: boolean };
  pinnedMessageIds: string[];
  lastMessage: Message | null;
  lastMessageAt: string;
  lastReadAt: string | null;
  unreadCount: number;
  createdAt: string;
}

export interface FriendRequest {
  id: string;
  user: PublicUser;
  createdAt: string;
}

export type Visibility = 'everyone' | 'friends' | 'nobody';

export interface UserSettings {
  privacy: {
    lastSeen: Visibility;
    onlineStatus: Visibility;
    friendRequests: 'everyone' | 'nobody';
    calls: 'friends' | 'nobody';
    readReceipts: boolean;
  };
  notifications: {
    messages: boolean;
    groups: boolean;
    calls: boolean;
    friendRequests: boolean;
    showPreview: boolean;
    sound: boolean;
  };
  theme: 'light' | 'dark' | 'system';
}

export interface Session {
  id: string;
  deviceName: string;
  platform: string;
  ip: string | null;
  lastActive: string;
  createdAt: string;
  current: boolean;
}

export interface CallLog {
  id: string;
  direction: 'incoming' | 'outgoing';
  peer: PublicUser | null;
  conversationId: string;
  callType: 'audio' | 'video';
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  duration: number;
  createdAt: string;
}

export interface AppNotification {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  createdAt: string;
}
