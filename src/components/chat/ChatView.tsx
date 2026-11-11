import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowDown, ArrowLeft, Info, MessageSquareOff, Phone, Pin, Search, Video, X } from 'lucide-react';
import { useAuth } from '../../store/auth';
import { useChat } from '../../store/chat';
import { useCall } from '../../store/call';
import { useUi } from '../../store/ui';
import { api, errorMessage } from '../../lib/api';
import { useDebounced } from '../../lib/hooks';
import { conversationTitle, dayLabel, lastSeenLabel, messageTime, otherParticipant } from '../../lib/format';
import { Avatar, EmptyState, Modal, Spinner } from '../ui';
import MessageBubble, { BubbleActions } from './MessageBubble';
import Composer from './Composer';
import ChatInfoPanel from './ChatInfoPanel';
import type { Message } from '../../types';

export default function ChatView() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const me = useAuth((s) => s.user)!;
  const conv = useChat((s) => s.conversations[id]);
  const loaded = useChat((s) => s.conversationsLoaded);
  const bucket = useChat((s) => s.messages[id]);
  const typing = useChat((s) => s.typing[id]);
  const presence = useChat((s) => s.presence);
  const startCall = useCall((s) => s.startCall);
  const toast = useUi((s) => s.toast);
  const [missing, setMissing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState<Message | null>(null);
  const [viewer, setViewer] = useState<Message | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pinIndex, setPinIndex] = useState(0);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);

  // Activate conversation
  useEffect(() => {
    useChat.getState().setActive(id);
    setShowInfo(false);
    setSearchOpen(false);
    setMissing(false);
    return () => {
      if (useChat.getState().activeId === id) useChat.getState().setActive(null);
    };
  }, [id]);

  useEffect(() => {
    if (!loaded || conv) return;
    void useChat.getState().fetchConversation(id).then((c) => !c && setMissing(true));
  }, [id, loaded, conv]);

  useEffect(() => {
    if (conv && !bucket?.loaded) void useChat.getState().loadMessages(id);
  }, [id, conv, bucket?.loaded]);

  useEffect(() => {
    if (conv && conv.unreadCount > 0 && document.visibilityState === 'visible') useChat.getState().markRead(id);
  }, [id, conv?.unreadCount, conv]);

  // Pinned messages
  const pinKey = conv?.pinnedMessageIds.join(',') ?? '';
  useEffect(() => {
    if (!pinKey) return setPinnedMessages([]);
    api
      .get(`/conversations/${id}/pins`)
      .then(({ data }) => {
        setPinnedMessages(data.messages);
        setPinIndex(0);
      })
      .catch(() => undefined);
  }, [id, pinKey]);

  const jumpTo = useCallback(
    (messageId: string) => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlight(messageId);
        setTimeout(() => setHighlight(null), 1600);
      } else {
        toast('That message is further back in the history — scroll up to load it', 'info');
      }
    },
    [toast],
  );

  const actions: BubbleActions = useMemo(
    () => ({
      onReply: (m) => useChat.getState().setReplyTo(m),
      onEdit: (m) => useChat.getState().setEditing(m),
      onForward: (m) => setForwarding(m),
      onDelete: (m) => setDeleting(m),
      onRetry: (m) => useChat.getState().retry(m),
      onJumpTo: jumpTo,
      onOpenMedia: (m) => setViewer(m),
      onCopy: (m) => {
        void navigator.clipboard.writeText(m.content).then(() => toast('Copied', 'success'));
      },
      onReact: (m, emoji) => {
        api
          .post(`/messages/${m.id}/reactions`, { emoji })
          .then(({ data }) => useChat.getState().applyReaction(m.conversationId, m.id, data.reactions))
          .catch((err) => toast(errorMessage(err), 'error'));
      },
      onPin: (m, pinned) => {
        (pinned ? api.post(`/messages/${m.id}/pin`) : api.delete(`/messages/${m.id}/pin`))
          .then(({ data }) => useChat.getState().setPinned(m.conversationId, data.pinnedMessageIds))
          .catch((err) => toast(errorMessage(err), 'error'));
      },
    }),
    [jumpTo, toast],
  );

  if (missing) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={<MessageSquareOff className="h-7 w-7" />} title="Conversation not found" text="It may have been deleted, or you're no longer a member." action={<Link to="/" className="btn-primary">Back to chats</Link>} />
      </div>
    );
  }
  if (!conv) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6 text-slate-400" />
      </div>
    );
  }

  const other = otherParticipant(conv, me.id);
  const title = conversationTitle(conv, me.id);
  const typingNames = Object.values(typing ?? {});
  const p = other ? (presence[other.id] ?? other) : undefined;
  const subtitle = typingNames.length
    ? conv.type === 'group'
      ? `${typingNames.slice(0, 2).join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…`
      : 'typing…'
    : conv.type === 'group'
      ? conv.participants.map((x) => (x.id === me.id ? 'You' : x.displayName)).join(', ')
      : lastSeenLabel(p);
  const peer = other && { id: other.id, username: other.username, displayName: other.displayName, avatarUrl: other.avatarUrl };
  const currentPin = pinnedMessages[pinIndex % Math.max(pinnedMessages.length, 1)];

  return (
    <div className="flex h-full">
      <div className="flex h-full min-w-0 flex-1 flex-col border-l border-slate-200 dark:border-slate-800">
        <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-900 sm:px-4">
          <button className="icon-btn md:hidden" onClick={() => navigate('/')} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setShowInfo((v) => !v)}>
            <Avatar name={title} url={conv.type === 'group' ? conv.groupImageUrl : other?.avatarUrl} online={conv.type === 'private' ? p?.isOnline : null} group={conv.type === 'group'} />
            <div className="min-w-0">
              <div className="truncate font-semibold">{title}</div>
              <div className={clsx('truncate text-xs', typingNames.length ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400')}>{subtitle}</div>
            </div>
          </button>
          <button className={clsx('icon-btn', searchOpen && 'text-brand-600')} onClick={() => setSearchOpen((v) => !v)} aria-label="Search messages">
            <Search className="h-5 w-5" />
          </button>
          {conv.type === 'private' && peer && (
            <>
              <button className="icon-btn" onClick={() => void startCall(peer, 'audio')} aria-label="Voice call">
                <Phone className="h-5 w-5" />
              </button>
              <button className="icon-btn" onClick={() => void startCall(peer, 'video')} aria-label="Video call">
                <Video className="h-5 w-5" />
              </button>
            </>
          )}
          <button className={clsx('icon-btn hidden sm:inline-flex', showInfo && 'text-brand-600')} onClick={() => setShowInfo((v) => !v)} aria-label="Conversation info">
            <Info className="h-5 w-5" />
          </button>
        </header>

        {searchOpen && <SearchBar conversationId={id} onClose={() => setSearchOpen(false)} onPick={jumpTo} />}

        {currentPin && (
          <button
            className="flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-2 text-left text-sm dark:border-slate-800 dark:bg-slate-900/95"
            onClick={() => {
              jumpTo(currentPin.id);
              setPinIndex((i) => i + 1);
            }}
          >
            <Pin className="h-4 w-4 shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                Pinned message{pinnedMessages.length > 1 ? ` ${(pinIndex % pinnedMessages.length) + 1}/${pinnedMessages.length}` : ''}
              </div>
              <div className="truncate text-slate-600 dark:text-slate-300">{currentPin.content || currentPin.attachment?.name || currentPin.messageType}</div>
            </div>
          </button>
        )}

        <MessageList conversationId={id} meId={me.id} actions={actions} highlight={highlight} />
        <Composer conv={conv} meId={me.id} />
      </div>

      {showInfo && (
        <div className="fixed inset-0 z-40 bg-white dark:bg-slate-950 lg:static lg:z-auto lg:w-[360px] lg:shrink-0 lg:border-l lg:border-slate-200 lg:dark:border-slate-800">
          <ChatInfoPanel conv={conv} onClose={() => setShowInfo(false)} onOpenMedia={setViewer} />
        </div>
      )}

      <ForwardModal message={forwarding} onClose={() => setForwarding(null)} />
      <DeleteModal message={deleting} canDeleteForEveryone={!!deleting && (deleting.senderId === me.id || (conv.type === 'group' && conv.admins.includes(me.id)))} onClose={() => setDeleting(null)} />
      <MediaViewer message={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

function MessageList({ conversationId, meId, actions, highlight }: { conversationId: string; meId: string; actions: BubbleActions; highlight: string | null }) {
  const bucket = useChat((s) => s.messages[conversationId]);
  const conv = useChat((s) => s.conversations[conversationId])!;
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const lastCount = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const items = bucket?.items ?? [];
  const pinned = useMemo(() => new Set(conv.pinnedMessageIds), [conv.pinnedMessageIds]);

  // Scroll handling: keep position when older messages are prepended, stick to bottom for new ones.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (items.length !== lastCount.current) {
      const last = items[items.length - 1];
      if (atBottom.current || last?.senderId === meId || lastCount.current === 0) el.scrollTop = el.scrollHeight;
    }
    lastCount.current = items.length;
  }, [items, meId]);

  useEffect(() => {
    lastCount.current = 0;
    atBottom.current = true;
  }, [conversationId]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = distance < 120;
    setShowJump(distance > 400);
    if (el.scrollTop < 150 && bucket?.hasMore && !bucket.loading && bucket.loaded) {
      prevHeight.current = el.scrollHeight;
      void useChat.getState().loadMessages(conversationId, { older: true });
    }
  };

  return (
    <div className="chat-wallpaper relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="scrollbar-thin h-full overflow-y-auto py-3">
        {bucket?.loading && (
          <div className="flex justify-center py-3">
            <Spinner className="h-5 w-5 text-slate-500" />
          </div>
        )}
        {bucket?.loaded && !bucket.hasMore && (
          <div className="mx-auto mb-3 max-w-sm rounded-lg bg-amber-50/90 px-3 py-2 text-center text-xs text-amber-800 shadow-sm dark:bg-amber-950/60 dark:text-amber-200">
            Messages are protected with TLS in transit. Only conversation members can access this chat.
          </div>
        )}
        {items.map((m, i) => {
          const prev = items[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const showSender = newDay || !prev || prev.senderId !== m.senderId || prev.messageType === 'system' || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60_000;
          return (
            <Fragment key={m.clientId && m.localStatus ? `c-${m.clientId}` : m.id}>
              {newDay && (
                <div className="sticky top-1 z-10 my-3 flex justify-center">
                  <span className="rounded-lg bg-white/95 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm dark:bg-slate-800/95 dark:text-slate-300">{dayLabel(m.createdAt)}</span>
                </div>
              )}
              <div className={clsx(showSender && i > 0 && 'mt-2')}>
                <MessageBubble m={m} conv={conv} meId={meId} showSender={showSender} isPinned={pinned.has(m.id)} highlighted={highlight === m.id} {...actions} />
              </div>
            </Fragment>
          );
        })}
        {bucket?.loaded && items.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-2xl bg-white/90 px-6 py-4 text-center text-sm text-slate-600 shadow-sm dark:bg-slate-800/90 dark:text-slate-300">No messages yet. Say hello 👋</div>
          </div>
        )}
      </div>
      {showJump && (
        <button
          className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
          onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })}
          aria-label="Scroll to latest"
        >
          <ArrowDown className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

function SearchBar({ conversationId, onClose, onPick }: { conversationId: string; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const [results, setResults] = useState<Message[] | null>(null);
  useEffect(() => {
    if (!dq) return setResults(null);
    let cancelled = false;
    api
      .get(`/conversations/${conversationId}/messages/search`, { params: { q: dq } })
      .then(({ data }) => !cancelled && setResults(data.messages))
      .catch(() => !cancelled && setResults([]));
    return () => {
      cancelled = true;
    };
  }, [dq, conversationId]);
  return (
    <div className="relative border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-slate-400" />
        <input className="flex-1 bg-transparent py-1 text-sm outline-none" placeholder="Search in conversation" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button className="icon-btn h-8 w-8" onClick={onClose} aria-label="Close search">
          <X className="h-4 w-4" />
        </button>
      </div>
      {results && (
        <div className="absolute inset-x-0 top-full z-20 max-h-80 overflow-y-auto border-b border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          {results.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">No messages found</div>
          ) : (
            results.map((m) => (
              <button key={m.id} className="block w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => onPick(m.id)}>
                <div className="flex justify-between text-xs text-slate-500">
                  <span className="font-medium">{m.sender?.displayName ?? 'Unknown'}</span>
                  <span>
                    {dayLabel(m.createdAt)} {messageTime(m.createdAt)}
                  </span>
                </div>
                <div className="truncate text-sm">{m.content || m.attachment?.name}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ForwardModal({ message, onClose }: { message: Message | null; onClose: () => void }) {
  const me = useAuth((s) => s.user)!;
  const conversations = useChat((s) => s.conversations);
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const list = useMemo(() => Object.values(conversations).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)), [conversations]);
  useEffect(() => setSelected([]), [message]);
  return (
    <Modal open={!!message} onClose={onClose} title="Forward to…">
      <ul className="max-h-96 overflow-y-auto px-2 py-2">
        {list.map((c) => {
          const on = selected.includes(c.id);
          const title = conversationTitle(c, me.id);
          return (
            <li key={c.id}>
              <button
                className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left', on ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800')}
                onClick={() => setSelected((s) => (on ? s.filter((x) => x !== c.id) : s.length >= 5 ? s : [...s, c.id]))}
              >
                <Avatar name={title} url={c.type === 'group' ? c.groupImageUrl : otherParticipant(c, me.id)?.avatarUrl} size="sm" group={c.type === 'group'} />
                <span className="flex-1 truncate text-sm font-medium">{title}</span>
                <input type="checkbox" readOnly checked={on} className="accent-brand-600" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-slate-100 p-4 dark:border-slate-800">
        <button
          className="btn-primary w-full"
          disabled={!selected.length || sending}
          onClick={async () => {
            if (!message) return;
            setSending(true);
            try {
              await useChat.getState().forward(message.id, selected);
              useUi.getState().toast(`Forwarded to ${selected.length} chat${selected.length > 1 ? 's' : ''}`, 'success');
              onClose();
            } catch (err) {
              useUi.getState().toast(errorMessage(err), 'error');
            } finally {
              setSending(false);
            }
          }}
        >
          {sending && <Spinner className="h-4 w-4" />} Forward {selected.length ? `(${selected.length})` : ''}
        </button>
      </div>
    </Modal>
  );
}

function DeleteModal({ message, canDeleteForEveryone, onClose }: { message: Message | null; canDeleteForEveryone: boolean; onClose: () => void }) {
  const del = async (scope: 'me' | 'everyone') => {
    if (!message) return;
    try {
      await api.delete(`/messages/${message.id}`, { params: { scope } });
      if (scope === 'me') useChat.getState().removeMessageLocal(message.conversationId, message.id);
      onClose();
    } catch (err) {
      useUi.getState().toast(errorMessage(err), 'error');
    }
  };
  return (
    <Modal open={!!message} onClose={onClose} title="Delete message?">
      <div className="flex flex-col gap-2 p-4">
        {canDeleteForEveryone && !message?.isDeleted && (
          <button className="btn-danger" onClick={() => void del('everyone')}>
            Delete for everyone
          </button>
        )}
        <button className="btn-ghost text-red-600" onClick={() => void del('me')}>
          Delete for me
        </button>
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function MediaViewer({ message, onClose }: { message: Message | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [message, onClose]);
  if (!message?.attachment?.url) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center justify-between p-3 text-white">
        <div className="text-sm">
          <div className="font-medium">{message.sender?.displayName}</div>
          <div className="text-xs text-white/60">
            {dayLabel(message.createdAt)} {messageTime(message.createdAt)}
          </div>
        </div>
        <div className="flex gap-2">
          <a href={message.attachment.url} download={message.attachment.name} target="_blank" rel="noreferrer" className="rounded-full px-3 py-1.5 text-sm hover:bg-white/10" onClick={(e) => e.stopPropagation()}>
            Download
          </a>
          <button className="rounded-full p-2 hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {message.messageType === 'video' ? (
          <video src={message.attachment.url} controls autoPlay className="max-h-full max-w-full" />
        ) : (
          <img src={message.attachment.url} alt={message.attachment.name} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      {message.content && <div className="p-4 text-center text-sm text-white/90">{message.content}</div>}
    </div>
  );
}
