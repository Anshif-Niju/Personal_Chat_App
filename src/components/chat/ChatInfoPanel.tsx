import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Ban, Camera, Check, Eraser, FileText, Flag, LogOut, Pencil, Shield, ShieldOff, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import { useChat } from '../../store/chat';
import { useUi } from '../../store/ui';
import { api, errorMessage } from '../../lib/api';
import { conversationTitle, fileSize, lastSeenLabel, otherParticipant } from '../../lib/format';
import { Avatar, Modal, Spinner, Toggle } from '../ui';
import { FriendPicker } from '../CreateGroupModal';
import UserProfileModal from '../UserProfileModal';
import type { Conversation, Message } from '../../types';

export default function ChatInfoPanel({ conv, onClose, onOpenMedia }: { conv: Conversation; onClose: () => void; onOpenMedia: (m: Message) => void }) {
  const me = useAuth((s) => s.user)!;
  const presence = useChat((s) => s.presence);
  const toast = useUi((s) => s.toast);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(conv.groupName ?? '');
  const [description, setDescription] = useState(conv.groupDescription);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isGroup = conv.type === 'group';
  const isAdmin = conv.admins.includes(me.id);
  const canEditInfo = isGroup && (isAdmin || !conv.permissions.onlyAdminsCanEditInfo);
  const canAdd = isGroup && (isAdmin || !conv.permissions.onlyAdminsCanAddMembers);
  const other = otherParticipant(conv, me.id);
  const title = conversationTitle(conv, me.id);

  useEffect(() => {
    setName(conv.groupName ?? '');
    setDescription(conv.groupDescription);
  }, [conv.groupName, conv.groupDescription]);

  const run = async (fn: () => Promise<{ data: { conversation?: Conversation } }>, ok?: string) => {
    setBusy(true);
    try {
      const { data } = await fn();
      if (data.conversation) useChat.getState().upsertConversation(data.conversation);
      if (ok) toast(ok, 'success');
      return true;
    } catch (err) {
      toast(errorMessage(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadIcon = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    await run(() => api.post(`/conversations/${conv.id}/avatar`, form), 'Group icon updated');
  };

  const sortedMembers = [...conv.participants].sort((a, b) => {
    const aa = conv.admins.includes(a.id) ? 0 : 1;
    const bb = conv.admins.includes(b.id) ? 0 : 1;
    return aa - bb || a.displayName.localeCompare(b.displayName);
  });

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <button className="icon-btn -ml-2" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-semibold">{isGroup ? 'Group info' : 'Contact info'}</h2>
      </header>

      <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto pb-8">
        <section className="flex flex-col items-center bg-white px-6 py-6 text-center dark:bg-slate-900">
          <div className="relative">
            <Avatar name={title} url={isGroup ? conv.groupImageUrl : other?.avatarUrl} size="xl" group={isGroup} />
            {canEditInfo && (
              <>
                <button
                  className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white shadow ring-4 ring-white dark:ring-slate-900"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Change group icon"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={(e) => e.target.files?.[0] && void uploadIcon(e.target.files[0])} />
              </>
            )}
          </div>
          {editing ? (
            <div className="mt-4 w-full space-y-2">
              <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              <textarea className="input min-h-20" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="Group description" />
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button
                  className="btn-primary flex-1"
                  disabled={!name.trim() || busy}
                  onClick={async () => {
                    if (await run(() => api.patch(`/conversations/${conv.id}`, { name: name.trim(), description: description.trim() }))) setEditing(false);
                  }}
                >
                  <Check className="h-4 w-4" /> Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <h3 className="mt-3 flex items-center gap-2 text-xl font-semibold">
                {title}
                {canEditInfo && (
                  <button className="text-slate-400 hover:text-brand-600" onClick={() => setEditing(true)} aria-label="Edit group">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </h3>
              {isGroup ? (
                <p className="text-sm text-slate-500">Group · {conv.participants.length} members</p>
              ) : (
                other && (
                  <>
                    <p className="text-sm text-slate-500">@{other.username}</p>
                    <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">{lastSeenLabel(presence[other.id] ?? other)}</p>
                  </>
                )
              )}
            </>
          )}
        </section>

        {!editing && (isGroup ? conv.groupDescription : other?.bio) && (
          <section className="bg-white px-5 py-4 dark:bg-slate-900">
            <div className="text-xs font-semibold uppercase text-slate-400">{isGroup ? 'Description' : 'About'}</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{isGroup ? conv.groupDescription : other?.bio}</p>
            {isGroup && <p className="mt-2 text-xs text-slate-400">Created {format(new Date(conv.createdAt), 'd MMM yyyy')}</p>}
          </section>
        )}

        <MediaGallery conversationId={conv.id} onOpen={onOpenMedia} />

        {isGroup && isAdmin && (
          <section className="bg-white px-5 py-2 dark:bg-slate-900">
            <div className="pt-2 text-xs font-semibold uppercase text-slate-400">Group permissions</div>
            <Toggle
              label="Only admins can send messages"
              checked={conv.permissions.onlyAdminsCanMessage}
              onChange={(v) => void run(() => api.patch(`/conversations/${conv.id}`, { permissions: { onlyAdminsCanMessage: v } }))}
            />
            <Toggle
              label="Only admins can edit group info"
              checked={conv.permissions.onlyAdminsCanEditInfo}
              onChange={(v) => void run(() => api.patch(`/conversations/${conv.id}`, { permissions: { onlyAdminsCanEditInfo: v } }))}
            />
            <Toggle
              label="Only admins can add members"
              checked={conv.permissions.onlyAdminsCanAddMembers}
              onChange={(v) => void run(() => api.patch(`/conversations/${conv.id}`, { permissions: { onlyAdminsCanAddMembers: v } }))}
            />
          </section>
        )}

        {isGroup && (
          <section className="bg-white py-2 dark:bg-slate-900">
            <div className="flex items-center justify-between px-5 py-2">
              <span className="text-xs font-semibold uppercase text-slate-400">{conv.participants.length} members</span>
            </div>
            {canAdd && (
              <button className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => setAdding(true)}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white">
                  <UserPlus className="h-5 w-5" />
                </span>
                <span className="font-medium">Add members</span>
              </button>
            )}
            {sortedMembers.map((u) => {
              const admin = conv.admins.includes(u.id);
              return (
                <div key={u.id} className="group flex items-center gap-3 px-5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => u.id !== me.id && setProfileId(u.id)}>
                    <Avatar name={u.displayName} url={u.avatarUrl} online={presence[u.id]?.isOnline ?? u.isOnline} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{u.id === me.id ? 'You' : u.displayName}</div>
                      <div className="truncate text-xs text-slate-500">@{u.username}</div>
                    </div>
                  </button>
                  {admin && <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">Admin</span>}
                  {isAdmin && u.id !== me.id && (
                    <div className="flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        className="icon-btn h-8 w-8"
                        title={admin ? 'Dismiss as admin' : 'Make admin'}
                        onClick={() => void run(() => (admin ? api.delete(`/conversations/${conv.id}/admins/${u.id}`) : api.post(`/conversations/${conv.id}/admins/${u.id}`)))}
                      >
                        {admin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      </button>
                      <button
                        className="icon-btn h-8 w-8 text-red-600"
                        title="Remove from group"
                        onClick={() => confirm(`Remove ${u.displayName} from the group?`) && void run(() => api.delete(`/conversations/${conv.id}/members/${u.id}`))}
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <section className="bg-white py-1 dark:bg-slate-900">
          <ActionRow
            icon={Eraser}
            label="Clear chat"
            onClick={() =>
              confirm('Clear all messages in this chat for you? Others will still see them.') &&
              void run(() => api.post(`/conversations/${conv.id}/clear`), 'Chat cleared').then(() => {
                useChat.setState((s) => ({ messages: { ...s.messages, [conv.id]: { items: [], hasMore: false, loading: false, loaded: true } } }));
              })
            }
          />
          {!isGroup && other && (
            <>
              <ActionRow
                icon={Ban}
                label={`Block ${other.displayName}`}
                danger
                onClick={() =>
                  confirm(`Block @${other.username}? They won't be able to message or call you.`) &&
                  void api
                    .post(`/users/${other.id}/block`)
                    .then(() => toast('User blocked', 'success'))
                    .catch((e) => toast(errorMessage(e), 'error'))
                }
              />
              <ActionRow icon={Flag} label={`Report ${other.displayName}`} danger onClick={() => setProfileId(other.id)} />
            </>
          )}
          {isGroup && (
            <ActionRow
              icon={LogOut}
              label="Exit group"
              danger
              onClick={async () => {
                if (!confirm('Leave this group?')) return;
                try {
                  await api.post(`/conversations/${conv.id}/leave`);
                  useChat.getState().removeConversation(conv.id);
                  navigate('/');
                } catch (err) {
                  toast(errorMessage(err), 'error');
                }
              }}
            />
          )}
          {isGroup && isAdmin && (
            <ActionRow
              icon={Trash2}
              label="Delete group for everyone"
              danger
              onClick={async () => {
                if (!confirm('Delete this group and all its messages for every member? This cannot be undone.')) return;
                try {
                  await api.delete(`/conversations/${conv.id}`);
                  useChat.getState().removeConversation(conv.id);
                  navigate('/');
                } catch (err) {
                  toast(errorMessage(err), 'error');
                }
              }}
            />
          )}
        </section>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add members">
        <div className="pt-4">
          <FriendPicker selected={toAdd} exclude={conv.participants.map((p) => p.id)} onToggle={(id) => setToAdd((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
        </div>
        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          <button
            className="btn-primary w-full"
            disabled={!toAdd.length || busy}
            onClick={async () => {
              if (await run(() => api.post(`/conversations/${conv.id}/members`, { userIds: toAdd }), 'Members added')) {
                setAdding(false);
                setToAdd([]);
              }
            }}
          >
            {busy && <Spinner className="h-4 w-4" />} Add {toAdd.length ? `(${toAdd.length})` : ''}
          </button>
        </div>
      </Modal>
      <UserProfileModal userId={profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}

function ActionRow({ icon: Icon, label, onClick, danger }: { icon: typeof Ban; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className={clsx('flex w-full items-center gap-4 px-5 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800', danger && 'text-red-600')} onClick={onClick}>
      <Icon className="h-5 w-5" /> {label}
    </button>
  );
}

function MediaGallery({ conversationId, onOpen }: { conversationId: string; onOpen: (m: Message) => void }) {
  const [kind, setKind] = useState<'media' | 'files' | 'audio'>('media');
  const [items, setItems] = useState<Message[] | null>(null);
  const lastMessageId = useChat((s) => s.conversations[conversationId]?.lastMessage?.id);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    api
      .get(`/conversations/${conversationId}/media`, { params: { kind } })
      .then(({ data }) => !cancelled && setItems(data.items))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [conversationId, kind, lastMessageId]);

  return (
    <section className="bg-white px-5 py-4 dark:bg-slate-900">
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-medium dark:bg-slate-800">
        {(['media', 'files', 'audio'] as const).map((k) => (
          <button key={k} className={clsx('flex-1 rounded-md py-1.5 capitalize', kind === k ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500')} onClick={() => setKind(k)}>
            {k === 'media' ? 'Media' : k === 'files' ? 'Docs' : 'Audio'}
          </button>
        ))}
      </div>
      {!items ? (
        <div className="flex justify-center py-4">
          <Spinner className="h-5 w-5 text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Nothing shared yet</p>
      ) : kind === 'media' ? (
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((m) =>
            m.attachment?.url ? (
              <button key={m.id} className="aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800" onClick={() => onOpen(m)}>
                {m.messageType === 'video' ? (
                  <video src={m.attachment.url} className="h-full w-full object-cover" preload="metadata" muted />
                ) : (
                  <img src={m.attachment.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </button>
            ) : null,
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id}>
              {kind === 'audio' && m.attachment?.url ? (
                <audio src={m.attachment.url} controls preload="none" className="h-9 w-full" />
              ) : (
                <a href={m.attachment?.url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <FileText className="h-8 w-8 shrink-0 text-brand-600" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.attachment?.name}</div>
                    <div className="text-xs text-slate-500">{m.attachment ? fileSize(m.attachment.size) : ''} · {format(new Date(m.createdAt), 'd MMM yyyy')}</div>
                  </div>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
