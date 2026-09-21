import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

export interface OpenChat {
  ticketId: string;
  ticketNumber: number | null;
  unread: number;
  preview: string;
  previewSender: string;
  previewAt: string;
}

interface ChatContextType {
  openChats: OpenChat[];
  activeChatId: string | null;
  dockOpen: boolean;
  hasNewMessages: boolean;
  totalUnread: number;
  openChat: (ticketId: string, ticketNumber?: number) => void;
  addToOpenChats: (ticketId: string, ticketNumber?: number) => void;
  selectChat: (ticketId: string) => void;
  closeChat: (ticketId: string) => void;
  setDockOpen: (open: boolean) => void;
  backToList: () => void;
  bumpUnread: (ticketId: string, preview: string, previewSender: string, previewAt: string) => void;
  clearUnread: (ticketId: string) => void;
  isChatOpen: (ticketId: string) => boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [openChats, setOpenChats] = useState<OpenChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [dockOpen, setDockOpenState] = useState(false);

  const activeRef = useRef(activeChatId);
  const dockOpenRef = useRef(dockOpen);
  activeRef.current = activeChatId;
  dockOpenRef.current = dockOpen;

  const totalUnread = openChats.reduce((acc, c) => acc + c.unread, 0);
  const hasNewMessages = totalUnread > 0;

  const addQuery = useCallback((ticketId: string, ticketNumber?: number) => {
    setOpenChats(prev => {
      if (prev.some(c => c.ticketId === ticketId)) return prev;
      return [...prev, { ticketId, ticketNumber: ticketNumber ?? null, unread: 0, preview: '', previewSender: '', previewAt: '' }];
    });
  }, []);

  const openChat = useCallback((ticketId: string, ticketNumber?: number) => {
    setOpenChats(prev => {
      if (prev.some(c => c.ticketId === ticketId)) return prev;
      return [...prev, { ticketId, ticketNumber: ticketNumber ?? null, unread: 0, preview: '', previewSender: '', previewAt: '' }];
    });
    setOpenChats(prev => prev.map(c => (c.ticketId === ticketId ? { ...c, unread: 0 } : c)));
    setActiveChatId(ticketId);
    setDockOpenState(true);
  }, []);

  const selectChat = useCallback((ticketId: string) => {
    setActiveChatId(ticketId);
    setOpenChats(prev => prev.map(c => (c.ticketId === ticketId ? { ...c, unread: 0 } : c)));
  }, []);

  const closeChat = useCallback((ticketId: string) => {
    setOpenChats(prev => prev.filter(c => c.ticketId !== ticketId));
    setActiveChatId(prev => (prev === ticketId ? null : prev));
  }, []);

  const setDockOpen = useCallback((open: boolean) => setDockOpenState(open), []);
  const backToList = useCallback(() => setActiveChatId(null), []);

  const bumpUnread = useCallback((ticketId: string, preview: string, previewSender: string, previewAt: string) => {
    setOpenChats(prev =>
      prev.map(c => {
        if (c.ticketId !== ticketId) return c;
        const isActive = activeRef.current === ticketId && dockOpenRef.current;
        return { ...c, preview, previewSender, previewAt, unread: isActive ? c.unread : c.unread + 1 };
      })
    );
  }, []);

  const clearUnread = useCallback((ticketId: string) => {
    setOpenChats(prev => prev.map(c => (c.ticketId === ticketId ? { ...c, unread: 0 } : c)));
  }, []);

  const isChatOpen = useCallback(
    (ticketId: string) => openChats.some(c => c.ticketId === ticketId),
    [openChats]
  );

  return (
    <ChatContext.Provider
      value={{
        openChats,
        activeChatId,
        dockOpen,
        hasNewMessages,
        totalUnread,
        addToOpenChats: addQuery,
        openChat,
        selectChat,
        closeChat,
        setDockOpen,
        backToList,
        bumpUnread,
        clearUnread,
        isChatOpen,
      }}
    >
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