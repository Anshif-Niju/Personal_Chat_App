import { ReactNode, useEffect, useState } from 'react';
import { Check, Clock, MessageCircle, Phone, Search, UserPlus, Users, Video, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useDebounced, useStartChat } from '../lib/hooks';
import { lastSeenLabel } from '../lib/format';
import { useChat } from '../store/chat';
import { useUi } from '../store/ui';
import { useCall } from '../store/call';
import { Avatar, EmptyState, Spinner } from './ui';
import UserProfileModal from './UserProfileModal';
import type { PublicUser, UserWithRelationship } from '../types';

export default function FriendsPanel() {
  const friends = useChat((s) => s.friends);
  const incoming = useChat((s) => s.incoming);
  const outgoing = useChat((s) => s.outgoing);
  const presence = useChat((s) => s.presence);
  const toast = useUi((s) => s.toast);
  const startChat = useStartChat();
  const startCall = useCall((s) => s.startCall);
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 300);
  const [results, setResults] = useState<UserWithRelationship[]>([]);
  const [searching, setSearching] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!q) return setResults([]);
    let cancelled = false;
    setSearching(true);
    api
      .get('/users/search', { params: { q } })
      .then(({ data }) => !cancelled && setResults(data.users))
      .catch((err) => !cancelled && toast(errorMessage(err), 'error'))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [q, toast]);

  const refresh = async () => {
    await Promise.all([useChat.getState().loadRequests(), useChat.getState().loadFriends()]);
  };

  const act = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await fn();
      await refresh();
      if (success) toast(success, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const sendRequest = (u: UserWithRelationship) =>
    act(
      `add-${u.id}`,
      async () => {
        const { data } = await api.post('/friends/requests', { userId: u.id });
        setResults((r) => r.map((x) => (x.id === u.id ? { ...x, relationship: data.status, requestId: data.requestId } : x)));
      },
      'Friend request sent',
    );

  const accept = (id: string) => act(`acc-${id}`, () => api.post(`/friends/requests/${id}/accept`));
  const reject = (id: string) => act(`rej-${id}`, () => api.post(`/friends/requests/${id}/reject`));
  const cancel = (id: string) => act(`can-${id}`, () => api.delete(`/friends/requests/${id}`));

  const peer = (u: PublicUser) => ({ id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl });

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input rounded-full bg-slate-100 pl-9 dark:bg-slate-900"
            placeholder="Find people by @username or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {q ? (
          <Section title="Search results">
            {results.length === 0 && !searching ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">No users found for “{q}”</p>
            ) : (
              results.map((u) => (
                <Row key={u.id} user={u} subtitle={`@${u.username}`} onClick={() => setProfileId(u.id)}>
                  {u.relationship === 'friends' ? (
                    <button className="icon-btn h-9 w-9 text-brand-600" title="Message" onClick={() => void startChat(u.id)}>
                      <MessageCircle className="h-5 w-5" />
                    </button>
                  ) : u.relationship === 'outgoing' ? (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="h-3.5 w-3.5" /> Requested
                    </span>
                  ) : u.relationship === 'incoming' && u.requestId ? (
                    <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => accept(u.requestId!)} disabled={busy === `acc-${u.requestId}`}>
                      Accept
                    </button>
                  ) : (
                    <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => sendRequest(u)} disabled={busy === `add-${u.id}`}>
                      <UserPlus className="h-4 w-4" /> Add
                    </button>
                  )}
                </Row>
              ))
            )}
          </Section>
        ) : (
          <>
            {incoming.length > 0 && (
              <Section title={`Friend requests · ${incoming.length}`}>
                {incoming.map((r) => (
                  <Row key={r.id} user={r.user} subtitle={`@${r.user.username}`} onClick={() => setProfileId(r.user.id)}>
                    <button className="icon-btn h-9 w-9 bg-brand-600 text-white hover:bg-brand-700" title="Accept" onClick={() => accept(r.id)} disabled={busy === `acc-${r.id}`}>
                      <Check className="h-4 w-4" />
                    </button>
                    <button className="icon-btn h-9 w-9" title="Decline" onClick={() => reject(r.id)} disabled={busy === `rej-${r.id}`}>
                      <X className="h-4 w-4" />
                    </button>
                  </Row>
                ))}
              </Section>
            )}
            {outgoing.length > 0 && (
              <Section title="Sent requests">
                {outgoing.map((r) => (
                  <Row key={r.id} user={r.user} subtitle={`@${r.user.username} · pending`} onClick={() => setProfileId(r.user.id)}>
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => cancel(r.id)} disabled={busy === `can-${r.id}`}>
                      Cancel
                    </button>
                  </Row>
                ))}
              </Section>
            )}
            <Section title={`Friends · ${friends.length}`}>
              {friends.length === 0 ? (
                <EmptyState icon={<Users className="h-7 w-7" />} title="No friends yet" text="Search for people by their username above and send a friend request." />
              ) : (
                friends.map((f) => {
                  const p = presence[f.id] ?? f;
                  return (
                    <Row key={f.id} user={{ ...f, ...p }} subtitle={lastSeenLabel(p) || `@${f.username}`} onClick={() => setProfileId(f.id)}>
                      <button className="icon-btn h-9 w-9" title="Message" onClick={() => void startChat(f.id)}>
                        <MessageCircle className="h-[18px] w-[18px]" />
                      </button>
                      <button className="icon-btn h-9 w-9" title="Voice call" onClick={() => void startCall(peer(f), 'audio')}>
                        <Phone className="h-[18px] w-[18px]" />
                      </button>
                      <button className="icon-btn h-9 w-9" title="Video call" onClick={() => void startCall(peer(f), 'video')}>
                        <Video className="h-[18px] w-[18px]" />
                      </button>
                    </Row>
                  );
                })
              )}
            </Section>
          </>
        )}
      </div>
      <UserProfileModal userId={profileId} onClose={() => setProfileId(null)} onChanged={refresh} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-2">
      <h3 className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <ul>{children}</ul>
    </section>
  );
}

function Row({ user, subtitle, onClick, children }: { user: PublicUser; subtitle: string; onClick: () => void; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onClick}>
        <Avatar name={user.displayName} url={user.avatarUrl} online={user.isOnline} />
        <div className="min-w-0">
          <div className="truncate font-medium">{user.displayName}</div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </li>
  );
}
