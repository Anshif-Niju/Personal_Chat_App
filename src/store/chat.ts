import { create } from 'zustand';
import type { Conversation, FriendRequest, Message, PublicUser } from '../types';
import { api, errorMessage } from '../lib/api';
import { emitAck, getSocket } from '../lib/socket';
import { randomId } from '../lib/format';
import { useAuth } from './auth';
import { useUi } from './ui';

interface Bucket {
  items: Message[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
}

interface Presence {
  isOnline: boolean | null;
  lastSeen: string | null;
}

interface ChatState {
  conversations: Record<string, Conversation>;
  conversationsLoaded: boolean;
  activeId: string | null;
  messages: Record<string, Bucket>;
  typing: Record<string, Record<string, string>>;
  presence: Record<string, Presence>;
  replyTo: Message | null;
  editing: Message | null;
  friends: PublicUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];

  reset: () => void;
  loadConversations: () => Promise<void>;
  fetchConversation: (id: string) => Promise<Conversation | null>;
  upsertConversation: (c: Conversation) => void;
  removeConversation: (id: string) => void;
  setActive: (id: string | null) => void;
  loadMessages: (id: string, opts?: { older?: boolean; refresh?: boolean }) => Promise<void>;
  sendText: (conversationId: string, text: string) => Promise<void>;
  sendFile: (conversationId: string, file: File, opts?: { voice?: boolean; duration?: number; caption?: string; clientId?: string }) => Promise<void>;
  retry: (m: Message) => void;
  forward: (messageId: string, conversationIds: string[]) => Promise<void>;
  receiveMessage: (m: Message) => void;
  replaceMessage: (m: Message) => void;
  removeMessageLocal: (conversationId: string, messageId: string) => void;
  applyReceipt: (r: { conversationId: string; messageIds: string[]; userId: string; kind: 'delivered' | 'read'; at: string }) => void;
  applyReaction: (conversationId: string, messageId: string, reactions: Message['reactions']) => void;
  setPinned: (conversationId: string, ids: string[]) => void;
  markRead: (conversationId: string) => void;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  setTyping: (conversationId: string, userId: string, name: string, isTyping: boolean) => void;
  setPresence: (userId: string, p: Presence) => void;
  setReplyTo: (m: Message | null) => void;
  setEditing: (m: Message | null) => void;
  loadFriends: () => Promise<void>;
  loadRequests: () => Promise<void>;
  setFriends: (fn: (f: PublicUser[]) => PublicUser[]) => void;
  setRequests: (fn: (r: { incoming: FriendRequest[]; outgoing: FriendRequest[] }) => { incoming: FriendRequest[]; outgoing: FriendRequest[] }) => void;
}

