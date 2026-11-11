import { create } from 'zustand';
import { emitAck, getSocket } from '../lib/socket';
import { getMedia, mediaErrorMessage } from '../lib/webrtc';
import { startRinging, stopRinging } from '../lib/sounds';
import { browserNotify } from '../lib/notify';
import { useUi } from './ui';
import { useCall } from './call';
import { useAuth } from './auth';

export interface GroupPeer {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ActiveGroupCall {
  callId: string;
  conversationId: string;
  groupName: string;
  callType: 'audio' | 'video';
  startedBy: GroupPeer;
}

type Status = 'idle' | 'incoming' | 'connecting' | 'active';

interface GroupCallState {
  status: Status;
  call: ActiveGroupCall | null;
  /** Ongoing calls per conversation, used for the "Join" banner. */
  ongoing: Record<string, ActiveGroupCall>;
  localStream: MediaStream | null;
  peers: Record<string, { user: GroupPeer; stream: MediaStream | null; sharing?: boolean }>;
  micMuted: boolean;
  cameraOff: boolean;
  screenStream: MediaStream | null;
  startedAt: number | null;

  start: (conversationId: string, groupName: string, type: 'audio' | 'video') => Promise<void>;
  accept: () => Promise<void>;
  join: (call: ActiveGroupCall) => Promise<void>;
  dismiss: () => void;
  leave: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => Promise<void>;
}

type Signal = { type: 'offer'; sdp: string } | { type: 'answer'; sdp: string } | { type: 'candidate'; candidate: RTCIceCandidateInit } | { type: 'share'; on: boolean };

interface PeerConn {
  pc: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
}

const conns = new Map<string, PeerConn>();
let iceServers: RTCIceServer[] = [];

/** Helpers that need the store's set/get; assigned inside create() and used by the socket bindings. */
const impl = {
  handleSignal: async (_from: string, _payload: Signal): Promise<void> => undefined,
  closePeer: (_userId: string): void => undefined,
  cleanup: (): void => undefined,
};

const idle = {
  status: 'idle' as Status,
  call: null as ActiveGroupCall | null,
  localStream: null as MediaStream | null,
  peers: {} as GroupCallState['peers'],
  micMuted: false,
  cameraOff: false,
  screenStream: null as MediaStream | null,
  startedAt: null as number | null,
};

/** Swap the outgoing video track on every connection (camera <-> screen). */
async function replaceOutgoingVideo(track: MediaStreamTrack | null) {
  for (const c of conns.values()) {
    const sender = c.pc.getTransceivers().find((x) => x.receiver.track.kind === 'video' && x.currentDirection !== 'stopped')?.sender;
    if (sender) await sender.replaceTrack(track).catch(() => undefined);
  }
}

const inOneToOneCall = () => {
  const c = useCall.getState().status;
  return c !== 'idle' && c !== 'ended';
};

export const useGroupCall = create<GroupCallState>((set, get) => {
  function signal(to: string, payload: Signal) {
    const call = get().call;
    if (call) getSocket()?.emit('gcall:signal', { callId: call.callId, to, payload });
  }

  function dropConn(userId: string) {
    const c = conns.get(userId);
    if (!c) return;
    c.pc.onicecandidate = null;
    c.pc.ontrack = null;
    c.pc.onconnectionstatechange = null;
    c.pc.close();
    conns.delete(userId);
  }

  function closePeer(userId: string) {
    dropConn(userId);
    set((s) => {
      const rest = { ...s.peers };
      delete rest[userId];
      return { peers: rest };
    });
  }

  function cleanup() {
    stopRinging();
    [...conns.keys()].forEach(dropConn);
    get().localStream?.getTracks().forEach((t) => t.stop());
    get().screenStream?.getTracks().forEach((t) => t.stop());
    set({ ...idle, peers: {} });
  }

  /** Creates the RTCPeerConnection for one remote participant. */
  function makePeer(user: GroupPeer, offerer: boolean): PeerConn {
    dropConn(user.id);
    const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
    const conn: PeerConn = { pc, pendingCandidates: [] };
    conns.set(user.id, conn);
    set((s) => ({ peers: { ...s.peers, [user.id]: { user, stream: s.peers[user.id]?.stream ?? null, sharing: s.peers[user.id]?.sharing } } }));

    pc.onicecandidate = (e) => e.candidate && signal(user.id, { type: 'candidate', candidate: e.candidate.toJSON() });
    const remote = new MediaStream();
    pc.ontrack = (e) => {
      for (const t of e.streams[0]?.getTracks() ?? [e.track]) if (!remote.getTracks().includes(t)) remote.addTrack(t);
      set((s) => ({ peers: { ...s.peers, [user.id]: { user, stream: new MediaStream(remote.getTracks()), sharing: s.peers[user.id]?.sharing } } }));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') set((s) => ({ status: 'active', startedAt: s.startedAt ?? Date.now() }));
    };

    const local = get().localStream;
    local?.getTracks().forEach((t) => pc.addTrack(t, local));
    if (offerer) {
      // Ask to receive what we can't send (e.g. camera unavailable on this device).
      // A video sender is always kept (even in voice calls) so a screen can be shared later without renegotiating.
      if (!pc.getSenders().some((s) => s.track?.kind === 'audio')) pc.addTransceiver('audio', { direction: 'recvonly' });
      if (!pc.getSenders().some((s) => s.track?.kind === 'video')) pc.addTransceiver('video', { direction: 'sendrecv' });
    }
    return conn;
  }

  async function offerTo(user: GroupPeer) {
    const { pc } = makePeer(user, true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signal(user.id, { type: 'offer', sdp: offer.sdp! });
  }

  async function handleSignal(from: string, payload: Signal) {
    let conn = conns.get(from);
    if (payload.type === 'offer') {
      const user = get().peers[from]?.user;
      if (!user) return;
      conn = makePeer(user, false);
      await conn.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      for (const t of conn.pc.getTransceivers()) if (t.receiver.track.kind === 'video' && t.direction === 'recvonly') t.direction = 'sendrecv';
      for (const c of conn.pendingCandidates.splice(0)) await conn.pc.addIceCandidate(c).catch(() => undefined);
      const answer = await conn.pc.createAnswer();
      await conn.pc.setLocalDescription(answer);
      signal(from, { type: 'answer', sdp: answer.sdp! });
    } else if (payload.type === 'share') {
      set((s) => (s.peers[from] ? { peers: { ...s.peers, [from]: { ...s.peers[from], sharing: payload.on } } } : s));
    } else if (!conn) {
      return;
    } else if (payload.type === 'answer') {
      if (conn.pc.signalingState !== 'have-local-offer') return;
      await conn.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      for (const c of conn.pendingCandidates.splice(0)) await conn.pc.addIceCandidate(c).catch(() => undefined);
    } else if (payload.type === 'candidate') {
      if (!conn.pc.remoteDescription) conn.pendingCandidates.push(payload.candidate);
      else await conn.pc.addIceCandidate(payload.candidate).catch(() => undefined);
    }
  }

  impl.handleSignal = handleSignal;
  impl.closePeer = closePeer;
  impl.cleanup = cleanup;

  async function openMedia(type: 'audio' | 'video') {
    try {
      return await getMedia(type === 'video', {});
    } catch (err) {
      // Never block joining because a device is busy: fall back to audio only, then receive-only.
      useUi.getState().toast(mediaErrorMessage(err), 'error');
      return getMedia(false, {}).catch(() => new MediaStream());
    }
  }

  async function joinInternal(call: ActiveGroupCall, starting: boolean) {
    stopRinging();
    const stream = await openMedia(call.callType);
    set({
      status: 'connecting',
      call,
      localStream: stream,
      peers: {},
      micMuted: false,
      cameraOff: call.callType === 'video' && stream.getVideoTracks().length === 0,
    });
    type Res = { ok: boolean; error?: string; iceServers?: RTCIceServer[]; peers?: GroupPeer[]; callId?: string };
    const res = await emitAck<Res>(
      starting ? 'gcall:start' : 'gcall:join',
      starting ? { conversationId: call.conversationId, callType: call.callType } : { callId: call.callId },
    ).catch((): Res => ({ ok: false, error: 'Network error' }));
    if (!res.ok) {
      cleanup();
      useUi.getState().toast(res.error ?? 'Could not join the call', 'error');
      return;
    }
    iceServers = res.iceServers ?? [];
    set({ call: { ...call, callId: res.callId ?? call.callId }, status: starting ? 'active' : 'connecting', startedAt: starting ? Date.now() : null });
    // We are the newcomer: offer to everyone already in the call.
    for (const peer of res.peers ?? []) {
      set((s) => ({ peers: { ...s.peers, [peer.id]: { user: peer, stream: null } } }));
      void offerTo(peer).catch(() => useUi.getState().toast(`Could not connect to ${peer.displayName}`, 'error'));
    }
  }

  return {
    ...idle,
    ongoing: {},

    start: async (conversationId, groupName, type) => {
      if (get().status !== 'idle' || inOneToOneCall()) return useUi.getState().toast('You are already in a call', 'error');
      if (!getSocket()?.connected) return useUi.getState().toast('You are offline', 'error');
      const me = useAuth.getState().user;
      const self: GroupPeer = { id: me?.id ?? '', username: me?.username ?? '', displayName: me?.displayName ?? 'You', avatarUrl: me?.avatarUrl ?? null };
      await joinInternal({ callId: '', conversationId, groupName, callType: type, startedBy: self }, true);
    },

    accept: async () => {
      const call = get().call;
      if (!call || get().status !== 'incoming') return;
      await joinInternal(call, false);
    },

    join: async (call) => {
      if (get().status !== 'idle' || inOneToOneCall()) return useUi.getState().toast('You are already in a call', 'error');
      await joinInternal(call, false);
    },

    dismiss: () => {
      stopRinging();
      if (get().status === 'incoming') set({ ...idle, peers: {} });
    },

    leave: () => {
      const call = get().call;
      if (call?.callId) getSocket()?.emit('gcall:leave', { callId: call.callId });
      cleanup();
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
      if (!st.call) return;
      const broadcast = (on: boolean) => [...conns.keys()].forEach((id) => signal(id, { type: 'share', on }));
      const stop = async () => {
        get().screenStream?.getTracks().forEach((t) => t.stop());
        set({ screenStream: null });
        await replaceOutgoingVideo(get().localStream?.getVideoTracks()[0] ?? null);
        broadcast(false);
      };
      if (st.screenStream) return stop();
      try {
        const ms = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const track = ms.getVideoTracks()[0];
        if (!track) return;
        track.onended = () => void stop();
        set({ screenStream: ms });
        await replaceOutgoingVideo(track);
        broadcast(true);
      } catch {
        // User cancelled the picker: nothing to do.
      }
    },
  };
});

/** Wires group-call socket events. Called once per socket. */
export function bindGroupCallEvents() {
  const socket = getSocket();
  if (!socket) return;
  const store = useGroupCall;

  socket.on('gcall:incoming', (d: ActiveGroupCall) => {
    store.setState((s) => ({ ongoing: { ...s.ongoing, [d.conversationId]: d } }));
    const s = store.getState();
    if (s.status !== 'idle' || inOneToOneCall()) return;
    store.setState({ status: 'incoming', call: d });
    if (useUi.getState().settings?.notifications.sound !== false) startRinging('incoming');
    browserNotify(`${d.groupName}: group ${d.callType} call`, `${d.startedBy.displayName} started a group call`, { tag: d.callId });
  });

  socket.on('gcall:ended', ({ callId, conversationId }: { callId: string; conversationId: string }) => {
    store.setState((s) => {
      const rest = { ...s.ongoing };
      delete rest[conversationId];
      return { ongoing: rest };
    });
    const s = store.getState();
    if (s.call?.callId !== callId) return;
    if (s.status === 'incoming') {
      stopRinging();
      store.setState({ ...idle, peers: {} });
    } else impl.cleanup();
  });

  socket.on('gcall:peer-joined', ({ callId, user }: { callId: string; user: GroupPeer }) => {
    if (store.getState().call?.callId !== callId) return;
    // The newcomer sends us an offer; just remember who they are.
    store.setState((s) => ({ peers: { ...s.peers, [user.id]: { user, stream: s.peers[user.id]?.stream ?? null } } }));
  });

  socket.on('gcall:peer-left', ({ callId, userId }: { callId: string; userId: string }) => {
    if (store.getState().call?.callId !== callId) return;
    impl.closePeer(userId);
  });

  socket.on('gcall:signal', ({ callId, from, payload }: { callId: string; from: string; payload: Signal }) => {
    if (store.getState().call?.callId !== callId) return;
    void impl.handleSignal(from, payload).catch(() => undefined);
  });
}
