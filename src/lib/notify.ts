import { api } from './api';

export function browserNotify(title: string, body: string, opts: { tag?: string; onClick?: () => void } = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const n = new Notification(title, { body, tag: opts.tag, icon: '/favicon.svg' });
    n.onclick = () => {
      window.focus();
      opts.onClick?.();
      n.close();
    };
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Asks for permission (must be called from a user gesture) and registers Web Push if the server supports it. */
export async function enableNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission === 'granted') await registerWebPush().catch(() => undefined);
  return permission;
}

export async function registerWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return;
  const { data } = await api.get('/me/push/vapid-public-key');
  if (!data.publicKey) return;
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.publicKey) });
  }
  const json = sub.toJSON();
  await api.post('/me/push/web', { subscription: { endpoint: json.endpoint, keys: json.keys } });
}
