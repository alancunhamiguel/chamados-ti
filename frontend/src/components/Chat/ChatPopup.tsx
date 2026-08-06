import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/client';

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  is_system: boolean;
  created_at: string;
}

interface ChatPopupProps {
  ticketId: string;
  ticketNumber?: number;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  stackIndex?: number;
}

export default function ChatPopup({ ticketId, ticketNumber, isOpen, onOpen, onClose, stackIndex = 0 }: ChatPopupProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const lastCountRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [notification, setNotification] = useState<ChatMessage | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOpenRef = useRef(isOpen);
  const isMinimizedRef = useRef(isMinimized);
  const userIdRef = useRef(user?.id);
  const onOpenRef = useRef(onOpen);
  const ticketNumberRef = useRef(ticketNumber);

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  useEffect(() => { isMinimizedRef.current = isMinimized; }, [isMinimized]);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  useEffect(() => { ticketNumberRef.current = ticketNumber; }, [ticketNumber]);

  useEffect(() => {
    const poll = async () => {
      try {
        const { data } = await api.get(`/tickets/${ticketId}/chat`);
        const prevCount = lastCountRef.current;

        if (data.length > prevCount && prevCount > 0) {
          const newMsg = data[data.length - 1];
          if (newMsg.sender_id !== userIdRef.current) {
            if (!isOpenRef.current) {
              onOpenRef.current();
              setIsMinimized(false);
            } else if (isMinimizedRef.current) {
              setNotification(newMsg);
              setHasNewMessages(true);
              if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
              notificationTimerRef.current = setTimeout(() => setNotification(null), 5000);
            }
          }
        }

        lastCountRef.current = data.length;
        setMessages(data);
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    };
  }, [ticketId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setNotification(null);
      setHasNewMessages(false);
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    const msgText = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      await api.post(`/tickets/${ticketId}/chat`, { message: msgText });
    } catch {
      setNewMessage(msgText);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNotificationClick = () => {
    onOpen();
    setIsMinimized(false);
    setNotification(null);
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
  };

  return (
    <>
      {/* Notification Toast */}
      {notification && !isOpen && (
        <div
          onClick={handleNotificationClick}
          className="fixed bottom-6 right-6 z-[60] bg-white rounded-xl shadow-2xl border border-surface-200 p-4 cursor-pointer hover:shadow-3xl transition-all animate-slide-up"
          style={{ width: '340px', boxShadow: '0 8px 32px rgba(0, 102, 255, 0.15), 0 4px 16px rgba(0, 0, 0, 0.1)' }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-sm font-bold text-slate-800">Chamado {ticketNumber ? `#${ticketNumber}` : ''}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); setNotification(null); }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs font-semibold text-primary-500 mb-0.5">{notification.sender_name}</p>
              <p className="text-sm text-slate-600 truncate">{notification.message}</p>
            </div>
          </div>
          <div className="mt-2 text-right">
            <span className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide">Clique para abrir</span>
          </div>
        </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-0 right-6 z-50" style={{ width: '380px', right: `${24 + stackIndex * 396}px` }}>
          <div className="bg-white rounded-t-2xl shadow-2xl border border-surface-200 overflow-hidden" style={{ boxShadow: '0 -8px 40px rgba(0, 0, 0, 0.15), 0 -4px 20px rgba(0, 102, 255, 0.08), -4px 0 24px rgba(0, 0, 0, 0.06)' }}>
            {/* Header */}
            <div
              className={`text-white px-4 py-3 flex items-center justify-between cursor-pointer transition-colors duration-300 ${
                isMinimized && hasNewMessages
                  ? 'bg-amber-500'
                  : 'bg-primary-500'
              }`}
              onClick={() => { setIsMinimized(!isMinimized); setHasNewMessages(false); }}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  {isMinimized && hasNewMessages && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">Chamado {ticketNumber ? `#${ticketNumber}` : ''}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span className="text-[10px] text-white/80">Online</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className={`w-4 h-4 transition-transform ${isMinimized ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(); }}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            {!isMinimized && (
              <>
                <div className="h-80 overflow-y-auto p-4 bg-slate-50">
                  {messages.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <p className="text-sm text-slate-400">Nenhuma mensagem ainda</p>
                      <p className="text-xs text-slate-300 mt-1">Envie uma mensagem para iniciar a conversa</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((msg) => {
                        if (msg.is_system) {
                          return (
                            <div key={msg.id} className="flex justify-center">
                              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 max-w-[90%]">
                                <div className="flex items-center gap-2 mb-1">
                                  <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Sistema</span>
                                </div>
                                <p className="text-xs text-amber-800 whitespace-pre-line leading-relaxed">{msg.message}</p>
                                <p className="text-[9px] text-amber-400 mt-1.5">
                                  {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          );
                        }
                        const isMe = msg.sender_id === user?.id;
                        return (
                          <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] ${isMe ? 'order-2' : ''}`}>
                              {!isMe && (
                                <p className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">{msg.sender_name}</p>
                              )}
                              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                isMe
                                  ? 'bg-primary-500 text-white rounded-br-md'
                                  : 'bg-white text-slate-700 border border-surface-200 rounded-bl-md'
                              }`}>
                                {msg.message}
                              </div>
                              <p className={`text-[9px] text-slate-400 mt-1 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>
                                {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="p-3 bg-white border-t border-surface-200">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Digite sua mensagem..."
                      className="flex-1 px-4 py-2.5 bg-slate-50 border border-surface-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || sending}
                      className="w-10 h-10 bg-primary-500 text-white rounded-full flex items-center justify-center hover:bg-primary-600 disabled:opacity-50 transition-all shadow-sm flex-shrink-0"
                    >
                      {sending ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
