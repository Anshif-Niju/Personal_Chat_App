import { format, formatDistanceToNowStrict, isToday, isYesterday, isThisWeek, isThisYear } from 'date-fns';
import type { Conversation, Message, PublicUser } from '../types';

export function chatListTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';
  if (isThisWeek(d)) return format(d, 'EEEE');
  return format(d, isThisYear(d) ? 'd MMM' : 'dd/MM/yyyy');
}

export const messageTime = (iso: string) => format(new Date(iso), 'HH:mm');

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, isThisYear(d) ? 'EEEE, d MMMM' : 'd MMMM yyyy');
}

export function lastSeenLabel(user: Pick<PublicUser, 'isOnline' | 'lastSeen'> | undefined): string {
  if (!user) return '';
  if (user.isOnline) return 'online';
  if (!user.lastSeen) return '';
  const d = new Date(user.lastSeen);
  if (isToday(d)) return `last seen today at ${format(d, 'HH:mm')}`;
  if (isYesterday(d)) return `last seen yesterday at ${format(d, 'HH:mm')}`;
  return `last seen ${formatDistanceToNowStrict(d, { addSuffix: true })}`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function conversationTitle(c: Conversation, meId: string): string {
  if (c.type === 'group') return c.groupName ?? 'Group';
  return otherParticipant(c, meId)?.displayName ?? 'Deleted account';
}

export function otherParticipant(c: Conversation, meId: string): PublicUser | undefined {
  return c.participants.find((p) => p.id !== meId);
}

export function systemText(m: Message, c: Conversation | undefined, meId: string): string {
  const name = (id: string | null) => {
    if (!id) return 'Someone';
    if (id === meId) return 'You';
    return c?.participants.find((p) => p.id === id)?.displayName ?? 'Someone';
  };
  const s = m.system;
  if (!s) return '';
  const targets = s.targetIds.map(name).join(', ');
  switch (s.action) {
    case 'created':
      return `${name(s.actorId)} created the group "${s.value ?? ''}"`;
    case 'added':
      return `${name(s.actorId)} added ${targets}`;
    case 'removed':
      return `${name(s.actorId)} removed ${targets}`;
    case 'left':
      return `${name(s.actorId)} left`;
    case 'promoted':
      return `${targets} ${s.targetIds.includes(meId) ? 'are' : 'is'} now an admin`;
    case 'demoted':
      return `${targets} ${s.targetIds.includes(meId) ? 'are' : 'is'} no longer an admin`;
    case 'renamed':
      return `${name(s.actorId)} renamed the group to "${s.value ?? ''}"`;
    case 'icon_changed':
      return `${name(s.actorId)} changed the group icon`;
    case 'icon_removed':
      return `${name(s.actorId)} removed the group icon`;
    default:
      return '';
  }
}

export function callLabel(m: Message, meId: string): string {
  if (!m.call) return '';
  const outgoing = m.senderId === meId;
  const kind = m.call.callType === 'video' ? 'Video call' : 'Voice call';
  switch (m.call.status) {
    case 'ended':
      return `${kind} · ${duration(m.call.duration)}`;
    case 'missed':
      return outgoing ? `${kind} · No answer` : `Missed ${kind.toLowerCase()}`;
    case 'rejected':
      return outgoing ? `${kind} · Declined` : `${kind} · Declined`;
    case 'busy':
      return outgoing ? `${kind} · Busy` : `Missed ${kind.toLowerCase()}`;
    default:
      return kind;
  }
}

export function messagePreview(m: Message | null, c: Conversation, meId: string): string {
  if (!m) return c.type === 'group' ? 'Group created' : 'Say hi 👋';
  if (m.isDeleted) return '🚫 This message was deleted';
  if (m.messageType === 'system') return systemText(m, c, meId);
  if (m.messageType === 'call') return `📞 ${callLabel(m, meId)}`;
  const prefix = m.senderId === meId ? 'You: ' : c.type === 'group' && m.sender ? `${m.sender.displayName}: ` : '';
  const body = (() => {
    switch (m.messageType) {
      case 'image':
        return `📷 ${m.content || 'Photo'}`;
      case 'video':
        return `🎥 ${m.content || 'Video'}`;
      case 'voice':
        return '🎤 Voice message';
      case 'audio':
        return `🎵 ${m.attachment?.name ?? 'Audio'}`;
      case 'file':
        return `📄 ${m.attachment?.name ?? 'File'}`;
      default:
        return m.content;
    }
  })();
  return prefix + body;
}

export const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
