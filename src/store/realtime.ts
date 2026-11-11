import type { AppNotification, Conversation, FriendRequest, Message, PublicUser } from '../types';
import { connectSocket, getSocket } from '../lib/socket';
import { browserNotify } from '../lib/notify';
import { playMessageSound } from '../lib/sounds';
import { conversationTitle, messagePreview } from '../lib/format';
import { useAuth } from './auth';
import { useChat } from './chat';
import { useUi } from './ui';
import { bindCallEvents } from './call';
import { bindGroupCallEvents } from './groupCall';

let deliveredQueue: string[] = [];
let deliveredTimer: ReturnType<typeof setTimeout> | null = null;
let readTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityBound = false;

function queueDelivered(id: string) {
  deliveredQueue.push(id);
  if (deliveredTimer) return;
  deliveredTimer = setTimeout(() => {
    getSocket()?.emit('message:delivered', { messageIds: deliveredQueue });
    deliveredQueue = [];
    deliveredTimer = null;
  }, 300);
}

function scheduleRead(conversationId: string) {
  if (readTimer) clearTimeout(readTimer);
  readTimer = setTimeout(() => useChat.getState().markRead(conversationId), 400);
}

export const isViewing = (conversationId: string) =>
  useChat.getState().activeId === conversationId && document.visibilityState === 'visible';

/** Navigation callback (set by the app shell) used when clicking notifications. */
export const nav = { open: (_path: string) => {} };

