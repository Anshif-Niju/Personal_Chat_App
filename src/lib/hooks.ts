import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from './api';
import { useChat } from '../store/chat';
import { useUi } from '../store/ui';
import type { Conversation } from '../types';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Opens (or creates) the private chat with a friend. */
export function useStartChat() {
  const navigate = useNavigate();
  return useCallback(
    async (userId: string) => {
      try {
        const { data } = await api.post('/conversations/private', { userId });
        const conv: Conversation = data.conversation;
        useChat.getState().upsertConversation(conv);
        navigate(`/chat/${conv.id}`);
        return conv;
      } catch (err) {
        useUi.getState().toast(errorMessage(err), 'error');
        return null;
      }
    },
    [navigate],
  );
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
