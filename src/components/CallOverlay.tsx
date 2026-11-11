import { ReactNode, RefObject, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Maximize2, Mic, MicOff, Minimize2, Phone, PhoneOff, PictureInPicture2, RefreshCcw, ScreenShare, ScreenShareOff, Settings2, Video, VideoOff, WifiOff } from 'lucide-react';
import { useCall } from '../store/call';
import { useNow } from '../lib/hooks';
import { duration } from '../lib/format';
import { Avatar } from './ui';

type SinkMedia = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };

/** renderKey changes whenever the media element may have been (re)mounted. */
function useAttachStream(ref: RefObject<HTMLMediaElement | null>, stream: MediaStream | null, renderKey: string, sinkId?: string) {
  useEffect(() => {
    const el = ref.current as SinkMedia | null;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [ref, stream, renderKey]);
  useEffect(() => {
    const el = ref.current as SinkMedia | null;
    if (el?.setSinkId && sinkId) void el.setSinkId(sinkId).catch(() => undefined);
  }, [ref, sinkId, renderKey]);
}

export default function CallOverlay() {
  const s = useCall();
  const [minimized, setMinimized] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const now = useNow(1000);

  const isVideo = s.callType === 'video';
  const renderKey = `${s.status}-${minimized}-${s.cameraOff}-${!!s.screenStream}-${s.remoteSharing}`;
  useAttachStream(remoteVideo, isVideo || s.remoteSharing ? s.remoteStream : null, renderKey, s.selected.audioOut);
  useAttachStream(localVideo, isVideo || s.screenStream ? s.screenStream ?? s.localStream : null, renderKey);
  useAttachStream(remoteAudio, !isVideo ? s.remoteStream : null, renderKey, s.selected.audioOut);

  useEffect(() => {
    if (s.status === 'idle') {
      setMinimized(false);
      setShowDevices(false);
    }
  }, [s.status]);

  useEffect(() => {
    if (showDevices) void s.refreshDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDevices]);

  if (s.status === 'idle' || !s.peer) return null;

  const statusText =
    s.status === 'incoming'
      ? `Incoming ${isVideo ? 'video' : 'voice'} call`
      : s.status === 'outgoing'
        ? s.callId
          ? 'Ringing…'
          : 'Calling…'
        : s.status === 'connecting'
          ? 'Connecting…'
          : s.status === 'ended'
            ? s.endedLabel ?? 'Call ended'
            : s.reconnecting
              ? 'Reconnecting…'
              : s.startedAt
                ? duration((now - s.startedAt) / 1000)
                : '';

  const showRemoteVideo = isVideo || s.remoteSharing;
  const remoteHasVideo = showRemoteVideo && !!s.remoteStream?.getVideoTracks().some((t) => t.readyState === 'live');
  const inCall = s.status === 'active' || s.status === 'connecting' || s.status === 'outgoing';

  if (minimized && inCall) {
    return (
      <div className="fixed bottom-4 right-4 z-[80] flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl">
        <audio ref={remoteAudio} autoPlay />
        {isVideo && <video ref={remoteVideo} autoPlay playsInline className="h-20 w-28 rounded-lg bg-black object-cover" />}
        {!isVideo && <Avatar name={s.peer.displayName} url={s.peer.avatarUrl} size="sm" />}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{s.peer.displayName}</div>
          <div className="text-xs text-white/70">{statusText}</div>
        </div>
        <button className="rounded-full p-2 hover:bg-white/10" onClick={() => setMinimized(false)} aria-label="Expand call">
          <Maximize2 className="h-4 w-4" />
        </button>
        <button className="rounded-full bg-red-600 p-2 hover:bg-red-700" onClick={s.endCall} aria-label="End call">
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={container} className="fixed inset-0 z-[80] flex animate-fade flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-black text-white">
      <audio ref={remoteAudio} autoPlay />

      {/* Remote video / avatar */}
      {showRemoteVideo && (s.status === 'active' || s.status === 'connecting') ? (
        <video ref={remoteVideo} autoPlay playsInline muted={!isVideo} className={clsx('absolute inset-0 h-full w-full bg-black object-contain', !remoteHasVideo && 'opacity-0')} />
      ) : null}

      {/* Local preview */}
      {(isVideo || !!s.screenStream) && s.localStream && s.status !== 'incoming' && (
        <video
          ref={localVideo}
          autoPlay
          playsInline
          muted
          className={clsx(
            'absolute z-10 rounded-2xl bg-slate-800 shadow-2xl ring-2 ring-white/20',
            s.screenStream ? 'object-contain' : 'object-cover [transform:scaleX(-1)]',
            s.status === 'active' ? 'bottom-28 right-4 h-44 w-32 sm:h-48 sm:w-64' : 'inset-0 h-full w-full rounded-none opacity-60 ring-0',
            s.cameraOff && !s.screenStream && 'invisible',
          )}
        />
      )}

      <div className="relative z-20 flex items-center justify-between p-4">
        <div className="text-sm text-white/70">{isVideo ? 'Video call' : 'Voice call'} · M32 Baddies</div>
        {inCall && (
          <button className="rounded-full p-2 hover:bg-white/10" onClick={() => setMinimized(true)} aria-label="Minimize call">
            <Minimize2 className="h-5 w-5" />
          </button>
        )}
      </div>

      {(!remoteHasVideo || s.status !== 'active') && (
        <div className="relative z-20 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className={clsx('rounded-full', (s.status === 'incoming' || s.status === 'outgoing') && 'animate-pulse-ring')}>
            <Avatar name={s.peer.displayName} url={s.peer.avatarUrl} size="xl" />
          </div>
          <div>
            <div className="text-2xl font-semibold">{s.peer.displayName}</div>
            <div className="text-sm text-white/60">@{s.peer.username}</div>
          </div>
          <div className={clsx('flex items-center gap-2 text-base', s.reconnecting ? 'text-amber-300' : 'text-white/80')}>
            {s.reconnecting && <WifiOff className="h-4 w-4" />}
            {statusText}
          </div>
        </div>
      )}
      {remoteHasVideo && s.status === 'active' && (
        <div className="relative z-20 mx-auto rounded-full bg-black/40 px-4 py-1.5 text-sm backdrop-blur">
          {s.peer.displayName} · {statusText}
        </div>
      )}
      <div className="flex-1" />

      {showDevices && inCall && (
        <div className="relative z-30 mx-auto mb-3 w-[min(92vw,420px)] space-y-2 rounded-2xl bg-slate-800/95 p-4 text-sm shadow-2xl backdrop-blur">
          <DeviceSelect label="Microphone" devices={s.devices.audioIn} value={s.selected.audioIn} onChange={(id) => void s.selectDevice('audioIn', id)} />
          {isVideo && <DeviceSelect label="Camera" devices={s.devices.videoIn} value={s.selected.videoIn} onChange={(id) => void s.selectDevice('videoIn', id)} />}
          {s.devices.audioOut.length > 0 && 'setSinkId' in HTMLMediaElement.prototype && (
            <DeviceSelect label="Speaker" devices={s.devices.audioOut} value={s.selected.audioOut} onChange={(id) => void s.selectDevice('audioOut', id)} />
          )}
        </div>
      )}

      {/* Controls */}
      <div className="relative z-30 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        {s.status === 'incoming' ? (
          <div className="flex items-center justify-center gap-16">
            <div className="flex flex-col items-center gap-2">
              <button className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg transition hover:bg-red-700" onClick={s.rejectCall} aria-label="Decline">
                <PhoneOff className="h-7 w-7" />
              </button>
              <span className="text-xs text-white/70">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button className="flex h-16 w-16 animate-bounce items-center justify-center rounded-full bg-emerald-500 shadow-lg transition hover:bg-emerald-600" onClick={() => void s.acceptCall()} aria-label="Accept">
                {isVideo ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
              </button>
              <span className="text-xs text-white/70">Accept</span>
            </div>
          </div>
        ) : s.status === 'ended' ? (
          <div className="pb-6 text-center text-white/60">{s.endedLabel}</div>
        ) : (
          <div className="mx-auto flex w-fit items-center gap-3 rounded-full bg-white/10 px-4 py-3 backdrop-blur">
            <CtrlButton active={s.micMuted} onClick={s.toggleMic} label={s.micMuted ? 'Unmute' : 'Mute'}>
              {s.micMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </CtrlButton>
            {s.status === 'active' && typeof navigator.mediaDevices?.getDisplayMedia === 'function' && (
              <CtrlButton active={!!s.screenStream} onClick={() => void s.toggleScreenShare()} label={s.screenStream ? 'Stop sharing screen' : 'Share screen'}>
                {s.screenStream ? <ScreenShareOff className="h-6 w-6" /> : <ScreenShare className="h-6 w-6" />}
              </CtrlButton>
            )}
            {isVideo && (
              <>
                <CtrlButton active={s.cameraOff} onClick={s.toggleCamera} label={s.cameraOff ? 'Turn camera on' : 'Turn camera off'}>
                  {s.cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                </CtrlButton>
                <CtrlButton onClick={() => void s.switchCamera()} label="Switch camera">
                  <RefreshCcw className="h-6 w-6" />
                </CtrlButton>
                {'pictureInPictureEnabled' in document && (
                  <CtrlButton onClick={() => void remoteVideo.current?.requestPictureInPicture().catch(() => undefined)} label="Picture in picture">
                    <PictureInPicture2 className="h-6 w-6" />
                  </CtrlButton>
                )}
                <CtrlButton
                  onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void container.current?.requestFullscreen().catch(() => undefined))}
                  label="Full screen"
                >
                  <Maximize2 className="h-6 w-6" />
                </CtrlButton>
              </>
            )}
            <CtrlButton active={showDevices} onClick={() => setShowDevices((v) => !v)} label="Devices">
              <Settings2 className="h-6 w-6" />
            </CtrlButton>
            <button className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 transition hover:bg-red-700" onClick={s.endCall} aria-label="End call">
              <PhoneOff className="h-6 w-6" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CtrlButton({ children, onClick, label, active }: { children: ReactNode; onClick: () => void; label: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx('flex h-12 w-12 items-center justify-center rounded-full transition', active ? 'bg-white text-slate-900' : 'bg-white/15 hover:bg-white/25')}
    >
      {children}
    </button>
  );
}

function DeviceSelect({ label, devices, value, onChange }: { label: string; devices: MediaDeviceInfo[]; value?: string; onChange: (id: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-white/60">{label}</span>
      <select className="w-full rounded-lg bg-slate-700 px-3 py-2 text-white outline-none" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Default
        </option>
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
