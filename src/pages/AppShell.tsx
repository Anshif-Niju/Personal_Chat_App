import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, MessageSquareText, X } from 'lucide-react';
import { useChat } from '../store/chat';
import { useUi } from '../store/ui';
import { nav, startRealtime } from '../store/realtime';
import { api } from '../lib/api';
import { enableNotifications, registerWebPush } from '../lib/notify';
import Sidebar from '../components/Sidebar';
import ChatView from '../components/chat/ChatView';
import CallOverlay from '../components/CallOverlay';
import GroupCallOverlay from '../components/GroupCallOverlay';
import SettingsPage from './Settings';
import AdminPage from './Admin';

/** Asks (once per browser) to turn on notifications so messages and calls arrive even when the app is closed. */
function NotificationPrompt() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [show, setShow] = useState(() => {
    if (!supported || Notification.permission !== 'default') return false;
    try {
      return localStorage.getItem('pc-notif-dismissed') !== '1';
    } catch {
      return true;
    }
  });
  if (!show) return null;
  const dismiss = () => {
    try {
      localStorage.setItem('pc-notif-dismissed', '1');
    } catch {
      /* ignore */
    }
    setShow(false);
  };
  return (
    <div className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-2xl">
      <Bell className="h-5 w-5 shrink-0 text-brand-300" />
      <span className="min-w-0 flex-1">Turn on notifications to get messages and calls even when the app is closed.</span>
      <button
        className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 font-medium hover:bg-brand-700"
        onClick={async () => {
          await enableNotifications();
          setShow(false);
        }}
      >
        Turn on
      </button>
      <button className="shrink-0 rounded-full p-1 hover:bg-white/10" onClick={dismiss} aria-label="Not now">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Welcome() {
  return (
    <div className="hidden h-full flex-col items-center justify-center gap-4 border-l border-slate-200 bg-slate-50 px-8 text-center dark:border-slate-800 dark:bg-slate-900/60 md:flex">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
        <MessageSquareText className="h-10 w-10" />
      </div>
      <h2 className="text-2xl font-semibold">M32 Baddies</h2>
    </div>
  );
}

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    nav.open = (path) => navigate(path);
    startRealtime();
    const chat = useChat.getState();
    void chat.loadConversations().catch(() => undefined);
    void chat.loadFriends().catch(() => undefined);
    void chat.loadRequests().catch(() => undefined);
    api
      .get('/me/settings')
      .then(({ data }) => useUi.getState().setSettings(data.settings))
      .catch(() => undefined);
    void registerWebPush().catch(() => undefined);
    return () => useChat.getState().reset();
  }, [navigate]);

  const path = location.pathname;
  const listRoute = path === '/' || path === '/friends' || path === '/calls';

  return (
    <div className="flex h-full overflow-hidden bg-white dark:bg-slate-950">
      <aside
        className={clsx(
          'h-full w-full flex-col border-slate-200 dark:border-slate-800 md:flex md:w-[360px] md:shrink-0 lg:w-[400px]',
          listRoute ? 'flex' : 'hidden',
        )}
      >
        <Sidebar />
      </aside>
      <main className={clsx('h-full min-w-0 flex-1', listRoute ? 'hidden md:block' : 'block')}>
        <Routes>
          <Route path="/chat/:id" element={<ChatView />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Welcome />} />
        </Routes>
      </main>
      <CallOverlay />
      <GroupCallOverlay />
      <NotificationPrompt />
    </div>
  );
}
