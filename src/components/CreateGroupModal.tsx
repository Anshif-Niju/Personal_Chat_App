import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Check, Search } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useChat } from '../store/chat';
import { useUi } from '../store/ui';
import { Avatar, Modal, Spinner } from './ui';
import type { PublicUser } from '../types';

/** Pick friends. Used for creating a group and adding members. */
export function FriendPicker({ selected, onToggle, exclude = [] }: { selected: string[]; onToggle: (id: string) => void; exclude?: string[] }) {
  const friends = useChat((s) => s.friends);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^@/, '');
    return friends.filter((f) => !exclude.includes(f.id) && (!s || f.displayName.toLowerCase().includes(s) || f.username.includes(s)));
  }, [friends, q, exclude]);
  return (
    <div>
      <div className="relative px-4">
        <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="mt-2 max-h-72 overflow-y-auto px-2 pb-2">
        {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No friends to add</li>}
        {list.map((f: PublicUser) => {
          const on = selected.includes(f.id);
          return (
            <li key={f.id}>
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => onToggle(f.id)}>
                <Avatar name={f.displayName} url={f.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{f.displayName}</div>
                  <div className="truncate text-xs text-slate-500">@{f.username}</div>
                </div>
                <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full border-2', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-600')}>
                  {on && <Check className="h-3 w-3" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function CreateGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const close = () => {
    setName('');
    setDescription('');
    setSelected([]);
    onClose();
  };

  const create = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/conversations/group', { name: name.trim(), description: description.trim() || undefined, memberIds: selected });
      useChat.getState().upsertConversation(data.conversation);
      close();
      navigate(`/chat/${data.conversation.id}`);
    } catch (err) {
      useUi.getState().toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="New group">
      <div className="space-y-3 p-4">
        <input className="input" placeholder="Group name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <input className="input" placeholder="Description (optional)" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Members · {selected.length} selected</div>
      </div>
      <FriendPicker selected={selected} onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
      <div className="border-t border-slate-100 p-4 dark:border-slate-800">
        <button className="btn-primary w-full" disabled={!name.trim() || selected.length === 0 || loading} onClick={create}>
          {loading && <Spinner className="h-4 w-4" />} Create group
        </button>
      </div>
    </Modal>
  );
}
