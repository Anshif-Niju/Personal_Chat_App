import { io, Socket } from 'socket.io-client';
import { authEvents, getAccessToken, refreshAccessToken } from './api';

const SOCKET_URL: string = import.meta.env.VITE_SOCKET_URL || window.location.origin;

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket) return socket;
  const s = io(SOCKET_URL, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  // The server rejects expired tokens in its middleware; Socket.IO will not retry by itself then.
  s.on('connect_error', async (err) => {
    if (err.message !== 'unauthorized') return;
    const token = await refreshAccessToken();
    if (token) s.connect();
    else authEvents.onLost();
  });
  socket = s;
  return s;
}

export const getSocket = () => socket;

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

export function emitAck<T = Record<string, unknown>>(event: string, payload: unknown, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Not connected'));
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: T) => {
      if (err) reject(new Error('The server did not respond in time'));
      else resolve(res);
    });
  });
}
