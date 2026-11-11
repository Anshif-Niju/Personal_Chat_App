import { ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Bell, Camera, KeyRound, LogOut, Monitor, Moon, Palette, Shield, Smartphone, Sun, Trash2, User, UserX } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../store/auth';
import { useUi, Theme } from '../store/ui';
import { api, errorMessage } from '../lib/api';
import { enableNotifications } from '../lib/notify';
import { Avatar, Modal, Spinner, Toggle } from '../components/ui';
import type { PublicUser, Session, UserSettings, Visibility } from '../types';

function Card({ icon: Icon, title, children }: { icon: typeof User; title: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4" /> {title}
      </h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  return (
    <div className="h-full overflow-y-auto border-l border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-3 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-16">
        <ProfileSection />
        <AppearanceSection />
        <PrivacySection />
        <NotificationsSection />
        <PasswordSection />
        <SessionsSection />
        <BlockedSection />
        <DangerSection />
      </div>
    </div>
  );
}

function ProfileSection() {
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const toast = useUi((s) => s.toast);
  const [form, setForm] = useState({ displayName: user.displayName, username: user.username, bio: user.bio });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = form.displayName !== user.displayName || form.username !== user.username || form.bio !== user.bio;

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch('/users/me', { displayName: form.displayName.trim(), username: form.username.trim().toLowerCase(), bio: form.bio.trim() });
      setUser(data.user);
      toast('Profile updated', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/users/me/avatar', fd);
      setUser(data.user);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card icon={User} title="Profile">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="relative">
          <Avatar name={user.displayName} url={user.avatarUrl} size="xl" />
          <button
            className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white shadow ring-4 ring-white dark:ring-slate-900"
            onClick={() => fileRef.current?.click()}
            aria-label="Change profile photo"
          >
            {uploading ? <Spinner className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          {user.avatarUrl && (
            <button
              className="mt-2 block w-full text-center text-xs text-red-600 hover:underline"
              onClick={async () => {
                const { data } = await api.delete('/users/me/avatar');
                setUser(data.user);
              }}
            >
              Remove photo
            </button>
          )}
        </div>
        <div className="w-full flex-1 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Display name</span>
            <input className="input" value={form.displayName} maxLength={50} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Username</span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-slate-400">@</span>
              <input className="input pl-8" value={form.username} maxLength={30} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">About</span>
            <textarea className="input min-h-20" value={form.bio} maxLength={250} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="About" />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Recovery email: {user.email ?? 'not set'} · private</span>
            <button className="btn-primary" disabled={!dirty || saving || !form.displayName.trim()} onClick={save}>
              {saving && <Spinner className="h-4 w-4" />} Save
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function useSettings() {
  const settings = useUi((s) => s.settings);
  const setSettings = useUi((s) => s.setSettings);
  const toast = useUi((s) => s.toast);
  useEffect(() => {
    if (!settings) api.get('/me/settings').then(({ data }) => setSettings(data.settings)).catch(() => undefined);
  }, [settings, setSettings]);
  const update = async (patch: Partial<{ privacy: Partial<UserSettings['privacy']>; notifications: Partial<UserSettings['notifications']>; theme: Theme }>) => {
    try {
      const { data } = await api.patch('/me/settings', patch);
      setSettings(data.settings);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  return { settings, update };
}

function AppearanceSection() {
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const { update } = useSettings();
  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];
  return (
    <Card icon={Palette} title="Appearance">
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => {
              setTheme(o.value);
              void update({ theme: o.value });
            }}
            className={clsx(
              'flex flex-col items-center gap-2 rounded-xl border-2 py-4 text-sm font-medium transition',
              theme === o.value ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700',
            )}
          >
            <o.icon className="h-5 w-5" /> {o.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function VisibilitySelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm font-medium">{label}</span>
      <select className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const VIS: { value: Visibility; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'friends', label: 'My friends' },
  { value: 'nobody', label: 'Nobody' },
];

function PrivacySection() {
  const { settings, update } = useSettings();
  if (!settings) return null;
  const p = settings.privacy;
  return (
    <Card icon={Shield} title="Privacy">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <VisibilitySelect label="Last seen" value={p.lastSeen} options={VIS} onChange={(v) => void update({ privacy: { lastSeen: v as Visibility } })} />
        <VisibilitySelect label="Online status" value={p.onlineStatus} options={VIS} onChange={(v) => void update({ privacy: { onlineStatus: v as Visibility } })} />
        <VisibilitySelect
          label="Who can send me friend requests"
          value={p.friendRequests}
          options={[
            { value: 'everyone', label: 'Everyone' },
            { value: 'nobody', label: 'Nobody' },
          ]}
          onChange={(v) => void update({ privacy: { friendRequests: v as 'everyone' | 'nobody' } })}
        />
        <VisibilitySelect
          label="Who can call me"
          value={p.calls}
          options={[
            { value: 'friends', label: 'My friends' },
            { value: 'nobody', label: 'Nobody' },
          ]}
          onChange={(v) => void update({ privacy: { calls: v as 'friends' | 'nobody' } })}
        />
        <Toggle
          label="Read receipts"
          description="If turned off, others won't see when you've read their messages."
          checked={p.readReceipts}
          onChange={(v) => void update({ privacy: { readReceipts: v } })}
        />
      </div>
    </Card>
  );
}

function NotificationsSection() {
  const { settings, update } = useSettings();
  const toast = useUi((s) => s.toast);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  if (!settings) return null;
  const n = settings.notifications;
  const set = (k: keyof UserSettings['notifications']) => (v: boolean) => void update({ notifications: { [k]: v } });
  return (
    <Card icon={Bell} title="Notifications">
      {perm !== 'granted' && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-900/30">
          <span>{perm === 'denied' ? 'Browser notifications are blocked. Enable them in your browser site settings.' : 'Get notified about messages and calls when this tab is in the background.'}</span>
          {perm === 'default' && (
            <button
              className="btn-primary shrink-0 px-3 py-1.5 text-xs"
              onClick={async () => {
                const r = await enableNotifications();
                if (r !== 'unsupported') setPerm(r);
                else toast('This browser does not support notifications', 'error');
              }}
            >
              Enable
            </button>
          )}
        </div>
      )}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <Toggle label="Private messages" checked={n.messages} onChange={set('messages')} />
        <Toggle label="Group messages & invites" checked={n.groups} onChange={set('groups')} />
        <Toggle label="Calls" checked={n.calls} onChange={set('calls')} />
        <Toggle label="Friend requests" checked={n.friendRequests} onChange={set('friendRequests')} />
        <Toggle label="Show message preview" description="Show message text in notifications" checked={n.showPreview} onChange={set('showPreview')} />
        <Toggle label="Sounds" checked={n.sound} onChange={set('sound')} />
      </div>
    </Card>
  );
}

function PasswordSection() {
  const toast = useUi((s) => s.toast);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (form.newPassword !== form.confirm) return toast('New passwords do not match', 'error');
    setSaving(true);
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast(`Password changed${data.revokedSessions ? ` · signed out ${data.revokedSessions} other device(s)` : ''}`, 'success');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card icon={KeyRound} title="Change password">
      <div className="grid gap-3 sm:grid-cols-3">
        <input className="input" type="password" placeholder="Current password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        <input className="input" type="password" placeholder="New password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        <input className="input" type="password" placeholder="Confirm new" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">Other devices will be signed out.</span>
        <button className="btn-primary" disabled={saving || !form.currentPassword || form.newPassword.length < 8} onClick={submit}>
          {saving && <Spinner className="h-4 w-4" />} Update
        </button>
      </div>
    </Card>
  );
}

function SessionsSection() {
  const toast = useUi((s) => s.toast);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const load = () => api.get('/me/sessions').then(({ data }) => setSessions(data.sessions)).catch((e) => toast(errorMessage(e), 'error'));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card icon={Smartphone} title="Active sessions">
      {!sessions ? (
        <Spinner className="h-5 w-5 text-slate-400" />
      ) : (
        <>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                  {s.platform === 'ios' || s.platform === 'android' ? <Smartphone className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {s.deviceName} {s.current && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">This device</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {s.ip ? `${s.ip} · ` : ''}active {formatDistanceToNow(new Date(s.lastActive), { addSuffix: true })}
                  </div>
                </div>
                {!s.current && (
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs text-red-600"
                    onClick={async () => {
                      await api.delete(`/me/sessions/${s.id}`).catch((e) => toast(errorMessage(e), 'error'));
                      void load();
                    }}
                  >
                    Log out
                  </button>
                )}
              </li>
            ))}
          </ul>
          {sessions.length > 1 && (
            <button
              className="btn-ghost mt-2 w-full text-red-600"
              onClick={async () => {
                if (!confirm('Log out of all other devices?')) return;
                const { data } = await api.delete('/me/sessions');
                toast(`Signed out ${data.revoked} device(s)`, 'success');
                void load();
              }}
            >
              <LogOut className="h-4 w-4" /> Log out all other devices
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function BlockedSection() {
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const load = () => api.get('/users/me/blocked').then(({ data }) => setUsers(data.users)).catch(() => setUsers([]));
  useEffect(() => {
    void load();
  }, []);
  return (
    <Card icon={UserX} title="Blocked users">
      {!users ? (
        <Spinner className="h-5 w-5 text-slate-400" />
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-500">You haven't blocked anyone.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={u.displayName} url={u.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{u.displayName}</div>
                <div className="text-xs text-slate-500">@{u.username}</div>
              </div>
              <button
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={async () => {
                  await api.delete(`/users/${u.id}/block`);
                  void load();
                }}
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DangerSection() {
  const logout = useAuth((s) => s.logout);
  const clear = useAuth((s) => s.clear);
  const toast = useUi((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card icon={Trash2} title="Account">
      <div className="flex flex-col gap-2 sm:flex-row">
        <button className="btn-ghost flex-1 border border-slate-200 dark:border-slate-700" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" /> Log out
        </button>
        <button className="btn-danger flex-1" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" /> Delete account
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete account">
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This permanently deletes your profile, friends, settings and sessions, and removes you from all groups. Messages you sent remain visible to recipients as “Deleted account”.
          </p>
          <input className="input" type="password" placeholder="Enter your password to confirm" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button
            className="btn-danger w-full"
            disabled={!password || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.delete('/users/me', { data: { password } });
                clear();
              } catch (err) {
                toast(errorMessage(err), 'error');
                setBusy(false);
              }
            }}
          >
            {busy && <Spinner className="h-4 w-4" />} Permanently delete my account
          </button>
        </div>
      </Modal>
    </Card>
  );
}