export function startRealtime() {
  const existing = getSocket();
  if (existing) return existing;
  const socket = connectSocket();
  const chat = useChat;
  const ui = useUi;
  let connectedOnce = false;

  socket.on('connect', () => {
    if (connectedOnce) {
      // Resync after a reconnect: we may have missed events.
      void chat.getState().loadConversations();
      const active = chat.getState().activeId;
      if (active) void chat.getState().loadMessages(active, { refresh: true });
      void chat.getState().loadRequests();
    }
    connectedOnce = true;
  });

  socket.on('message:new', async (m: Message) => {
    const me = useAuth.getState().user;
    if (!me) return;
    const conv = chat.getState().conversations[m.conversationId] ?? (await chat.getState().fetchConversation(m.conversationId));
    if (!conv) return;
    chat.getState().receiveMessage(m);
    if (!m.senderId || m.senderId === me.id) return;

    chat.getState().setTyping(m.conversationId, m.senderId, '', false);
    queueDelivered(m.id);

    if (isViewing(m.conversationId)) {
      scheduleRead(m.conversationId);
      return;
    }
    chat.getState().incrementUnread(m.conversationId);
    const settings = ui.getState().settings;
    const isGroup = conv.type === 'group';
    const enabled = isGroup ? settings?.notifications.groups !== false : settings?.notifications.messages !== false;
    if (!enabled) return;
    if (settings?.notifications.sound !== false) playMessageSound();
    const latest = chat.getState().conversations[m.conversationId] ?? conv;
    const title = conversationTitle(latest, me.id);
    const body = settings?.notifications.showPreview === false ? 'New message' : messagePreview(m, latest, me.id);
    browserNotify(title, body, { tag: m.conversationId, onClick: () => nav.open(`/chat/${m.conversationId}`) });
  });

  socket.on('message:updated', (m: Message) => chat.getState().replaceMessage(m));
  socket.on('message:deleted', (d: { conversationId: string; messageId: string; scope: 'me' | 'everyone'; message?: Message }) => {
    if (d.scope === 'me' || !d.message) chat.getState().removeMessageLocal(d.conversationId, d.messageId);
    else chat.getState().replaceMessage(d.message);
  });
  socket.on('message:reaction', (d: { conversationId: string; messageId: string; reactions: Message['reactions'] }) =>
    chat.getState().applyReaction(d.conversationId, d.messageId, d.reactions),
  );
  socket.on('message:pinned', (d: { conversationId: string; pinnedMessageIds: string[] }) => chat.getState().setPinned(d.conversationId, d.pinnedMessageIds));
  socket.on('message:receipt', (r) => chat.getState().applyReceipt(r));

  socket.on('conversation:new', (c: Conversation) => chat.getState().upsertConversation(c));
  socket.on('conversation:updated', (c: Conversation) => {
    const prev = chat.getState().conversations[c.id];
    // Keep our locally-tracked unread count when the server view is older.
    chat.getState().upsertConversation(prev && isViewing(c.id) ? { ...c, unreadCount: 0 } : c);
  });
  socket.on('conversation:removed', ({ conversationId }: { conversationId: string }) => {
    const wasActive = chat.getState().activeId === conversationId;
    chat.getState().removeConversation(conversationId);
    if (wasActive) {
      nav.open('/');
      ui.getState().toast('You are no longer in this conversation');
    }
  });
  socket.on('conversation:read-sync', ({ conversationId }: { conversationId: string }) => chat.getState().clearUnread(conversationId));

  socket.on('typing', (d: { conversationId: string; userId: string; displayName: string; isTyping: boolean }) =>
    chat.getState().setTyping(d.conversationId, d.userId, d.displayName, d.isTyping),
  );
  socket.on('presence:update', (d: { userId: string; isOnline: boolean | null; lastSeen: string | null }) =>
    chat.getState().setPresence(d.userId, { isOnline: d.isOnline, lastSeen: d.lastSeen }),
  );

  socket.on('friend:request', (r: FriendRequest) => {
    chat.getState().setRequests((s) => ({ ...s, incoming: [r, ...s.incoming.filter((x) => x.id !== r.id)] }));
    ui.getState().toast(`${r.user.displayName} (@${r.user.username}) sent you a friend request`, 'info', {
      title: 'Friend request',
      onClick: () => nav.open('/friends'),
    });
    if (ui.getState().settings?.notifications.friendRequests !== false) {
      browserNotify('New friend request', `${r.user.displayName} wants to be your friend`, { onClick: () => nav.open('/friends') });
    }
  });
  socket.on('friend:accepted', (d: { requestId: string; user: PublicUser }) => {
    const wasOutgoing = chat.getState().outgoing.some((r) => r.id === d.requestId);
    chat.getState().setRequests((s) => ({
      incoming: s.incoming.filter((r) => r.id !== d.requestId),
      outgoing: s.outgoing.filter((r) => r.id !== d.requestId),
    }));
    chat.getState().setFriends((f) => [...f.filter((x) => x.id !== d.user.id), d.user].sort((a, b) => a.displayName.localeCompare(b.displayName)));
    chat.getState().setPresence(d.user.id, { isOnline: d.user.isOnline, lastSeen: d.user.lastSeen });
    if (wasOutgoing) ui.getState().toast(`${d.user.displayName} accepted your friend request`, 'success');
  });
  socket.on('friend:removed', ({ userId }: { userId: string }) => chat.getState().setFriends((f) => f.filter((x) => x.id !== userId)));
  socket.on('friend:request-closed', ({ requestId }: { requestId: string }) =>
    chat.getState().setRequests((s) => ({
      incoming: s.incoming.filter((r) => r.id !== requestId),
      outgoing: s.outgoing.filter((r) => r.id !== requestId),
    })),
  );

  socket.on('notification', (n: AppNotification) => {
    const convId = typeof n.data?.conversationId === 'string' ? n.data.conversationId : null;
    ui.getState().toast(n.body, 'info', { title: n.title, onClick: convId ? () => nav.open(`/chat/${convId}`) : undefined });
    browserNotify(n.title, n.body, { onClick: convId ? () => nav.open(`/chat/${convId}`) : undefined });
  });

  socket.on('session:revoked', () => {
    ui.getState().toast('You were signed out from this device', 'info');
    useAuth.getState().clear();
  });

  bindCallEvents();
  bindGroupCallEvents();

  if (!visibilityBound) {
    visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      const active = useChat.getState().activeId;
      if (active && document.visibilityState === 'visible' && (useChat.getState().conversations[active]?.unreadCount ?? 0) > 0) {
        useChat.getState().markRead(active);
      }
    });
  }

  return socket;
}
