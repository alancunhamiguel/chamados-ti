import { useState, useEffect, useRef, Fragment } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  BotMessage,
  BotStatus,
  botErrorMessage,
  clearBotHistory,
  createKnowledge,
  getBotHistory,
  getBotStatus,
  sendBotMessage,
} from '../../api/bot';

interface SuporteBotChatProps {
  onBack: () => void;
  onClose: () => void;
}

const SUGGESTIONS = ['Meu PC esta lento', 'Problema com e-mail', 'VPN nao conecta', 'Como estao meus chamados?'];

const BotIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
  </svg>
);

/** Renderiza o texto do bot com **negrito** e quebras de linha; sem HTML. */
function renderBotText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function SuporteBotChat({ onBack, onClose }: SuporteBotChatProps) {
  const { hasRole } = useAuth();
  const { addToast } = useToast();
  const isStaff = hasRole('admin') || hasRole('technician');

  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teaching, setTeaching] = useState<{ title: string; content: string } | null>(null);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getBotHistory().catch(() => [] as BotMessage[]), getBotStatus().catch(() => null)])
      .then(([history, st]) => {
        if (cancelled) return;
        setMessages(history);
        setStatus(st);
      })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, error]);

  useEffect(() => {
    if (!loadingHistory) inputRef.current?.focus();
  }, [loadingHistory]);

  const sendMessage = async () => {
    if (!draft.trim() || sending) return;

    const msgText = draft.trim();
    setDraft('');
    setSending(true);
    setError(null);

    const tempUserMsg: BotMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: msgText,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const reply = await sendBotMessage(msgText);
      setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), { ...tempUserMsg, id: `user-${reply.id}` }, reply]);
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      setDraft(msgText);
      setError(botErrorMessage(err));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const clearHistory = async () => {
    try {
      await clearBotHistory();
      setMessages([]);
      setShowClearConfirm(false);
    } catch (err) {
      addToast('error', botErrorMessage(err));
    }
  };

  const startTeaching = (index: number) => {
    const answer = messages[index];
    const question = [...messages.slice(0, index)].reverse().find(m => m.role === 'user');
    setTeaching({
      title: (question?.content || answer.content).slice(0, 120),
      content: answer.content,
    });
  };

  const saveTeaching = async () => {
    if (!teaching || !teaching.title.trim() || !teaching.content.trim()) return;
    setSavingKnowledge(true);
    try {
      await createKnowledge({ title: teaching.title.trim(), content: teaching.content.trim() });
      addToast('success', 'Artigo salvo na base de conhecimento do SuporteBot.');
      setTeaching(null);
      setStatus(prev => (prev ? { ...prev, knowledge_articles: prev.knowledge_articles + 1 } : prev));
    } catch (err) {
      addToast('error', botErrorMessage(err));
    } finally {
      setSavingKnowledge(false);
    }
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const configured = status?.configured !== false;

  return (
    <>
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onBack} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0" title="Voltar para as conversas">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <BotIcon />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">SuporteBot</p>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${configured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-300'}`}></span>
              <span className="text-[10px] text-white/80">{configured ? 'Sempre online' : 'Desativado'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {messages.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              title="Limpar conversa (o bot esquece este historico)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" title="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Avisos */}
      {!configured && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <p className="text-xs text-amber-800 leading-relaxed">
            O SuporteBot ainda nao foi configurado. {isStaff ? 'Defina ANTHROPIC_API_KEY no backend/.env e reinicie o servidor.' : 'Avise a equipe de TI.'}
          </p>
        </div>
      )}

      {showClearConfirm && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-2">
          <p className="text-xs text-amber-800">Limpar todo o historico?</p>
          <div className="flex gap-2">
            <button onClick={clearHistory} className="px-3 py-1 bg-red-500 text-white text-xs rounded-full hover:bg-red-600 transition-colors">
              Limpar
            </button>
            <button onClick={() => setShowClearConfirm(false)} className="px-3 py-1 bg-slate-200 text-slate-600 text-xs rounded-full hover:bg-slate-300 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Formulario "Ensinar o bot" (equipe de TI) */}
      {teaching && (
        <div className="bg-violet-50 border-b border-violet-200 px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-violet-700">Salvar na base de conhecimento</p>
          <input
            value={teaching.title}
            onChange={e => setTeaching({ ...teaching, title: e.target.value })}
            maxLength={200}
            placeholder="Titulo do artigo"
            className="w-full px-3 py-1.5 bg-white border border-violet-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <textarea
            value={teaching.content}
            onChange={e => setTeaching({ ...teaching, content: e.target.value })}
            rows={4}
            placeholder="Conteudo (revise antes de salvar)"
            className="w-full px-3 py-1.5 bg-white border border-violet-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setTeaching(null)} className="px-3 py-1 bg-slate-200 text-slate-600 text-xs rounded-full hover:bg-slate-300 transition-colors">
              Cancelar
            </button>
            <button
              onClick={saveTeaching}
              disabled={savingKnowledge || !teaching.title.trim() || !teaching.content.trim()}
              className="px-3 py-1 bg-violet-600 text-white text-xs rounded-full hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {savingKnowledge ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-violet-50/50 to-white">
        {loadingHistory ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin mb-3"></div>
            <p className="text-sm text-slate-400">Carregando historico...</p>
          </div>
        ) : messages.length === 0 && !error ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-purple-100 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <BotIcon className="w-8 h-8 text-violet-500" />
            </div>
            <p className="text-sm font-semibold text-slate-600 mb-1">Ola! Sou o SuporteBot</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tiro duvidas de TI, consulto solucoes de chamados antigos
              <br />e abro um chamado para voce se precisar.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => { setDraft(suggestion); inputRef.current?.focus(); }}
                  className="px-3 py-1.5 bg-white border border-violet-200 rounded-full text-xs text-violet-600 hover:bg-violet-50 hover:border-violet-300 transition-all shadow-sm"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, index) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] group ${msg.role === 'user' ? 'order-2' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1 ml-1">
                      <div className="w-4 h-4 bg-gradient-to-br from-violet-500 to-purple-500 rounded-full flex items-center justify-center">
                        <BotIcon className="w-2.5 h-2.5 text-white" />
                      </div>
                      <span className="text-[10px] font-semibold text-violet-500">SuporteBot</span>
                      {isStaff && !msg.id.startsWith('temp-') && (
                        <button
                          onClick={() => startTeaching(index)}
                          className="ml-1 text-[10px] text-violet-400 hover:text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Salvar esta resposta na base de conhecimento"
                        >
                          Ensinar
                        </button>
                      )}
                    </div>
                  )}
                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line break-words ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-br-md shadow-sm'
                      : 'bg-white text-slate-700 border border-violet-100 rounded-bl-md shadow-sm'
                  }`}>
                    {msg.role === 'assistant' ? renderBotText(msg.content) : msg.content}
                  </div>
                  <p className={`text-[9px] text-slate-400 mt-1 ${msg.role === 'user' ? 'text-right mr-1' : 'ml-1'}`}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[85%]">
                  <div className="flex items-center gap-1.5 mb-1 ml-1">
                    <div className="w-4 h-4 bg-gradient-to-br from-violet-500 to-purple-500 rounded-full flex items-center justify-center">
                      <BotIcon className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span className="text-[10px] font-semibold text-violet-500">SuporteBot</span>
                  </div>
                  <div className="bg-white border border-violet-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="flex justify-center">
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 max-w-[90%]">
                  <p className="text-xs text-red-700 leading-relaxed">{error}</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t border-violet-100">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            maxLength={5000}
            placeholder={sending ? 'Aguardando resposta...' : configured ? 'Pergunte algo ao SuporteBot...' : 'SuporteBot desativado'}
            disabled={sending || !configured}
            className="flex-1 px-4 py-2.5 bg-violet-50/50 border border-violet-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50 placeholder-slate-400"
          />
          <button
            onClick={sendMessage}
            disabled={!draft.trim() || sending || !configured}
            className="w-10 h-10 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-full flex items-center justify-center hover:from-violet-600 hover:to-purple-600 disabled:opacity-50 transition-all shadow-sm flex-shrink-0"
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
  );
}
