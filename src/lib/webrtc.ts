import { getSocket } from './socket';

export type SignalPayload =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'candidate'; candidate: RTCIceCandidateInit };

interface Handlers {
  onRemoteStream: (stream: MediaStream) => void;
  onStateChange: (state: RTCPeerConnectionState) => void;
}

/**
 * One-to-one WebRTC session. Only the caller creates offers (initial + ICE restarts),
 * so no "perfect negotiation" glare handling is needed.
 * Media flows peer-to-peer (or via TURN); Socket.IO only carries signalling.
 */
export class PeerSession {
  pc: RTCPeerConnection;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteStream = new MediaStream();
  private restarting = false;

  constructor(
    private callId: string,
    iceServers: RTCIceServer[],
    private isCaller: boolean,
    private handlers: Handlers,
  ) {
    this.pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.signal({ type: 'candidate', candidate: e.candidate.toJSON() });
    };
    this.pc.ontrack = (e) => {
      for (const track of e.streams[0]?.getTracks() ?? [e.track]) {
        if (!this.remoteStream.getTracks().includes(track)) this.remoteStream.addTrack(track);
      }
      // New object so state stores notice the change.
      this.handlers.onRemoteStream(new MediaStream(this.remoteStream.getTracks()));
    };
    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      this.handlers.onStateChange(state);
      if (state === 'failed' && this.isCaller) void this.restartIce();
    };
  }

  private signal(payload: SignalPayload) {
    getSocket()?.emit('call:signal', { callId: this.callId, payload });
  }

  addLocalStream(stream: MediaStream) {
    for (const track of stream.getTracks()) this.pc.addTrack(track, stream);
  }

  async replaceTrack(kind: 'audio' | 'video', track: MediaStreamTrack | null) {
    const sender = this.pc.getSenders().find((s) => s.track?.kind === kind || (!s.track && kind === 'video'));
    if (sender) await sender.replaceTrack(track);
  }

  async createOffer(iceRestart = false) {
    const offer = await this.pc.createOffer({ iceRestart });
    await this.pc.setLocalDescription(offer);
    this.signal({ type: 'offer', sdp: offer.sdp! });
  }

  async restartIce() {
    if (!this.isCaller || this.restarting || this.pc.signalingState === 'closed') return;
    this.restarting = true;
    try {
      await this.createOffer(true);
    } finally {
      setTimeout(() => (this.restarting = false), 3000);
    }
  }

  async handleSignal(payload: SignalPayload) {
    if (this.pc.signalingState === 'closed') return;
    if (payload.type === 'offer') {
      await this.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      await this.flushCandidates();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.signal({ type: 'answer', sdp: answer.sdp! });
    } else if (payload.type === 'answer') {
      if (this.pc.signalingState !== 'have-local-offer') return;
      await this.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      await this.flushCandidates();
    } else if (payload.type === 'candidate') {
      if (!this.pc.remoteDescription) this.pendingCandidates.push(payload.candidate);
      else await this.pc.addIceCandidate(payload.candidate).catch(() => undefined);
    }
  }

  private async flushCandidates() {
    const list = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of list) await this.pc.addIceCandidate(c).catch(() => undefined);
  }

  close() {
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
  }
}

export async function getMedia(video: boolean, deviceIds: { audio?: string; video?: string } = {}) {
  return navigator.mediaDevices.getUserMedia({
    audio: { deviceId: deviceIds.audio ? { exact: deviceIds.audio } : undefined, echoCancellation: true, noiseSuppression: true },
    video: video
      ? { deviceId: deviceIds.video ? { exact: deviceIds.video } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      : false,
  });
}

export function mediaErrorMessage(err: unknown): string {
  const name = (err as DOMException)?.name;
  if (name === 'NotAllowedError') return 'Camera/microphone permission was denied. Allow access in your browser settings.';
  if (name === 'NotFoundError') return 'No camera or microphone was found.';
  if (name === 'NotReadableError') return 'Your camera or microphone is being used by another app.';
  return 'Could not access camera/microphone.';
}
