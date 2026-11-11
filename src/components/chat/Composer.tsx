import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { FileText, Image as ImageIcon, Lock, Mic, Paperclip, Pencil, Reply, Send, Smile, Square, Trash2, X } from 'lucide-react';
import { useChat } from '../../store/chat';
import { useUi } from '../../store/ui';
import { api, errorMessage } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { duration as fmtDuration, fileSize } from '../../lib/format';
import { Modal, Spinner } from '../ui';
import type { Conversation } from '../../types';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

const MAX_MB = 25;
const ACCEPT_MEDIA = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm';
const ACCEPT_DOCS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.mp3,.m4a,.aac,.ogg,.wav';

function pickRecorderMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) ?? '';
}

export default function Composer({ conv, meId }: { conv: Conversation; meId: string }) {
  const replyTo = useChat((s) => s.replyTo);
  const editing = useChat((s) => s.editing);
  const { sendText, sendFile, setReplyTo, setEditing, replaceMessage } = useChat.getState();
  const toast = useUi((s) => s.toast);
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [attachMenu, setAttachMenu] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [caption, setCaption] = useState('');
  const [recording, setRecording] = useState<{ started: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelRecording = useRef(false);
  const typingState = useRef<{ on: boolean; timer?: ReturnType<typeof setTimeout> }>({ on: false });

  const isDark = document.documentElement.classList.contains('dark');
  const isAdmin = conv.admins.includes(meId);
  const locked = conv.type === 'group' && conv.permissions.onlyAdminsCanMessage && !isAdmin;

  // Draft per conversation.
  useEffect(() => {
    setText(sessionStorageGet(`draft:${conv.id}`));
    return () => stopTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);

  useEffect(() => {
    if (editing) {
      setText(editing.content);
      taRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (replyTo) taRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((Date.now() - recording.started) / 1000), 250);
    return () => clearInterval(t);
  }, [recording]);

  function stopTyping() {
    const st = typingState.current;
    if (st.timer) clearTimeout(st.timer);
    if (st.on) getSocket()?.emit('typing', { conversationId: conv.id, isTyping: false });
    st.on = false;
  }

  function onChange(v: string) {
    setText(v);
    sessionStorageSet(`draft:${conv.id}`, v);
    if (editing) return;
    const st = typingState.current;
    if (!st.on && v.trim()) {
      st.on = true;
      getSocket()?.emit('typing', { conversationId: conv.id, isTyping: true });
    }
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(stopTyping, 3000);
  }

  async function submit() {
    const value = text.trim();
    if (!value) return;
    if (editing) {
      try {
        const { data } = await api.patch(`/messages/${editing.id}`, { content: value });
        replaceMessage(data.message);
        setEditing(null);
        setText('');
        sessionStorageSet(`draft:${conv.id}`, '');
      } catch (err) {
        toast(errorMessage(err), 'error');
      }
      return;
    }
    stopTyping();
    setText('');
    sessionStorageSet(`draft:${conv.id}`, '');
    setEmoji(false);
    void sendText(conv.id, value);
  }

  function chooseFiles(list: FileList | null) {
    setAttachMenu(false);
    if (!list?.length) return;
    const files = [...list].slice(0, 10);
    const tooBig = files.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) return toast(`${tooBig.name} is larger than ${MAX_MB} MB`, 'error');
    setPending(files);
    setCaption('');
  }

  function sendPending() {
    pending.forEach((f, i) => void sendFile(conv.id, f, { caption: i === 0 ? caption.trim() || undefined : undefined }));
    setPending([]);
    setCaption('');
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelRecording.current = false;
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const secs = (Date.now() - started) / 1000;
        setRecording(null);
        setElapsed(0);
        if (cancelRecording.current || secs < 0.8) return;
        const type = rec.mimeType || mime || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File(chunks.current, `voice-${Date.now()}.${ext}`, { type: type.split(';')[0] });
        void sendFile(conv.id, file, { voice: true, duration: Math.round(secs) });
      };
      const started = Date.now();
      rec.start(250);
      recorder.current = rec;
      setRecording({ started });
    } catch {
      toast('Microphone access is needed to record voice messages', 'error');
    }
  }

  function stopRecording(cancel: boolean) {
    cancelRecording.current = cancel;
    recorder.current?.stop();
    recorder.current = null;
  }

  if (locked) {
    return (
      <div className="flex items-center justify-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        <Lock className="h-4 w-4" /> Only admins can send messages
      </div>
    );
  }

  const bar = editing ?? replyTo;

  return (
    <div className="relative border-t border-slate-200 bg-slate-50 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 dark:border-slate-800 dark:bg-slate-900 sm:px-4">
      {bar && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-white px-3 py-2 dark:bg-slate-800">
          {editing ? <Pencil className="h-4 w-4 shrink-0 text-brand-600" /> : <Reply className="h-4 w-4 shrink-0 text-brand-600" />}
          <div className="min-w-0 flex-1 border-l-4 border-brand-500 pl-2">
            <div className="text-xs font-semibold text-brand-700 dark:text-brand-300">
              {editing ? 'Edit message' : `Replying to ${bar.senderId === meId ? 'yourself' : bar.sender?.displayName ?? 'message'}`}
            </div>
            <div className="truncate text-sm text-slate-600 dark:text-slate-300">{bar.content || bar.attachment?.name || bar.messageType}</div>
          </div>
          <button
            className="icon-btn h-8 w-8"
            onClick={() => {
              if (editing) {
                setEditing(null);
                setText('');
              } else setReplyTo(null);
            }}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {emoji && (
        <div className="absolute bottom-full left-2 z-30 mb-2 sm:left-4">
          <Suspense fallback={<div className="card flex h-[400px] w-[340px] items-center justify-center"><Spinner /></div>}>
            <EmojiPicker
              onEmojiClick={(e) => {
                const ta = taRef.current;
                const pos = ta?.selectionStart ?? text.length;
                const next = text.slice(0, pos) + e.emoji + text.slice(pos);
                onChange(next);
                requestAnimationFrame(() => {
                  ta?.focus();
                  ta?.setSelectionRange(pos + e.emoji.length, pos + e.emoji.length);
                });
              }}
              theme={(isDark ? 'dark' : 'light') as never}
              lazyLoadEmojis
              width={340}
              height={400}
            />
          </Suspense>
        </div>
      )}

      {attachMenu && (
        <div className="absolute bottom-full left-12 z-30 mb-2 w-52 animate-pop overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <button className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700" onClick={() => mediaInput.current?.click()}>
            <ImageIcon className="h-5 w-5 text-violet-500" /> Photos & videos
          </button>
          <button className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700" onClick={() => docInput.current?.click()}>
            <FileText className="h-5 w-5 text-sky-500" /> Document / audio
          </button>
        </div>
      )}
      <input ref={mediaInput} type="file" accept={ACCEPT_MEDIA} multiple hidden onChange={(e) => { chooseFiles(e.target.files); e.target.value = ''; }} />
      <input ref={docInput} type="file" accept={ACCEPT_DOCS} multiple hidden onChange={(e) => { chooseFiles(e.target.files); e.target.value = ''; }} />

      {recording ? (
        <div className="flex items-center gap-3 rounded-full bg-white px-3 py-2 dark:bg-slate-800">
          <button className="icon-btn h-9 w-9 text-red-600" onClick={() => stopRecording(true)} aria-label="Cancel recording">
            <Trash2 className="h-5 w-5" />
          </button>
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="flex-1 font-mono text-sm tabular-nums">{fmtDuration(elapsed)}</span>
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700" onClick={() => stopRecording(false)} aria-label="Send voice message">
            <Send className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1">
          <button className={clsx('icon-btn', emoji && 'text-brand-600')} onClick={() => { setEmoji((v) => !v); setAttachMenu(false); }} aria-label="Emoji">
            <Smile className="h-6 w-6" />
          </button>
          <button className={clsx('icon-btn', attachMenu && 'text-brand-600')} onClick={() => { setAttachMenu((v) => !v); setEmoji(false); }} aria-label="Attach" disabled={!!editing}>
            <Paperclip className="h-6 w-6" />
          </button>
          <textarea
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              } else if (e.key === 'Escape') {
                setReplyTo(null);
                if (editing) {
                  setEditing(null);
                  setText('');
                }
              }
            }}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.length) {
                e.preventDefault();
                const dt = new DataTransfer();
                files.forEach((f) => dt.items.add(f));
                chooseFiles(dt.files);
              }
            }}
            placeholder="Type a message"
            maxLength={4000}
            className="scrollbar-thin max-h-40 min-h-[44px] flex-1 resize-none rounded-3xl border-0 bg-white px-4 py-2.5 text-[15px] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:ring-slate-700"
          />
          {text.trim() ? (
            <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700" onClick={() => void submit()} aria-label="Send">
              <Send className="h-5 w-5" />
            </button>
          ) : (
            <button
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-50"
              onClick={() => void startRecording()}
              disabled={!!editing}
              aria-label="Record voice message"
            >
              {editing ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
        </div>
      )}

      <Modal open={pending.length > 0} onClose={() => setPending([])} title={pending.length > 1 ? `Send ${pending.length} files` : 'Send file'}>
        <div className="space-y-3 p-4">
          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
            {pending.map((f, i) => (
              <FilePreview key={i} file={f} single={pending.length === 1} />
            ))}
          </div>
          <input className="input" placeholder="Add a caption…" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={4000} onKeyDown={(e) => e.key === 'Enter' && sendPending()} autoFocus />
          <button className="btn-primary w-full" onClick={sendPending}>
            <Send className="h-4 w-4" /> Send
          </button>
        </div>
      </Modal>
    </div>
  );
}

function FilePreview({ file, single }: { file: File; single: boolean }) {
  const [url] = useState(() => (file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : null));
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return (
    <div className={clsx('overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800', single && 'col-span-2')}>
      {url && file.type.startsWith('image/') ? (
        <img src={url} alt="" className="max-h-72 w-full object-contain" />
      ) : url ? (
        <video src={url} className="max-h-72 w-full" controls />
      ) : (
        <div className="flex items-center gap-3 p-4">
          <FileText className="h-8 w-8 text-brand-600" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{file.name}</div>
            <div className="text-xs text-slate-500">{fileSize(file.size)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function sessionStorageGet(key: string) {
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function sessionStorageSet(key: string, value: string) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
