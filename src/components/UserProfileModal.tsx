import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Ban, Flag, MessageCircle, Phone, UserMinus, UserPlus, Video } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { lastSeenLabel } from '../lib/format';
import { useStartChat } from '../lib/hooks';
import { useCall } from '../store/call';
import { useChat } from '../store/chat';
import { useUi } from '../store/ui';
import { Avatar, Modal, Spinner } from './ui';
import type { UserWithRelationship } from '../types';

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Something else' },
];

export default function UserProfileModal({ userId, onClose, onChanged }: { userId: string | null; onClose: () => void; onChanged?: () => void }) {
  const [user, setUser] = useState<UserWithRelationship | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const presence = useChat((s) => (userId ? s.presence[userId] : undefined));
  const startChat = useStartChat();
  const startCall = useCall((s) => s.startCall);
  const toast = useUi((s) => s.toast);

  const load = async (id: string) => {
    try {
      const { data } = await api.get(`/users/${id}`);
      setUser(data.user);
    } catch (err) {
      toast(errorMessage(err), 'error');
      onClose();
    }
  };

  useEffect(() => {
    setUser(null);
    setReporting(false);
    if (userId) void load(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    if (!user) return;
    setBusy(true);
    try {
      await fn();
      if (msg) toast(msg, 'success');
      await load(user.id);
      onChanged?.();
      void useChat.getState().loadFriends();
      void useChat.getState().loadRequests();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const p = user ? (presence ?? user) : null;
  const peer = user && { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl };

  return (
    <Modal open={!!userId} onClose={onClose} title="Profile">
      {!user ? (
        <div className="flex justify-center p-10">
          <Spinner className="h-6 w-6 text-slate-400" />
        </div>
      ) : reporting ? (
        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Report <b>@{user.username}</b>. Reports are confidential — they won't know it was you.
          </p>
          <div className="space-y-2">
            {REASONS.map((r) => (
              <label key={r.value} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-brand-600" />
                <span className="text-sm">{r.label}</span>
              </label>
            ))}
          </div>
          <textarea className="input min-h-20" placeholder="Details (optional)" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setReporting(false)}>
              Cancel
            </button>
            <button
              className="btn-danger flex-1"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api.post(`/users/${user.id}/report`, { reason, details: details || undefined, alsoBlock: true });
                  setReporting(false);
                }, 'Report sent and user blocked')
              }
            >
              Report & block
            </button>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <div className="flex flex-col items-center text-center">
            <Avatar name={user.displayName} url={user.avatarUrl} size="xl" online={p?.isOnline} />
            <h3 className="mt-3 text-xl font-semibold">{user.displayName}</h3>
            <div className="text-sm text-slate-500">@{user.username}</div>
            {p && lastSeenLabel(p) && <div className="mt-1 text-xs text-brand-600 dark:text-brand-400">{lastSeenLabel(p)}</div>}
          </div>
          {user.bio && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">{user.bio}</p>}
          {user.createdAt && <p className="mt-3 text-center text-xs text-slate-400">Joined {format(new Date(user.createdAt), 'MMMM yyyy')}</p>}

          {user.relationship === 'friends' && peer && (
            <div className="mt-5 grid grid-cols-3 gap-2">
              <button className="btn-ghost flex-col gap-1 py-3" onClick={() => { onClose(); void startChat(user.id); }}>
                <MessageCircle className="h-5 w-5 text-brand-600" /> <span className="text-xs">Message</span>
              </button>
              <button className="btn-ghost flex-col gap-1 py-3" onClick={() => { onClose(); void startCall(peer, 'audio'); }}>
                <Phone className="h-5 w-5 text-brand-600" /> <span className="text-xs">Voice</span>
              </button>
              <button className="btn-ghost flex-col gap-1 py-3" onClick={() => { onClose(); void startCall(peer, 'video'); }}>
                <Video className="h-5 w-5 text-brand-600" /> <span className="text-xs">Video</span>
              </button>
            </div>
          )}

          <div className="mt-5 space-y-1 border-t border-slate-100 pt-4 dark:border-slate-800">
            {user.relationship === 'none' && (
              <button className="btn-primary w-full" disabled={busy} onClick={() => run(() => api.post('/friends/requests', { userId: user.id }), 'Friend request sent')}>
                <UserPlus className="h-4 w-4" /> Add friend
              </button>
            )}
            {user.relationship === 'incoming' && user.requestId && (
              <button className="btn-primary w-full" disabled={busy} onClick={() => run(() => api.post(`/friends/requests/${user.requestId}/accept`), 'You are now friends')}>
                Accept friend request
              </button>
            )}
            {user.relationship === 'outgoing' && user.requestId && (
              <button className="btn-ghost w-full" disabled={busy} onClick={() => run(() => api.delete(`/friends/requests/${user.requestId}`))}>
                Cancel friend request
              </button>
            )}
            {user.relationship === 'friends' && (
              <button
                className="btn-ghost w-full justify-start text-red-600"
                disabled={busy}
                onClick={() => confirm(`Remove ${user.displayName} from your friends?`) && run(() => api.delete(`/friends/${user.id}`), 'Friend removed')}
              >
                <UserMinus className="h-4 w-4" /> Remove friend
              </button>
            )}
            {user.relationship === 'blocked' ? (
              <button className="btn-ghost w-full justify-start" disabled={busy} onClick={() => run(() => api.delete(`/users/${user.id}/block`), 'User unblocked')}>
                <Ban className="h-4 w-4" /> Unblock
              </button>
            ) : (
              user.relationship !== 'self' && (
                <button
                  className="btn-ghost w-full justify-start text-red-600"
                  disabled={busy}
                  onClick={() => confirm(`Block @${user.username}? They won't be able to message or call you.`) && run(() => api.post(`/users/${user.id}/block`), 'User blocked')}
                >
                  <Ban className="h-4 w-4" /> Block
                </button>
              )
            )}
            {user.relationship !== 'self' && (
              <button className="btn-ghost w-full justify-start text-red-600" onClick={() => setReporting(true)}>
                <Flag className="h-4 w-4" /> Report
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
