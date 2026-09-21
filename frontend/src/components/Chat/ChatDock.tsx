import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import api from '../../api/client';

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  is_system: boolean;
  created_at: string;
}

function buildWsUrl(ticketId: string): string {
  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/?api\/?$/, '').replace(/\/$/, '');
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const token = localStorage.getItem('token');
  if (base) {
    return `${proto}://${base.replace(/^https?:\/\//, '')}/ws/chat/${ticketId}?token=${encodeURIComponent(token || '')}`;
  }
  return `${proto}://${window.location.host}/ws/chat/${ticketId}?token=${encodeURIComponent(token || '')}`;
}

export default function ChatDock() {
  const {
    openChats,
    activeChatId,
    dockOpen,
    totalUnread,
    selectChat,
    closeChat,
    setDockOpen,
    backToList,
    clearUnread,
  } = useChat();
  const { user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [wsOnline, setWsOnline] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCountRef = useRef(0);

  const activeTicket = activeChatId ? openChats.find(c => c.ticketId === activeChatId) : undefined;

  const handleIncoming = (msg: ChatMessage) => {
    setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
  };

  // Load history + realtime (WS with REST fallback) for the active chat only.
  useEffect(() => {
    if (!activeChatId) return;

    setMessages([]);
    lastCountRef.current = 0;
    setWsOnline(false);

    let cancelled = false;

    api
      .get(`/tickets/${activeChatId}/chat`)
      .then(({ data }) => {
        if (cancelled) return;
        setMessages(data);
        lastCountRef.current = data.length;
      })
      .catch(() => {});

    const connect = () => {
      try {
        const ws = new WebSocket(buildWsUrl(activeChatId));
        wsRef.current = ws;
        ws.onopen = () => {
          setWsOnline(true);
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'message') {
              handleIncoming(data);
              clearUnread(activeChatId);
            }
          } catch {}
        };
        ws.onclose = () => {
          setWsOnline(false);
          startPolling();
        };
        ws.onerror = () => {
          setWsOnline(false);
          startPolling();
        };
      } catch {
        setWsOnline(false);
        startPolling();
      }
    };

    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await api.get(`/tickets/${activeChatId}/chat`);
          const prevCount = lastCountRef.current;
          if (data.length > prevCount && prevCount > 0) {
            const newMsg = data[data.length - 1];
            handleIncoming(newMsg);
            clearUnread(activeChatId);
          }
          lastCountRef.current = data.length;
          setMessages(data);
        } catch {}
      }, 3000);
    };

    const token = localStorage.getItem('token');
    if (token) connect();

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      if (wsRef.current) wsRef.current.close();
      pollRef.current = null;
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChatId]);

  const sendMessage = async () => {
    if (!draft.trim() || sending || !activeChatId) return;

    const msgText = draft.trim();
    setDraft('');
    setSending(true);

    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message', message: msgText }));
      } else {
        await api.post(`/tickets/${activeChatId}/chat`, { message: msgText });
      }
    } catch {
      setDraft(msgText);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {!dockOpen && (
        <button
          onClick={() => setDockOpen(true)}
          className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-xl hover:bg-primary-600 transition-all"
          style={{ boxShadow: '0 8px 28px rgba(0, 102, 255, 0.35), 0 4px 12px rgba(0, 0, 0, 0.12)' }}
          title="Conversas"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 bg-red-500 border-2 border-white rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse">
              {totalUnread}
            </span>
          )}
        </button>
      )}

      {dockOpen && (
        <div className="fixed bottom-0 right-4 z-50" style={{ width: '380px' }}>
          <div className="bg-white rounded-t-2xl shadow-2xl border border-surface-200 overflow-hidden flex flex-col" style={{ height: '560px', boxShadow: '0 -8px 40px rgba(0, 0, 0, 0.15), 0 -4px 20px rgba(0, 102, 255, 0.08)' }}>
            {/* Header */}
            <div className="bg-primary-500 text-white px-4 py-3 flex items-center justify-between">
              {activeChatId ? (
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={backToList} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0" title="Voltar para as conversas">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">Chamado {activeTicket?.ticketNumber ? `#${activeTicket.ticketNumber}` : ''}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${wsOnline ? 'bg-emerald-400' : 'bg-amber-300'}`}></span>
                      <span className="text-[10px] text-white/80">{wsOnline ? 'Online' : 'Atualizando...'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-sm font-semibold">Conversas {openChats.length > 0 && <span className="ml-1 text-white/70">({openChats.length})</span>}</p>
                </div>
              )}
              <div className="flex items-center gap-2 flex-shrink-0">
                {activeChatId && totalUnread > 0 && (
                  <span className="min-w-5 h-5 px-1.5 bg-white text-primary-500 rounded-full text-[10px] font-bold flex items-center justify-center">
                    {totalUnread}
                  </span>
                )}
                <button onClick={() => setDockOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" title="Fechar">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {!activeChatId ? (
              /* ---------- Conversation list ---------- */
              <div className="flex-1 overflow-y-auto">
                {openChats.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-400">Nenhuma conversa aberta</p>
                    <p className="text-xs text-slate-300 mt-1">Abra um chamado e clique em &quot;Abrir Chat&quot;</p>
                  </div>
                ) : (
                  openChats.map(chat => (
                    <div
                      key={chat.ticketId}
                      onClick={() => selectChat(chat.ticketId)}
                      className="flex items-center gap-3 px-4 py-3 border-b border-surface-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${chat.unread > 0 ? 'bg-primary-500' : 'bg-slate-200'}`}>
                        <svg className={`w-5 h-5 ${chat.unread > 0 ? 'text-white' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${chat.unread > 0 ? 'font-bold text-slate-800' : 'font-semibold text-slate-600'}`}>
                            Chamado {chat.ticketNumber ? `#${chat.ticketNumber}` : ''}
                          </p>
                        </div>
                        <p className={`text-xs truncate ${chat.unread > 0 ? 'font-semibold text-slate-600' : 'text-slate-400'}`}>
                          {chat.previewSender ? <span className="text-slate-500">{chat.previewSender}: </span> : null}
                          {chat.preview || 'Sem mensagens'}
                        </p>
                      </div>
                      {chat.unread > 0 && (
                        <span className="min-w-5 h-5 px-1.5 bg-primary-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {chat.unread}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); closeChat(chat.ticketId); }}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                        title="Remover conversa"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* ---------- Active chat ---------- */
              <>
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                      <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <p className="text-sm text-slate-400">Nenhuma mensagem ainda</p>
                      <p className="text-xs text-slate-300 mt-1">Envie uma mensagem para iniciar a conversa</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map(msg => {
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
                              </div>
                            </div>
                          );
                        }
                        const isMe = msg.sender_id === user?.id;
                        return (
                          <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] ${isMe ? 'order-2' : ''}`}>
                              {!isMe && <p className="text-[10px] font-semibold text-slate-500 mb-1 ml-1">{msg.sender_name}</p>}
                              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                isMe ? 'bg-primary-500 text-white rounded-br-md' : 'bg-white text-slate-700 border border-surface-200 rounded-bl-md'
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

                <div className="p-3 bg-white border-t border-surface-200">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Digite sua mensagem..."
                      className="flex-1 px-4 py-2.5 bg-slate-50 border border-surface-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!draft.trim() || sending}
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