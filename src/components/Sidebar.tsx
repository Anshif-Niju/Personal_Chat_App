import { useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { MessageCirclePlus, MessagesSquare, Phone, Search, Settings, Shield, UserPlus, Users, UsersRound } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useChat } from '../store/chat';
import { useWallpaper, wallStyle } from '../store/wallpaper';
import { Avatar, EmptyState } from './ui';
import { chatListTime, conversationTitle, messagePreview, otherParticipant } from '../lib/format';
import FriendsPanel from './FriendsPanel';
import CallsPanel from './CallsPanel';
import NewChatModal from './NewChatModal';
import CreateGroupModal from './CreateGroupModal';
import type { Conversation } from '../types';

export default function Sidebar() {
  const me = useAuth((s) => s.user)!;
  const location = useLocation();
  const incomingCount = useChat((s) => s.incoming.length);
  const totalUnread = useChat((s) => Object.values(s.conversations).reduce((n, c) => n + (c.unreadCount > 0 ? 1 : 0), 0));
  const [newChat, setNewChat] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const listWall = useWallpaper((s) => s.list);

  const tab = location.pathname.startsWith('/friends') ? 'friends' : location.pathname.startsWith('/calls') ? 'calls' : 'chats';

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-950" style={wallStyle(listWall)}>
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <Link to="/settings" className="rounded-full" title="Profile & settings">
          <Avatar name={me.displayName} url={me.avatarUrl} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold tracking-tight">M32 Baddies</div>
        </div>
        <button className="icon-btn" title="New chat" onClick={() => setNewChat(true)}>
          <MessageCirclePlus className="h-5 w-5" />
        </button>
        <button className="icon-btn" title="New group" onClick={() => setNewGroup(true)}>
          <UsersRound className="h-5 w-5" />
        </button>
        {me.isAdmin && (
          <Link to="/admin" className="icon-btn text-brand-600" title="Admin panel">
            <Shield className="h-5 w-5" />
          </Link>
        )}
        <Link to="/settings" className="icon-btn" title="Settings">
          <Settings className="h-5 w-5" />
        </Link>
      </header>

      <nav className="mx-4 mb-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium dark:bg-slate-900">
        {[
          { to: '/', label: 'Chats', icon: MessagesSquare, badge: totalUnread, key: 'chats' },
          { to: '/friends', label: 'Friends', icon: Users, badge: incomingCount, key: 'friends' },
          { to: '/calls', label: 'Calls', icon: Phone, badge: 0, key: 'calls' },
        ].map((t) => (
          <NavLink
            key={t.key}
            to={t.to}
            className={clsx(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 transition',
              tab === t.key ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-800 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.badge > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold leading-4 text-white">{t.badge}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="min-h-0 flex-1">
        {tab === 'chats' && <ChatList onNewChat={() => setNewChat(true)} />}
        {tab === 'friends' && <FriendsPanel />}
        {tab === 'calls' && <CallsPanel />}
      </div>

      <NewChatModal open={newChat} onClose={() => setNewChat(false)} onNewGroup={() => setNewGroup(true)} />
      <CreateGroupModal open={newGroup} onClose={() => setNewGroup(false)} />
    </div>
  );
}

function ChatList({ onNewChat }: { onNewChat: () => void }) {
  const me = useAuth((s) => s.user)!;
  const conversations = useChat((s) => s.conversations);
  const loaded = useChat((s) => s.conversationsLoaded);
  const presence = useChat((s) => s.presence);
  const typing = useChat((s) => s.typing);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const navigate = useNavigate();
  const activeId = useChat((s) => s.activeId);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(conversations)
      .filter((c) => {
        if (filter === 'unread' && c.unreadCount === 0) return false;
        if (filter === 'groups' && c.type !== 'group') return false;
        if (!q) return true;
        const title = conversationTitle(c, me.id).toLowerCase();
        const other = otherParticipant(c, me.id);
        return title.includes(q) || (other?.username.includes(q.replace(/^@/, '')) ?? false);
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [conversations, query, filter, me.id]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input rounded-full bg-slate-100 pl-9 dark:bg-slate-900" placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="mt-2 flex gap-2">
          {(['all', 'unread', 'groups'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'rounded-full px-3 py-1 text-xs font-medium capitalize transition',
                filter === f ? 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-400',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-4">
        {!loaded ? (
          <div className="space-y-1 px-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-3">
                <div className="h-11 w-11 rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-900" />
                </div>
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<MessagesSquare className="h-7 w-7" />}
            title={query || filter !== 'all' ? 'No matching chats' : 'No chats yet'}
            text={undefined}
            action={
              !query && filter === 'all' ? (
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={onNewChat}>
                    <MessageCirclePlus className="h-4 w-4" /> New chat
                  </button>
                  <button className="btn-ghost" onClick={() => navigate('/friends')}>
                    <UserPlus className="h-4 w-4" /> Add friends
                  </button>
                </div>
              ) : undefined
            }
          />
        ) : (
          <ul className="px-2">
            {list.map((c) => (
              <ChatRow key={c.id} c={c} meId={me.id} active={c.id === activeId} online={c.type === 'private' ? presence[otherParticipant(c, me.id)?.id ?? '']?.isOnline : null} typingNames={Object.values(typing[c.id] ?? {})} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChatRow({ c, meId, active, online, typingNames }: { c: Conversation; meId: string; active: boolean; online?: boolean | null; typingNames: string[] }) {
  const other = otherParticipant(c, meId);
  const title = conversationTitle(c, meId);
  const customBg = useWallpaper((s) => s.list.kind !== 'default');
  const preview = typingNames.length
    ? c.type === 'group'
      ? `${typingNames[0]} is typing…`
      : 'typing…'
    : messagePreview(c.lastMessage, c, meId);
  return (
    <li className={clsx(customBg && 'mb-1 rounded-xl bg-white/85 dark:bg-slate-900/85')}>
      <Link
        to={`/chat/${c.id}`}
        className={clsx(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 transition',
          active ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-900',
        )}
      >
        <Avatar name={title} url={c.type === 'group' ? c.groupImageUrl : other?.avatarUrl} online={online} group={c.type === 'group'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold">{title}</span>
            <span className={clsx('shrink-0 text-xs', c.unreadCount ? 'font-semibold text-brand-600 dark:text-brand-400' : 'text-slate-400')}>
              {chatListTime(c.lastMessage?.createdAt ?? c.lastMessageAt)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className={clsx('truncate text-sm', typingNames.length ? 'font-medium text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400')}>{preview}</span>
            {c.unreadCount > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
                {c.unreadCount > 99 ? '99+' : c.unreadCount}
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
