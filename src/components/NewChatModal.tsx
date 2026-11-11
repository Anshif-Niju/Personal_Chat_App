import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, UsersRound } from 'lucide-react';
import { useChat } from '../store/chat';
import { useStartChat } from '../lib/hooks';
import { Avatar, EmptyState, Modal } from './ui';

export default function NewChatModal({ open, onClose, onNewGroup }: { open: boolean; onClose: () => void; onNewGroup: () => void }) {
  const friends = useChat((s) => s.friends);
  const [q, setQ] = useState('');
  const startChat = useStartChat();
  const navigate = useNavigate();

  const list = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^@/, '');
    return friends.filter((f) => !s || f.displayName.toLowerCase().includes(s) || f.username.includes(s));
  }, [friends, q]);

  return (
    <Modal open={open} onClose={onClose} title="New chat">
      <div className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-ghost justify-start" onClick={() => { onClose(); onNewGroup(); }}>
            <UsersRound className="h-5 w-5 text-brand-600" /> New group
          </button>
          <button className="btn-ghost justify-start" onClick={() => { onClose(); navigate('/friends'); }}>
            <UserPlus className="h-5 w-5 text-brand-600" /> Add friend
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<UserPlus className="h-7 w-7" />} title={friends.length ? 'No matches' : 'No friends yet'} text="You can chat with people once they accept your friend request." />
      ) : (
        <ul className="px-2 pb-4">
          {list.map((f) => (
            <li key={f.id}>
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                onClick={async () => {
                  const c = await startChat(f.id);
                  if (c) onClose();
                }}
              >
                <Avatar name={f.displayName} url={f.avatarUrl} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{f.displayName}</div>
                  <div className="truncate text-xs text-slate-500">@{f.username}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
