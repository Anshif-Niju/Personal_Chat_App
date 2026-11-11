import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Mic, MicOff, PhoneOff, Phone, ScreenShare, ScreenShareOff, Video, VideoOff, Users } from 'lucide-react';
import { useGroupCall, GroupPeer } from '../store/groupCall';
import { useNow } from '../lib/hooks';
import { duration } from '../lib/format';
import { Avatar } from './ui';

function Tile({ user, stream, local, showVideo, muted }: { user: GroupPeer; stream: MediaStream | null; local?: boolean; showVideo: boolean; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);
  const hasVideo = showVideo && !!stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
  return (
    <div className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-800">
      {/* Always mounted so remote audio plays even when the video is hidden. */}
      <video ref={ref} autoPlay playsInline muted={local} className={clsx('h-full w-full object-cover', local && 'scale-x-[-1]', !hasVideo && 'invisible absolute')} />
      {!hasVideo && <Avatar name={user.displayName} url={user.avatarUrl} size="xl" />}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">
        {muted && <MicOff className="h-3 w-3" />}
        {local ? 'You' : user.displayName}
      </div>
    </div>
  );
}

export default function GroupCallOverlay() {
  const s = useGroupCall();
  const now = useNow(1000);

  if (s.status === 'idle' || !s.call) return null;
  const call = s.call;
  const isVideo = call.callType === 'video';

  if (s.status === 'incoming') {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-slate-950/95 px-6 text-center text-white">
        <Avatar name={call.groupName} group size="xl" />
        <div>
          <div className="text-2xl font-semibold">{call.groupName}</div>
          <div className="mt-1 text-white/70">
            {call.startedBy.displayName} started a group {isVideo ? 'video' : 'voice'} call
          </div>
        </div>
        <div className="mt-6 flex gap-10">
          <button onClick={s.dismiss} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 hover:bg-red-700" aria-label="Decline">
            <PhoneOff className="h-7 w-7" />
          </button>
          <button onClick={() => void s.accept()} className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-700" aria-label="Join">
            {isVideo ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
          </button>
        </div>
      </div>
    );
  }

  const remotes = Object.values(s.peers);
  const total = remotes.length + 1;
  const cols = total <= 1 ? 'grid-cols-1' : total <= 4 ? 'grid-cols-2' : 'grid-cols-3';
  const selfUser: GroupPeer = { id: 'me', username: '', displayName: 'You', avatarUrl: null };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <Users className="h-5 w-5 text-white/70" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{call.groupName}</div>
          <div className="text-xs text-white/60">
            {s.status === 'connecting' ? 'Connecting…' : s.startedAt ? duration((now - s.startedAt) / 1000) : ''} · {total} in call
          </div>
        </div>
      </div>

      <div className={clsx('grid min-h-0 flex-1 gap-2 px-2 pb-2 sm:px-4', cols)} style={{ gridAutoRows: '1fr' }}>
        <Tile user={selfUser} stream={s.screenStream ?? s.localStream} local showVideo={isVideo && (!!s.screenStream || !s.cameraOff)} muted={s.micMuted} />
        {remotes.map((p) => (
          <Tile key={p.user.id} user={p.user} stream={p.stream} showVideo={isVideo} />
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2">
        <button onClick={s.toggleMic} className={clsx('flex h-14 w-14 items-center justify-center rounded-full', s.micMuted ? 'bg-white text-slate-900' : 'bg-white/15 hover:bg-white/25')} aria-label="Mute">
          {s.micMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>
        {isVideo && (
          <button onClick={s.toggleCamera} className={clsx('flex h-14 w-14 items-center justify-center rounded-full', s.cameraOff ? 'bg-white text-slate-900' : 'bg-white/15 hover:bg-white/25')} aria-label="Camera">
            {s.cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </button>
        )}
        {isVideo && typeof navigator.mediaDevices?.getDisplayMedia === 'function' && (
          <button onClick={() => void s.toggleScreenShare()} className={clsx('flex h-14 w-14 items-center justify-center rounded-full', s.screenStream ? 'bg-white text-slate-900' : 'bg-white/15 hover:bg-white/25')} aria-label={s.screenStream ? 'Stop sharing screen' : 'Share screen'} title={s.screenStream ? 'Stop sharing' : 'Share screen'}>
            {s.screenStream ? <ScreenShareOff className="h-6 w-6" /> : <ScreenShare className="h-6 w-6" />}
          </button>
        )}
        <button onClick={s.leave} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 hover:bg-red-700" aria-label="Leave call">
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
