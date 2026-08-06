import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface OpenChat {
  ticketId: string;
  ticketNumber: number | null;
}

interface ChatContextType {
  openChats: OpenChat[];
  hasNewMessages: boolean;
  openChat: (ticketId: string, ticketNumber?: number) => void;
  closeChat: (ticketId: string) => void;
  closeAllChats: () => void;
  isChatOpen: (ticketId: string) => boolean;
  setHasNewMessages: (value: boolean) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [openChats, setOpenChats] = useState<OpenChat[]>([]);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const openChat = useCallback((ticketId: string, ticketNumber?: number) => {
    setOpenChats(prev => {
      if (prev.some(c => c.ticketId === ticketId)) return prev;
      const next = [...prev, { ticketId, ticketNumber: ticketNumber ?? null }];
      if (next.length > 3) next.shift();
      return next;
    });
    setHasNewMessages(false);
  }, []);

  const closeChat = useCallback((ticketId: string) => {
    setOpenChats(prev => prev.filter(c => c.ticketId !== ticketId));
  }, []);

  const closeAllChats = useCallback(() => {
    setOpenChats([]);
  }, []);

  const isChatOpen = useCallback((ticketId: string) => {
    return openChats.some(c => c.ticketId === ticketId);
  }, [openChats]);

  return (
    <ChatContext.Provider value={{ openChats, hasNewMessages, openChat, closeChat, closeAllChats, isChatOpen, setHasNewMessages }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat deve ser usado dentro de um ChatProvider');
  }
  return context;
}
