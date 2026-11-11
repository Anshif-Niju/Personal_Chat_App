import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { PhoneIncoming, PhoneMissed, PhoneOutgoing, Phone, Video } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { chatListTime, duration } from '../lib/format';
import { useCall } from '../store/call';
import { useUi } from '../store/ui';
import { Avatar, EmptyState, Spinner } from './ui';
import type { CallLog } from '../types';

export default function CallsPanel() {
  const [calls, setCalls] = useState<CallLog[] | null>(null);
  const startCall = useCall((s) => s.startCall);
  const callStatus = useCall((s) => s.status);

  useEffect(() => {
    if (callStatus !== 'idle') return;
    api
      .get('/calls')
      .then(({ data }) => setCalls(data.calls))
      .catch((err) => useUi.getState().toast(errorMessage(err), 'error'));
  }, [callStatus]);

  if (!calls) return <div className="flex justify-center p-8"><Spinner className="h-6 w-6 text-slate-400" /></div>;
  if (calls.length === 0) return <EmptyState icon={<Phone className="h-7 w-7" />} title="No calls yet" text="Voice and video calls with your friends show up here." />;

  return (
    <ul className="scrollbar-thin h-full overflow-y-auto px-2 pb-6">
      {calls.map((c) => {
        const missed = c.direction === 'incoming' && (c.status === 'missed' || c.status === 'busy');
        const Icon = missed ? PhoneMissed : c.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
        const label =
          c.status === 'ended'
            ? duration(c.duration)
            : c.status === 'missed'
              ? c.direction === 'incoming' ? 'Missed' : 'No answer'
              : c.status === 'rejected'
                ? 'Declined'
                : c.status === 'busy'
                  ? 'Busy'
                  : c.status;
        return (
          <li key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900">
            <Avatar name={c.peer?.displayName ?? 'Deleted account'} url={c.peer?.avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className={clsx('truncate font-medium', missed && 'text-red-600 dark:text-red-400')}>{c.peer?.displayName ?? 'Deleted account'}</div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Icon className={clsx('h-3.5 w-3.5', missed ? 'text-red-500' : 'text-emerald-500')} />
                {c.callType === 'video' ? 'Video' : 'Voice'} · {label} · {chatListTime(c.createdAt)}
              </div>
            </div>
            {c.peer && (
              <button
                className="icon-btn h-9 w-9 text-brand-600"
                title={`${c.callType === 'video' ? 'Video' : 'Voice'} call`}
                onClick={() => void startCall({ id: c.peer!.id, username: c.peer!.username, displayName: c.peer!.displayName, avatarUrl: c.peer!.avatarUrl }, c.callType)}
              >
                {c.callType === 'video' ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