const emptyBucket = (): Bucket => ({ items: [], hasMore: true, loading: false, loaded: false });
const PAGE = 40;
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function mergeSorted(existing: Message[], incoming: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of existing) map.set(m.clientId && m.localStatus ? `c:${m.clientId}` : m.id, m);
  for (const m of incoming) {
    if (m.clientId) map.delete(`c:${m.clientId}`);
    map.set(m.id, m);
  }
  return [...map.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function seedPresence(users: PublicUser[], current: Record<string, Presence>) {
  const next = { ...current };
  for (const u of users) next[u.id] = { isOnline: u.isOnline, lastSeen: u.lastSeen };
  return next;
}

export const useChat = create<ChatState>((set, get) => {
  const patchMessage = (conversationId: string, match: (m: Message) => boolean, fn: (m: Message) => Message) =>
    set((s) => {
      const bucket = s.messages[conversationId];
      const conv = s.conversations[conversationId];
      const out: Partial<ChatState> = {};
      if (bucket) out.messages = { ...s.messages, [conversationId]: { ...bucket, items: bucket.items.map((m) => (match(m) ? fn(m) : m)) } };
      if (conv?.lastMessage && match(conv.lastMessage)) {
        out.conversations = { ...s.conversations, [conversationId]: { ...conv, lastMessage: fn(conv.lastMessage) } };
      }
      return out;
    });

  const me = () => useAuth.getState().user!;

  async function deliver(payload: Record<string, unknown>, conversationId: string) {
    const socket = getSocket();
    if (socket?.connected) {
      const res = await emitAck<{ ok: boolean; message?: Message; error?: string }>('message:send', payload);
      if (!res.ok || !res.message) throw new Error(res.error ?? 'Message could not be sent');
      return res.message;
    }
    // Fallback to REST when the socket is down.
    const { conversationId: _omit, ...body } = payload;
    void _omit;
    const { data } = await api.post(`/conversations/${conversationId}/messages`, body);
    return data.message as Message;
  }

  function tempMessage(conversationId: string, clientId: string, partial: Partial<Message>): Message {
    const u = me();
    const reply = get().replyTo;
    return {
      id: `tmp-${clientId}`,
      conversationId,
      sender: { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl },
      senderId: u.id,
      messageType: 'text',
      content: '',
      attachment: null,
      replyTo:
        reply && reply.conversationId === conversationId
          ? {
              id: reply.id,
              senderName: reply.sender?.displayName ?? 'Unknown',
              senderId: reply.senderId,
              content: reply.content,
              messageType: reply.messageType,
              isDeleted: reply.isDeleted,
              attachmentName: reply.attachment?.name ?? null,
            }
          : null,
      forwarded: false,
      reactions: [],
      deliveredTo: [],
      readBy: [],
      editedAt: null,
      isDeleted: false,
      call: null,
      system: null,
      clientId,
      createdAt: new Date().toISOString(),
      localStatus: 'sending',
      ...partial,
    };
  }

  const markFailed = (conversationId: string, clientId: string) =>
    patchMessage(conversationId, (m) => m.clientId === clientId && !!m.localStatus, (m) => ({ ...m, localStatus: 'failed' }));

  return {
    conversations: {},
    conversationsLoaded: false,
    activeId: null,
    messages: {},
    typing: {},
    presence: {},
    replyTo: null,
    editing: null,
    friends: [],
    incoming: [],
    outgoing: [],

    reset: () =>
      set({
        conversations: {},
        conversationsLoaded: false,
        activeId: null,
        messages: {},
        typing: {},
        presence: {},
        replyTo: null,
        editing: null,
        friends: [],
        incoming: [],
        outgoing: [],
      }),

    loadConversations: async () => {
      const { data } = await api.get('/conversations');
      const list: Conversation[] = data.conversations;
      set((s) => ({
        conversations: Object.fromEntries(list.map((c) => [c.id, c])),
        conversationsLoaded: true,
        presence: seedPresence(list.flatMap((c) => c.participants), s.presence),
      }));
    },

    fetchConversation: async (id) => {
      try {
        const { data } = await api.get(`/conversations/${id}`);
        get().upsertConversation(data.conversation);
        return data.conversation as Conversation;
      } catch {
        return null;
      }
    },

    upsertConversation: (c) =>
      set((s) => ({
        conversations: { ...s.conversations, [c.id]: c },
        presence: seedPresence(c.participants, s.presence),
      })),

    removeConversation: (id) =>
      set((s) => {
        const { [id]: _removed, ...rest } = s.conversations;
        void _removed;
        return { conversations: rest, activeId: s.activeId === id ? null : s.activeId };
      }),

    setActive: (id) => set({ activeId: id, replyTo: null, editing: null }),

    loadMessages: async (id, opts = {}) => {
      const bucket = get().messages[id] ?? emptyBucket();
      if (bucket.loading) return;
      if (opts.older && !bucket.hasMore) return;
      set((s) => ({ messages: { ...s.messages, [id]: { ...bucket, loading: true } } }));
      try {
        const persisted = bucket.items.filter((m) => !m.localStatus);
        const before = opts.older && persisted.length ? persisted[0].createdAt : undefined;
        const { data } = await api.get(`/conversations/${id}/messages`, { params: { limit: PAGE, before } });
        set((s) => {
          const current = s.messages[id] ?? emptyBucket();
          return {
            messages: {
              ...s.messages,
              [id]: {
                items: mergeSorted(current.items, data.messages),
                hasMore: opts.older || !current.loaded ? data.hasMore : current.hasMore,
                loading: false,
                loaded: true,
              },
            },
          };
        });
      } catch (err) {
        set((s) => ({ messages: { ...s.messages, [id]: { ...(s.messages[id] ?? emptyBucket()), loading: false } } }));
        useUi.getState().toast(errorMessage(err), 'error');
      }
    },

    sendText: async (conversationId, text) => {
      const clientId = randomId();
      const temp = tempMessage(conversationId, clientId, { content: text });
      get().receiveMessage(temp);
      set({ replyTo: null });
      try {
        const msg = await deliver({ conversationId, clientId, content: text, replyTo: temp.replyTo?.id }, conversationId);
        get().receiveMessage(msg);
      } catch (err) {
        markFailed(conversationId, clientId);
        useUi.getState().toast(errorMessage(err), 'error');
      }
    },

    sendFile: async (conversationId, file, opts = {}) => {
      const clientId = opts.clientId ?? randomId();
      const mime = file.type || 'application/octet-stream';
      const type: Message['messageType'] = opts.voice
        ? 'voice'
        : mime.startsWith('image/')
          ? 'image'
          : mime.startsWith('video/')
            ? 'video'
            : mime.startsWith('audio/')
              ? 'audio'
              : 'file';
      if (!opts.clientId) {
        const temp = tempMessage(conversationId, clientId, {
          messageType: type,
          content: opts.caption ?? '',
          attachment: {
            url: URL.createObjectURL(file),
            name: file.name,
            mimeType: mime,
            size: file.size,
            width: null,
            height: null,
            duration: opts.duration ?? null,
          },
          uploadProgress: 0,
          localFile: file,
        });
        get().receiveMessage(temp);
        set({ replyTo: null });
      } else {
        patchMessage(conversationId, (m) => m.clientId === clientId, (m) => ({ ...m, localStatus: 'sending', uploadProgress: 0 }));
      }
      const replyId = get().messages[conversationId]?.items.find((m) => m.clientId === clientId)?.replyTo?.id;
      try {
        const form = new FormData();
        form.append('file', file, file.name);
        if (opts.voice) form.append('kind', 'voice');
        if (opts.duration) form.append('duration', String(opts.duration));
        const { data } = await api.post('/media/upload', form, {
          onUploadProgress: (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            patchMessage(conversationId, (m) => m.clientId === clientId && !!m.localStatus, (m) => ({ ...m, uploadProgress: pct }));
          },
        });
        const msg = await deliver({ conversationId, clientId, uploadToken: data.uploadToken, content: opts.caption, replyTo: replyId }, conversationId);
        get().receiveMessage(msg);
      } catch (err) {
        markFailed(conversationId, clientId);
        useUi.getState().toast(errorMessage(err), 'error');
      }
    },

    retry: (m) => {
      if (!m.clientId) return;
      if (m.localFile) {
        void get().sendFile(m.conversationId, m.localFile, { clientId: m.clientId, voice: m.messageType === 'voice', caption: m.content, duration: m.attachment?.duration ?? undefined });
        return;
      }
      const clientId = m.clientId;
      patchMessage(m.conversationId, (x) => x.clientId === clientId, (x) => ({ ...x, localStatus: 'sending' }));
      deliver({ conversationId: m.conversationId, clientId, content: m.content, replyTo: m.replyTo?.id }, m.conversationId)
        .then((msg) => get().receiveMessage(msg))
        .catch((err) => {
          markFailed(m.conversationId, clientId);
          useUi.getState().toast(errorMessage(err), 'error');
        });
    },

    forward: async (messageId, conversationIds) => {
      await Promise.all(
        conversationIds.map((cid) =>
          deliver({ conversationId: cid, clientId: randomId(), forwardFrom: messageId }, cid).then((m) => get().receiveMessage(m)),
        ),
      );
    },

    receiveMessage: (m) =>
      set((s) => {
        const cid = m.conversationId;
        const out: Partial<ChatState> = {};
        const bucket = s.messages[cid];
        if (bucket) {
          const idx = bucket.items.findIndex((x) => x.id === m.id || (!!m.clientId && x.clientId === m.clientId && x.senderId === m.senderId));
          let items: Message[];
          if (idx >= 0) {
            items = bucket.items.slice();
            const prev = items[idx];
            // Keep receipts that may have arrived before the ack.
            items[idx] = {
              ...m,
              deliveredTo: m.deliveredTo.length >= prev.deliveredTo.length ? m.deliveredTo : prev.deliveredTo,
              readBy: m.readBy.length >= prev.readBy.length ? m.readBy : prev.readBy,
            };
          } else {
            const last = bucket.items[bucket.items.length - 1];
            items =
              !last || new Date(last.createdAt) <= new Date(m.createdAt)
                ? [...bucket.items, m]
                : mergeSorted(bucket.items, [m]);
          }
          out.messages = { ...s.messages, [cid]: { ...bucket, items } };
        }
        const conv = s.conversations[cid];
        if (conv) {
          const lm = conv.lastMessage;
          const same = lm && (lm.id === m.id || (!!m.clientId && lm.clientId === m.clientId));
          const newer = !lm || same || new Date(m.createdAt) >= new Date(lm.createdAt);
          if (newer) out.conversations = { ...s.conversations, [cid]: { ...conv, lastMessage: m, lastMessageAt: m.createdAt } };
        }
        return out;
      }),

    replaceMessage: (m) => patchMessage(m.conversationId, (x) => x.id === m.id, () => m),

    removeMessageLocal: (conversationId, messageId) =>
      set((s) => {
        const bucket = s.messages[conversationId];
        const out: Partial<ChatState> = {};
        if (bucket) out.messages = { ...s.messages, [conversationId]: { ...bucket, items: bucket.items.filter((m) => m.id !== messageId) } };
        const conv = s.conversations[conversationId];
        if (conv?.lastMessage?.id === messageId) {
          const items = (out.messages ?? s.messages)[conversationId]?.items ?? [];
          out.conversations = { ...s.conversations, [conversationId]: { ...conv, lastMessage: items[items.length - 1] ?? null } };
        }
        return out;
      }),

    applyReceipt: ({ conversationId, messageIds, userId, kind, at }) => {
      const ids = new Set(messageIds);
      const key = kind === 'read' ? 'readBy' : 'deliveredTo';
      patchMessage(
        conversationId,
        (m) => ids.has(m.id),
        (m) => {
          if (m[key].some((r) => r.userId === userId)) return m;
          const next = { ...m, [key]: [...m[key], { userId, at }] };
          if (kind === 'read' && !m.deliveredTo.some((r) => r.userId === userId)) next.deliveredTo = [...m.deliveredTo, { userId, at }];
          return next;
        },
      );
    },

    applyReaction: (conversationId, messageId, reactions) => patchMessage(conversationId, (m) => m.id === messageId, (m) => ({ ...m, reactions })),

    setPinned: (conversationId, ids) =>
      set((s) => {
        const conv = s.conversations[conversationId];
        return conv ? { conversations: { ...s.conversations, [conversationId]: { ...conv, pinnedMessageIds: ids } } } : {};
      }),

    markRead: (conversationId) => {
      get().clearUnread(conversationId);
      const socket = getSocket();
      if (socket?.connected) socket.emit('conversation:read', { conversationId });
      else api.post(`/conversations/${conversationId}/read`).catch(() => undefined);
    },

    incrementUnread: (conversationId) =>
      set((s) => {
        const conv = s.conversations[conversationId];
        return conv ? { conversations: { ...s.conversations, [conversationId]: { ...conv, unreadCount: conv.unreadCount + 1 } } } : {};
      }),

    clearUnread: (conversationId) =>
      set((s) => {
        const conv = s.conversations[conversationId];
        return conv && conv.unreadCount ? { conversations: { ...s.conversations, [conversationId]: { ...conv, unreadCount: 0 } } } : {};
      }),

    setTyping: (conversationId, userId, name, isTyping) => {
      const key = `${conversationId}:${userId}`;
      const t = typingTimers.get(key);
      if (t) clearTimeout(t);
      set((s) => {
        const current = { ...(s.typing[conversationId] ?? {}) };
        if (isTyping) current[userId] = name;
        else delete current[userId];
        return { typing: { ...s.typing, [conversationId]: current } };
      });
      if (isTyping) typingTimers.set(key, setTimeout(() => get().setTyping(conversationId, userId, name, false), 6000));
    },

    setPresence: (userId, p) => set((s) => ({ presence: { ...s.presence, [userId]: p } })),
    setReplyTo: (m) => set({ replyTo: m, editing: null }),
    setEditing: (m) => set({ editing: m, replyTo: null }),

    loadFriends: async () => {
      const { data } = await api.get('/friends');
      set((s) => ({ friends: data.friends, presence: seedPresence(data.friends, s.presence) }));
    },

    loadRequests: async () => {
      const { data } = await api.get('/friends/requests');
      set({ incoming: data.incoming, outgoing: data.outgoing });
    },

    setFriends: (fn) => set((s) => ({ friends: fn(s.friends) })),
    setRequests: (fn) => set((s) => fn({ incoming: s.incoming, outgoing: s.outgoing })),
  };
});

/** Status of one of my messages: sending → sent → delivered → read. */
export function messageStatus(m: Message, conv: Conversation | undefined, meId: string): 'sending' | 'failed' | 'sent' | 'delivered' | 'read' {
  if (m.localStatus) return m.localStatus;
  const others = (conv?.participants ?? []).filter((p) => p.id !== meId).map((p) => p.id);
  if (others.length === 0) return 'sent';
  if (others.every((id) => m.readBy.some((r) => r.userId === id))) return 'read';
  if (others.every((id) => m.deliveredTo.some((r) => r.userId === id))) return 'delivered';
  return 'sent';
}
