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
  const { openChats, openChat, setHasNewMessages } = useChat();
  const { user } = useAuth();
  const seenRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const openChatsRef = useRef(openChats);
  const openChatRef = useRef(openChat);
  const userIdRef = useRef(user?.id);
  const setHasNewMessagesRef = useRef(setHasNewMessages);

  useEffect(() => { openChatsRef.current = openChats; }, [openChats]);
  useEffect(() => { openChatRef.current = openChat; }, [openChat]);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);
  useEffect(() => { setHasNewMessagesRef.current = setHasNewMessages; }, [setHasNewMessages]);

  useEffect(() => {
    if (!user) return;

    const poll = async () => {
      try {
        const { data } = await api.get<Notification[]>('/tickets/notifications');

        for (const notif of data) {
          if (seenRef.current.has(notif.message_id)) continue;
          seenRef.current.add(notif.message_id);

          const chatIsOpen = openChatsRef.current.some(c => c.ticketId === notif.ticket_id);

          if (!chatIsOpen) {
            openChatRef.current(notif.ticket_id, notif.ticket_number ?? undefined);
          } else {
            setHasNewMessagesRef.current(true);
          }
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
