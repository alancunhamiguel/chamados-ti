import { useEffect, useRef } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/client';

interface Notification {
  ticket_id: string;
  ticket_number: number | null;
  message_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
}

export default function ChatNotificationPoller() {
  const { openChats, addToOpenChats, bumpUnread } = useChat();
  const { user } = useAuth();
  const seenRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const openChatsRef = useRef(openChats);
  const addRef = useRef(addToOpenChats);
  const bumpUnreadRef = useRef(bumpUnread);

  useEffect(() => { openChatsRef.current = openChats; }, [openChats]);
  useEffect(() => { addRef.current = addToOpenChats; }, [addToOpenChats]);
  useEffect(() => { bumpUnreadRef.current = bumpUnread; }, [bumpUnread]);

  useEffect(() => {
    if (!user) return;

    const poll = async () => {
      try {
        const { data } = await api.get<Notification[]>('/tickets/notifications');

        for (const notif of data) {
          if (seenRef.current.has(notif.message_id)) continue;
          seenRef.current.add(notif.message_id);

          const chatExists = openChatsRef.current.some(c => c.ticketId === notif.ticket_id);
          if (!chatExists) {
            addRef.current(notif.ticket_id, notif.ticket_number ?? undefined);
          }
          bumpUnreadRef.current(notif.ticket_id, notif.message, notif.sender_name, notif.created_at);
        }
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user]);

  return null;
}