import { memo, useState } from 'react';
import clsx from 'clsx';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileText,
  Forward,
  Pencil,
  Phone,
  PhoneMissed,
  Pin,
  PinOff,
  Reply,
  RotateCw,
  Smile,
  Trash2,
  Video,
} from 'lucide-react';
import type { Conversation, Message } from '../../types';
import { callLabel, fileSize, messageTime, systemText, duration as fmtDuration } from '../../lib/format';
import { messageStatus } from '../../store/chat';
import { Avatar } from '../ui';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export interface BubbleActions {
  onReply: (m: Message) => void;
  onReact: (m: Message, emoji: string) => void;
  onForward: (m: Message) => void;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
  onPin: (m: Message, pinned: boolean) => void;
  onRetry: (m: Message) => void;
  onJumpTo: (id: string) => void;
  onOpenMedia: (m: Message) => void;
  onCopy: (m: Message) => void;
}

interface Props extends BubbleActions {
  m: Message;
  conv: Conversation;
  meId: string;
  showSender: boolean;
  isPinned: boolean;
  highlighted: boolean;
}

function StatusIcon({ status }: { status: ReturnType<typeof messageStatus> }) {
  switch (status) {
    case 'sending':
      return <Clock className="h-3.5 w-3.5" />;
    case 'failed':
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'sent':
      return <Check className="h-3.5 w-3.5" />;
    case 'delivered':
      return <CheckCheck className="h-3.5 w-3.5" />;
    case 'read':
      return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  }
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-sky-600 underline dark:text-sky-400">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function AttachmentView({ m, onOpen }: { m: Message; onOpen: () => void }) {
  const a = m.attachment!;
  const uploading = m.localStatus === 'sending' && m.uploadProgress !== undefined && m.uploadProgress < 100;
  const overlay = uploading ? (
    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 text-sm font-semibold text-white">{m.uploadProgress}%</div>
  ) : null;

  if (m.messageType === 'image' && a.url) {
    return (
      <button className="relative block overflow-hidden rounded-xl" onClick={onOpen}>
        <img src={a.url} alt={a.name} className="max-h-80 w-full max-w-xs object-cover" loading="lazy" />
        {overlay}
      </button>
    );
  }
  if (m.messageType === 'video' && a.url) {
    return (
      <div className="relative overflow-hidden rounded-xl">
        <video src={a.url} controls preload="metadata" className="max-h-80 w-full max-w-xs bg-black" />
        {overlay}
      </div>
    );
  }
  if ((m.messageType === 'voice' || m.messageType === 'audio') && a.url) {
    return (
      <div className="flex min-w-60 flex-col gap-1">
        <audio src={a.url} controls preload="metadata" className="h-10 w-64 max-w-full" />
        <div className="text-[11px] opacity-70">
          {m.messageType === 'voice' ? '🎤 Voice message' : a.name}
          {a.duration ? ` · ${fmtDuration(a.duration)}` : ''}
          {uploading ? ` · uploading ${m.uploadProgress}%` : ''}
        </div>
      </div>
    );
  }
  return (
    <a
      href={a.url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      download={a.name}
      className="flex min-w-56 items-center gap-3 rounded-xl bg-black/5 p-3 dark:bg-white/5"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
        <FileText className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{a.name}</span>
        <span className="block text-xs opacity-70">
          {fileSize(a.size)}
          {uploading ? ` · ${m.uploadProgress}%` : ''}
        </span>
      </span>
      <Download className="h-4 w-4 opacity-60" />
    </a>
  );
}

function MessageBubbleImpl(props: Props) {
  const { m, conv, meId, showSender, isPinned, highlighted } = props;
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const mine = m.senderId === meId;

  if (m.messageType === 'system') {
    return (
      <div className="my-2 flex justify-center px-4">
        <span className="rounded-lg bg-white/90 px-3 py-1 text-center text-xs text-slate-600 shadow-sm dark:bg-slate-800/90 dark:text-slate-300">
          {systemText(m, conv, meId)}
        </span>
      </div>
    );
  }

  if (m.messageType === 'call') {
    const missed = !mine && (m.call?.status === 'missed' || m.call?.status === 'busy');
    const Icon = missed ? PhoneMissed : m.call?.callType === 'video' ? Video : Phone;
    return (
      <div className={clsx('my-1 flex px-3 sm:px-6', mine ? 'justify-end' : 'justify-start')}>
        <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-sm dark:bg-slate-800">
          <span className={clsx('flex h-9 w-9 items-center justify-center rounded-full', missed ? 'bg-red-100 text-red-600 dark:bg-red-950' : 'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300')}>
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-medium">{callLabel(m, meId)}</div>
            <div className="text-[11px] text-slate-500">{messageTime(m.createdAt)}</div>
          </div>
        </div>
      </div>
    );
  }

  const reactionGroups = Object.entries(
    m.reactions.reduce<Record<string, number>>((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
      return acc;
    }, {}),
  );
  const myReaction = m.reactions.find((r) => r.userId === meId)?.emoji;
  const status = mine ? messageStatus(m, conv, meId) : null;
  const canEdit = mine && !m.isDeleted && !m.localStatus && !m.forwarded && ['text', 'image', 'video', 'file'].includes(m.messageType);
  const persisted = !m.localStatus && !m.isDeleted;

  return (
    <div
      id={`msg-${m.id}`}
      className={clsx('group relative flex gap-2 px-3 py-0.5 transition-colors sm:px-6', mine ? 'justify-end' : 'justify-start', highlighted && 'bg-brand-200/40 dark:bg-brand-800/30')}
      onMouseLeave={() => {
        setMenu(false);
        setPicker(false);
      }}
    >
      {conv.type === 'group' && !mine && (
        <div className="w-8 shrink-0">{showSender && <Avatar name={m.sender?.displayName ?? 'Deleted'} url={m.sender?.avatarUrl} size="sm" className="mt-1 scale-90" />}</div>
      )}

      <div className={clsx('relative flex max-w-[85%] flex-col sm:max-w-[70%]', mine ? 'items-end' : 'items-start')}>
        <div
          className={clsx(
            'relative rounded-2xl px-3 py-2 shadow-sm',
            mine ? 'rounded-br-md bg-brand-100 text-slate-900 dark:bg-brand-800 dark:text-white' : 'rounded-bl-md bg-white dark:bg-slate-800',
            m.isDeleted && 'italic opacity-80',
          )}
          onDoubleClick={() => persisted && props.onReply(m)}
        >
          {conv.type === 'group' && !mine && showSender && (
            <div className="mb-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">{m.sender?.displayName ?? 'Deleted account'}</div>
          )}
          {m.forwarded && !m.isDeleted && (
            <div className="mb-1 flex items-center gap-1 text-[11px] italic text-slate-500 dark:text-slate-400">
              <Forward className="h-3 w-3" /> Forwarded
            </div>
          )}
          {m.replyTo && !m.isDeleted && (
            <button
              onClick={() => props.onJumpTo(m.replyTo!.id)}
              className="mb-1.5 block w-full rounded-lg border-l-4 border-brand-500 bg-black/5 px-2 py-1 text-left text-xs dark:bg-white/10"
            >
              <div className="font-semibold text-brand-700 dark:text-brand-300">{m.replyTo.senderId === meId ? 'You' : m.replyTo.senderName}</div>
              <div className="line-clamp-2 text-slate-600 dark:text-slate-300">
                {m.replyTo.isDeleted ? 'This message was deleted' : m.replyTo.content || m.replyTo.attachmentName || m.replyTo.messageType}
              </div>
            </button>
          )}

          {m.isDeleted ? (
            <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <Ban className="h-4 w-4" /> This message was deleted
            </div>
          ) : (
            <>
              {m.attachment && <AttachmentView m={m} onOpen={() => props.onOpenMedia(m)} />}
              {m.content && (
                <div className={clsx('whitespace-pre-wrap break-words text-[15px] leading-snug', m.attachment && 'mt-1.5')}>
                  <Linkified text={m.content} />
                </div>
              )}
            </>
          )}

          <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            {isPinned && <Pin className="h-3 w-3" />}
            {m.editedAt && !m.isDeleted && <span>edited</span>}
            <span>{messageTime(m.createdAt)}</span>
            {status && <StatusIcon status={status} />}
          </div>

          {persisted && (
            <button
              className={clsx(
                'absolute right-1 top-1 hidden rounded-full bg-inherit p-0.5 text-slate-500 group-hover:block',
                menu && 'block',
              )}
              onClick={() => setMenu((v) => !v)}
              aria-label="Message options"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
        </div>

        {reactionGroups.length > 0 && (
          <div className={clsx('-mt-1.5 flex gap-1', mine ? 'mr-2' : 'ml-2')}>
            {reactionGroups.map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => props.onReact(m, emoji)}
                className={clsx(
                  'flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-xs shadow-sm ring-1 dark:bg-slate-800',
                  myReaction === emoji ? 'ring-brand-400' : 'ring-slate-200 dark:ring-slate-700',
                )}
              >
                {emoji}
                {count > 1 && <span className="text-slate-500">{count}</span>}
              </button>
            ))}
          </div>
        )}

        {m.localStatus === 'failed' && (
          <button onClick={() => props.onRetry(m)} className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
            <RotateCw className="h-3 w-3" /> Not sent — tap to retry
          </button>
        )}

        {persisted && (
          <div className={clsx('absolute top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex', mine ? '-left-20' : '-right-20')}>
            <button className="icon-btn h-8 w-8 bg-white/80 shadow-sm dark:bg-slate-800/80" onClick={() => setPicker((v) => !v)} aria-label="React">
              <Smile className="h-4 w-4" />
            </button>
            <button className="icon-btn h-8 w-8 bg-white/80 shadow-sm dark:bg-slate-800/80" onClick={() => props.onReply(m)} aria-label="Reply">
              <Reply className="h-4 w-4" />
            </button>
          </div>
        )}

        {picker && (
          <div className={clsx('absolute -top-11 z-20 flex animate-pop gap-1 rounded-full bg-white px-2 py-1 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700', mine ? 'right-0' : 'left-0')}>
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                className={clsx('rounded-full p-1 text-xl transition hover:scale-125', myReaction === e && 'bg-brand-100 dark:bg-brand-900')}
                onClick={() => {
                  props.onReact(m, e);
                  setPicker(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {menu && (
          <div
            className={clsx(
              'absolute top-8 z-30 w-48 animate-pop overflow-hidden rounded-xl bg-white py-1 text-sm shadow-xl ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700',
              mine ? 'right-0' : 'left-0',
            )}
          >
            {[
              { icon: Reply, label: 'Reply', fn: () => props.onReply(m), show: true },
              { icon: Smile, label: 'React', fn: () => setPicker(true), show: true },
              { icon: Copy, label: 'Copy', fn: () => props.onCopy(m), show: !!m.content },
              { icon: Forward, label: 'Forward', fn: () => props.onForward(m), show: true },
              { icon: isPinned ? PinOff : Pin, label: isPinned ? 'Unpin' : 'Pin', fn: () => props.onPin(m, !isPinned), show: true },
              { icon: Pencil, label: 'Edit', fn: () => props.onEdit(m), show: canEdit },
              { icon: Trash2, label: 'Delete', fn: () => props.onDelete(m), show: true, danger: true },
            ]
              .filter((i) => i.show)
              .map((i) => (
                <button
                  key={i.label}
                  className={clsx('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700', i.danger && 'text-red-600')}
                  onClick={() => {
                    setMenu(false);
                    i.fn();
                  }}
                >
                  <i.icon className="h-4 w-4" /> {i.label}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubbleImpl);
