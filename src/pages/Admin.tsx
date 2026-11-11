import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Check, MessageSquare, Search, Shield, Trash2, UserCheck, Users, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useUi } from '../store/ui';
import { useAuth } from '../store/auth';
import { Avatar, Modal, Spinner } from '../components/ui';
import MessageBubble from '../components/chat/MessageBubble';
import { useWallpaper, wallStyle } from '../store/wallpaper';
import type { Conversation, Message } from '../types';

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  approved: boolean;
  isAdmin: boolean;
  isOnline: boolean;
  lastSeen: string | null;
  createdAt: string;
}
interface AdminConv {
  id: string;
  type: 'private' | 'group';
  title: string;
  participants: { id: string; username: string; displayName: string }[];
  messageCount: number;
  lastMessageAt: string;
}
interface Stats {
  users: number;
  pending: number;
  conversations: number;
  messages: number;
}

type Tab = 'requests' | 'users' | 'chats';
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

export default function AdminPage() {
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const toast = useUi((s) => s.toast);
  const [tab, setTab] = useState<Tab>('requests');
  const [stats, setStats] = useState<Stats | null>(null);

  const loadStats = useCallback(() => {
    api.get('/admin/stats').then(({ data }) => setStats(data)).catch((e) => toast(errorMessage(e), 'error'));
  }, [toast]);
  useEffect(loadStats, [loadStats]);

  if (!me?.isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Shield className="h-10 w-10 text-slate-400" />
        <div className="font-semibold">Admins only</div>
        <button className="btn-primary" onClick={() => navigate('/')}>
          Back to chats
        </button>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { key: 'requests', label: 'Requests', icon: UserCheck, badge: stats?.pending },
    { key: 'users', label: 'Users', icon: Users },
    { key: 'chats', label: 'Chats', icon: MessageSquare },
  ];

  return (
    <div className="relative flex h-full flex-col border-l border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Shield className="h-5 w-5 text-brand-600" />
        <h1 className="text-lg font-semibold">Admin</h1>
      </header>

      <div className="grid grid-cols-2 gap-2 px-3 pt-3 sm:grid-cols-4">
        {[
          ['Users', stats?.users],
          ['Waiting', stats?.pending],
          ['Chats', stats?.conversations],
          ['Messages', stats?.messages],
        ].map(([label, value]) => (
          <div key={label as string} className="card px-3 py-2">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-xl font-semibold">{value ?? '…'}</div>
          </div>
        ))}
      </div>

      <nav className="mx-3 mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1 text-sm font-medium dark:bg-slate-900">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx('flex items-center justify-center gap-1.5 rounded-lg py-2', tab === t.key ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-800 dark:text-brand-300' : 'text-slate-500')}
          >
            <t.icon className="h-4 w-4" /> {t.label}
            {!!t.badge && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold leading-4 text-white">{t.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'requests' && <UsersList status="pending" onChanged={loadStats} />}
        {tab === 'users' && <UsersList status="approved" onChanged={loadStats} />}
        {tab === 'chats' && <ChatsList onChanged={loadStats} />}
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative mb-3">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input pl-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function useDebounce<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function UsersList({ status, onChanged }: { status: 'pending' | 'approved'; onChanged: () => void }) {
  const toast = useUi((s) => s.toast);
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [confirm, setConfirm] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get('/admin/users', { params: { status, q: dq || undefined } })
      .then(({ data }) => setRows(data.users))
      .catch((e) => toast(errorMessage(e), 'error'));
  }, [status, dq, toast]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  async function act(u: AdminUser, kind: 'approve' | 'reject' | 'delete') {
    setBusy(u.id);
    try {
      if (kind === 'delete') await api.delete(`/admin/users/${u.id}`);
      else await api.post(`/admin/users/${u.id}/${kind}`);
      toast(kind === 'approve' ? `${u.username} approved` : kind === 'reject' ? `${u.username} rejected` : `${u.username} deleted`, 'success');
      setConfirm(null);
      load();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search name, username or email" />
      {!rows ? (
        <div className="flex justify-center p-8">
          <Spinner className="h-6 w-6 text-slate-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">{status === 'pending' ? 'No one is waiting for approval.' : 'No users found.'}</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((u) => (
            <li key={u.id} className="card flex items-center gap-3 p-3">
              <Avatar name={u.displayName} url={u.avatarUrl} online={u.approved ? u.isOnline : null} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{u.displayName}</span>
                  {u.isAdmin && <span className="rounded bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700">ADMIN</span>}
                </div>
                <div className="truncate text-xs text-slate-500">
                  @{u.username}
                  {u.email ? ` · ${u.email}` : ''}
                </div>
                <div className="text-[11px] text-slate-400">Joined {fmt(u.createdAt)}</div>
              </div>
              {status === 'pending' ? (
                <div className="flex gap-1.5">
                  <button className="btn-primary h-9 px-3" disabled={busy === u.id} onClick={() => void act(u, 'approve')}>
                    <Check className="h-4 w-4" /> Accept
                  </button>
                  <button className="btn-ghost h-9 px-3 text-red-600" disabled={busy === u.id} onClick={() => void act(u, 'reject')}>
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              ) : (
                !u.isAdmin && (
                  <button className="icon-btn text-red-600" title="Delete user" onClick={() => setConfirm(u)}>
                    <Trash2 className="h-5 w-5" />
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Delete user permanently?">
        <div className="space-y-4 p-4 text-sm">
          <p>
            <b>{confirm?.displayName}</b> (@{confirm?.username}) will be deleted for good: the account, all their messages and files, their private chats and
            their place in groups. They won't be able to log in. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button className="btn-primary bg-red-600 hover:bg-red-700" disabled={!!busy} onClick={() => confirm && void act(confirm, 'delete')}>
              {busy ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete forever
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function ChatsList({ onChanged }: { onChanged: () => void }) {
  const toast = useUi((s) => s.toast);
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [type, setType] = useState<'all' | 'private' | 'group'>('all');
  const [rows, setRows] = useState<AdminConv[] | null>(null);
  const [open, setOpen] = useState<AdminConv | null>(null);

  const load = useCallback(() => {
    api
      .get('/admin/conversations', { params: { q: dq || undefined, type } })
      .then(({ data }) => setRows(data.conversations))
      .catch((e) => toast(errorMessage(e), 'error'));
  }, [dq, type, toast]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search group name or member" />
      <div className="mb-3 flex gap-2">
        {(['all', 'private', 'group'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={clsx('rounded-full px-3 py-1 text-xs font-medium capitalize', type === t ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-600 dark:bg-slate-900 dark:text-slate-400')}
          >
            {t}
          </button>
        ))}
      </div>
      {!rows ? (
        <div className="flex justify-center p-8">
          <Spinner className="h-6 w-6 text-slate-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">No chats found.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <button className="card flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900" onClick={() => setOpen(c)}>
                <Avatar name={c.title} group={c.type === 'group'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.title}</div>
                  <div className="truncate text-xs text-slate-500">
                    {c.type === 'group' ? `${c.participants.length} members · ` : ''}
                    {c.participants.map((p) => '@' + p.username).join(', ')}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>{c.messageCount} msgs</div>
                  <div className="text-[11px] text-slate-400">{fmt(c.lastMessageAt)}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <ChatViewer
          conv={open}
          onClose={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null);
            load();
            onChanged();
          }}
        />
      )}
    </>
  );
}

/** Read-only copy of the real chat screen for admins (same bubbles and background), with delete controls. */
function ChatViewer({ conv, onClose, onDeleted }: { conv: AdminConv; onClose: () => void; onDeleted: () => void }) {
  const toast = useUi((s) => s.toast);
  const chatWall = useWallpaper((s) => s.chat);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [confirmChat, setConfirmChat] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Minimal Conversation object so the normal message bubbles can render it.
  const asConversation = useMemo<Conversation>(
    () => ({
      id: conv.id,
      type: conv.type,
      participants: conv.participants.map((p) => ({ id: p.id, username: p.username, displayName: p.displayName, avatarUrl: null, bio: '', isOnline: null, lastSeen: null, createdAt: null })),
      admins: [],
      createdBy: conv.participants[0]?.id ?? '',
      groupName: conv.type === 'group' ? conv.title : null,
      groupDescription: '',
      groupImageUrl: null,
      permissions: { onlyAdminsCanMessage: false, onlyAdminsCanEditInfo: false, onlyAdminsCanAddMembers: false },
      pinnedMessageIds: [],
      lastMessage: null,
      lastMessageAt: conv.lastMessageAt,
      lastReadAt: null,
      unreadCount: 0,
      createdAt: conv.lastMessageAt,
    }),
    [conv],
  );
  // In a two-person chat the first person is shown on the right, like "me" in the real app.
  const viewAs = conv.type === 'private' ? conv.participants[0]?.id ?? '' : '';

  const load = useCallback(() => {
    api
      .get(`/admin/conversations/${conv.id}/messages`)
      .then(({ data }) => setMessages(data.messages))
      .catch((e) => toast(errorMessage(e), 'error'));
  }, [conv.id, toast]);
  useEffect(load, [load]);

  useEffect(() => {
    if (messages && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages]);

  const actions = useMemo(() => {
    const noop = () => undefined;
    return { onReply: noop, onReact: noop, onForward: noop, onEdit: noop, onDelete: noop, onPin: noop, onRetry: noop, onJumpTo: noop, onCopy: noop };
  }, []);

  async function removeMessage(m: Message) {
    try {
      await api.delete(`/admin/messages/${m.id}`);
      setMessages((list) => (list ?? []).filter((x) => x.id !== m.id));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }
  async function removeChat() {
    try {
      await api.delete(`/admin/conversations/${conv.id}`);
      toast('Chat deleted', 'success');
      onDeleted();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white dark:bg-slate-950">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-900 sm:px-4">
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={conv.title} group={conv.type === 'group'} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{conv.title}</div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">{conv.participants.map((p) => '@' + p.username).join(', ')} · admin view</div>
        </div>
        <button className="btn-ghost text-red-600" onClick={() => setConfirmChat(true)}>
          <Trash2 className="h-4 w-4" /> Delete chat
        </button>
      </header>

      <div className="chat-wallpaper relative min-h-0 flex-1" style={wallStyle(chatWall)}>
        <div ref={scroller} className="scrollbar-thin absolute inset-0 overflow-y-auto py-3">
          {!messages ? (
            <div className="flex justify-center p-8">
              <Spinner className="h-6 w-6 text-slate-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No messages.</div>
          ) : (
            messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                m={m}
                conv={asConversation}
                meId={viewAs}
                showSender={conv.type === 'group' && (i === 0 || messages[i - 1].senderId !== m.senderId)}
                isPinned={false}
                highlighted={false}
                readOnly
                onAdminDelete={(msg) => void removeMessage(msg)}
                {...actions}
                onOpenMedia={(msg) => msg.attachment?.url && window.open(msg.attachment.url, '_blank', 'noopener')}
              />
            ))
          )}
        </div>
      </div>

      <Modal open={confirmChat} onClose={() => setConfirmChat(false)} title="Delete this chat permanently?">
        <div className="space-y-4 p-4 text-sm">
          <p>
            All messages and files in <b>{conv.title}</b> will be deleted for everyone. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirmChat(false)}>
              Cancel
            </button>
            <button className="btn-primary bg-red-600 hover:bg-red-700" onClick={() => void removeChat()}>
              <Trash2 className="h-4 w-4" /> Delete forever
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
