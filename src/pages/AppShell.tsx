import { useEffect } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { MessageSquareText } from 'lucide-react';
import { useChat } from '../store/chat';
import { useUi } from '../store/ui';
import { nav, startRealtime } from '../store/realtime';
import { api } from '../lib/api';
import { registerWebPush } from '../lib/notify';
import Sidebar from '../components/Sidebar';
import ChatView from '../components/chat/ChatView';
import CallOverlay from '../components/CallOverlay';
import GroupCallOverlay from '../components/GroupCallOverlay';
import SettingsPage from './Settings';

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
          <Route path="*" element={<Welcome />} />
        </Routes>
      </main>
      <CallOverlay />
      <GroupCallOverlay />
    </div>
  );
}
