import { create } from 'zustand';
import { emitAck, getSocket } from '../lib/socket';
import { getMedia, mediaErrorMessage, PeerSession, SignalPayload } from '../lib/webrtc';
import { startRinging, stopRinging } from '../lib/sounds';
import { browserNotify } from '../lib/notify';
import { useUi } from './ui';

export interface CallPeer {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

type Status = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

interface CallState {
  status: Status;
  callId: string | null;
  callType: 'audio' | 'video';
  direction: 'outgoing' | 'incoming';
  peer: CallPeer | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micMuted: boolean;
  cameraOff: boolean;
  screenStream: MediaStream | null;
  remoteSharing: boolean;
  startedAt: number | null;
  reconnecting: boolean;
  endedLabel: string | null;
  devices: { audioIn: MediaDeviceInfo[]; videoIn: MediaDeviceInfo[]; audioOut: MediaDeviceInfo[] };
  selected: { audioIn?: string; videoIn?: string; audioOut?: string };

  startCall: (peer: CallPeer, type: 'audio' | 'video') => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  selectDevice: (kind: 'audioIn' | 'videoIn' | 'audioOut', deviceId: string) => Promise<void>;
  switchCamera: () => Promise<void>;
}

let session: PeerSession | null = null;
let iceServers: RTCIceServer[] = [];
let pendingSignals: SignalPayload[] = [];
let endedTimer: ReturnType<typeof setTimeout> | null = null;

const initial = {
  status: 'idle' as Status,
  callId: null,
  callType: 'audio' as const,
  direction: 'outgoing' as const,
  peer: null,
  localStream: null,
  remoteStream: null,
  micMuted: false,
  cameraOff: false,
  screenStream: null as MediaStream | null,
  remoteSharing: false,
  startedAt: null,
  reconnecting: false,
  endedLabel: null,
};

export const useCall = create<CallState>((set, get) => {
  function cleanup(label: string | null) {
    stopRinging();
    session?.close();
    session = null;
    pendingSignals = [];
    get().localStream?.getTracks().forEach((t) => t.stop());
    get().screenStream?.getTracks().forEach((t) => t.stop());
    if (label) {
      set({ ...initial, status: 'ended', endedLabel: label, peer: get().peer, callType: get().callType });
      if (endedTimer) clearTimeout(endedTimer);
      endedTimer = setTimeout(() => {
        if (get().status === 'ended') set({ ...initial });
      }, 1800);
    } else {
      set({ ...initial });
    }
  }

  function createSession(isCaller: boolean) {
    const callId = get().callId!;
    session = new PeerSession(callId, iceServers, isCaller, {
      onRemoteStream: (stream) => set({ remoteStream: stream }),
      onRemoteShare: (on) => set({ remoteSharing: on }),
      onStateChange: (state) => {
        if (state === 'connected') {
          set((s) => ({ status: 'active', reconnecting: false, startedAt: s.startedAt ?? Date.now() }));
        } else if (state === 'disconnected' || state === 'failed') {
          set({ reconnecting: true });
        }
      },
    });
    const local = get().localStream;
    if (local) session.addLocalStream(local);
    const queued = pendingSignals;
    pendingSignals = [];
    queued.forEach((p) => void session!.handleSignal(p));
  }

  return {
    ...initial,
    devices: { audioIn: [], videoIn: [], audioOut: [] },
    selected: {},

    startCall: async (peer, type) => {
      if (get().status !== 'idle' && get().status !== 'ended') return useUi.getState().toast('You are already in a call', 'error');
      if (!getSocket()?.connected) return useUi.getState().toast('You are offline', 'error');
      let stream: MediaStream;
      const sel = { audio: get().selected.audioIn, video: get().selected.videoIn };
      try {
        stream = await getMedia(type === 'video', sel);
      } catch (err) {
        if (type !== 'video') return useUi.getState().toast(mediaErrorMessage(err), 'error');
        // Camera unavailable (e.g. used by another window): keep the video call, send audio only.
        useUi.getState().toast(mediaErrorMessage(err), 'error');
        try {
          stream = await getMedia(false, sel);
        } catch {
          stream = new MediaStream();
        }
      }
      set({ ...initial, status: 'outgoing', direction: 'outgoing', callType: type, peer, localStream: stream, cameraOff: type === 'video' && stream.getVideoTracks().length === 0 });
      startRinging('outgoing');
      try {
        const res = await emitAck<{ ok: boolean; callId?: string; iceServers?: RTCIceServer[]; error?: string; code?: string }>('call:initiate', {
          calleeId: peer.id,
          callType: type,
        });
        if (!res.ok || !res.callId) {
          cleanup(res.code === 'busy' ? 'Busy' : null);
          if (res.code !== 'busy') useUi.getState().toast(res.error ?? 'Call failed', 'error');
          return;
        }
        iceServers = res.iceServers ?? [];
        set({ callId: res.callId });
      } catch (err) {
        cleanup(null);
        useUi.getState().toast((err as Error).message, 'error');
      }
    },

    acceptCall: async () => {
      const { callId, callType, status } = get();
      if (!callId || status !== 'incoming') return;
      stopRinging();
      // Never decline the call just because the camera/mic can't be opened (e.g. the camera is
      // already used by another window): fall back to audio only, then to receive-only.
      const sel = { audio: get().selected.audioIn, video: get().selected.videoIn };
      let stream: MediaStream;
      try {
        stream = await getMedia(callType === 'video', sel);
      } catch (err) {
        useUi.getState().toast(mediaErrorMessage(err), 'error');
        stream = await getMedia(false, sel).catch(() => new MediaStream());
      }
      set({ localStream: stream, status: 'connecting', cameraOff: stream.getVideoTracks().length === 0 });
      const res = await emitAck<{ ok: boolean; iceServers?: RTCIceServer[]; error?: string }>('call:accept', { callId }).catch(() => ({ ok: false, error: 'Network error' }) as const);
      if (!res.ok) {
        cleanup(null);
        useUi.getState().toast(res.error ?? 'Call is no longer available', 'error');
        return;
      }
      iceServers = res.iceServers ?? [];
      createSession(false);
    },

    rejectCall: () => {
      const { callId } = get();
      if (callId) getSocket()?.emit('call:reject', { callId });
      cleanup(null);
    },

    endCall: () => {
      const { callId, status, direction } = get();
      if (callId) getSocket()?.emit(status === 'outgoing' && direction === 'outgoing' ? 'call:cancel' : 'call:end', { callId });
      cleanup(status === 'active' ? 'Call ended' : null);
    },

    toggleMic: () => {
      const muted = !get().micMuted;
      get().localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
      set({ micMuted: muted });
    },

    toggleCamera: () => {
      const off = !get().cameraOff;
      get().localStream?.getVideoTracks().forEach((t) => (t.enabled = !off));
      set({ cameraOff: off });
    },

    toggleScreenShare: async () => {
      const st = get();
      if (st.status !== 'active') return;
      const stop = async () => {
        get().screenStream?.getTracks().forEach((t) => t.stop());
        set({ screenStream: null });
        await session?.replaceTrack('video', get().localStream?.getVideoTracks()[0] ?? null);
        session?.sendShare(false);
      };
      if (st.screenStream) return stop();
      if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') return useUi.getState().toast('Screen sharing is not supported on this device', 'error');
      try {
        const ms = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const track = ms.getVideoTracks()[0];
        if (!track) return;
        track.onended = () => void stop();
        set({ screenStream: ms });
        await session?.replaceTrack('video', track);
        session?.sendShare(true);
      } catch {
        // picker cancelled
      }
    },

    refreshDevices: async () => {
      const list = await navigator.mediaDevices.enumerateDevices();
      set({
        devices: {
          audioIn: list.filter((d) => d.kind === 'audioinput'),
          videoIn: list.filter((d) => d.kind === 'videoinput'),
          audioOut: list.filter((d) => d.kind === 'audiooutput'),
        },
      });
    },

    selectDevice: async (kind, deviceId) => {
      set((s) => ({ selected: { ...s.selected, [kind]: deviceId } }));
      if (kind === 'audioOut') return; // applied by the <audio>/<video> element via setSinkId
      const stream = get().localStream;
      if (!stream) return;
      const isVideo = kind === 'videoIn';
      try {
        const fresh = await navigator.mediaDevices.getUserMedia(isVideo ? { video: { deviceId: { exact: deviceId } } } : { audio: { deviceId: { exact: deviceId } } });
        const track = isVideo ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
        const old = isVideo ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
        if (old) {
          stream.removeTrack(old);
          old.stop();
        }
        track.enabled = isVideo ? !get().cameraOff : !get().micMuted;
        stream.addTrack(track);
        await session?.replaceTrack(isVideo ? 'video' : 'audio', track);
        set({ localStream: new MediaStream(stream.getTracks()) });
      } catch (err) {
        useUi.getState().toast(mediaErrorMessage(err), 'error');
      }
    },

    switchCamera: async () => {
      await get().refreshDevices();
      const cams = get().devices.videoIn;
      if (cams.length < 2) return useUi.getState().toast('No other camera found', 'info');
      const currentId = get().localStream?.getVideoTracks()[0]?.getSettings().deviceId;
      const idx = cams.findIndex((c) => c.deviceId === currentId);
      await get().selectDevice('videoIn', cams[(idx + 1) % cams.length].deviceId);
    },
  };
});

/** Wires call-related socket events. Called once per socket. */
export function bindCallEvents() {
  const socket = getSocket();
  if (!socket) return;
  const call = useCall;

  socket.on('call:incoming', (d: { callId: string; callType: 'audio' | 'video'; caller: CallPeer }) => {
    const s = call.getState();
    if (s.status !== 'idle' && s.status !== 'ended') {
      // Already handling a call on this device.
      return;
    }
    call.setState({ ...initial, status: 'incoming', direction: 'incoming', callId: d.callId, callType: d.callType, peer: d.caller });
    if (useUi.getState().settings?.notifications.sound !== false) startRinging('incoming');
    browserNotify(`Incoming ${d.callType} call`, `${d.caller.displayName} is calling you`, { tag: d.callId });
  });

  socket.on('call:accepted', async ({ callId }: { callId: string }) => {
    const s = call.getState();
    if (s.callId !== callId) return;
    stopRinging();
    call.setState({ status: 'connecting' });
    // createSession is internal; recreate via a tiny helper
    startCallerSession();
  });

  socket.on('call:answered-elsewhere', ({ callId }: { callId: string }) => {
    if (call.getState().callId === callId) {
      stopRinging();
      call.setState({ ...initial });
    }
  });

  socket.on('call:signal', ({ callId, payload }: { callId: string; payload: SignalPayload }) => {
    if (call.getState().callId !== callId) return;
    if (session) void session.handleSignal(payload);
    else pendingSignals.push(payload);
  });

  socket.on('call:ended', ({ callId, status, duration }: { callId: string; status: string; duration: number }) => {
    const s = call.getState();
    if (s.callId !== callId) return;
    const label =
      status === 'rejected' ? 'Call declined' : status === 'missed' ? (s.direction === 'outgoing' ? 'No answer' : 'Missed call') : duration ? 'Call ended' : 'Call ended';
    stopRinging();
    session?.close();
    session = null;
    s.localStream?.getTracks().forEach((t) => t.stop());
    s.screenStream?.getTracks().forEach((t) => t.stop());
    call.setState({ ...initial, status: 'ended', endedLabel: label, peer: s.peer, callType: s.callType });
    setTimeout(() => {
      if (call.getState().status === 'ended') call.setState({ ...initial });
    }, 1800);
  });

  socket.on('call:peer-disconnected', () => call.setState({ reconnecting: true }));
  socket.on('call:peer-reconnected', () => {
    call.setState({ reconnecting: false });
    if (call.getState().direction === 'outgoing') void session?.restartIce();
  });

  // Our own socket reconnected mid-call → re-attach and (as caller) restart ICE.
  socket.io.on('reconnect', async () => {
    const s = call.getState();
    if (!s.callId || (s.status !== 'active' && s.status !== 'connecting' && s.status !== 'outgoing')) return;
    type Rejoin = { ok: boolean; role?: string; status?: string };
    const res = await emitAck<Rejoin>('call:rejoin', { callId: s.callId }).catch((): Rejoin => ({ ok: false }));
    if (!res.ok) {
      session?.close();
      session = null;
      s.localStream?.getTracks().forEach((t) => t.stop());
      s.screenStream?.getTracks().forEach((t) => t.stop());
      call.setState({ ...initial, status: 'ended', endedLabel: 'Call dropped', peer: s.peer });
      setTimeout(() => call.getState().status === 'ended' && call.setState({ ...initial }), 1800);
      return;
    }
    if (res.role === 'caller' && res.status === 'ongoing') void session?.restartIce();
  });
}

function startCallerSession() {
  const s = useCall.getState();
  if (!s.callId) return;
  session = new PeerSession(s.callId, iceServers, true, {
    onRemoteStream: (stream) => useCall.setState({ remoteStream: stream }),
    onRemoteShare: (on) => useCall.setState({ remoteSharing: on }),
    onStateChange: (state) => {
      if (state === 'connected') useCall.setState((st) => ({ status: 'active', reconnecting: false, startedAt: st.startedAt ?? Date.now() }));
      else if (state === 'disconnected' || state === 'failed') useCall.setState({ reconnecting: true });
    },
  });
  if (s.localStream) session.addLocalStream(s.localStream);
  void session.createOffer().catch(() => useUi.getState().toast('Could not start the call connection', 'error'));
}
