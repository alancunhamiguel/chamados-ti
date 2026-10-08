import api from './client';

export interface BotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string | null;
}

export interface BotStatus {
  configured: boolean;
  provider: 'api' | 'claude_cli' | null;
  model: string;
  detail: string;
  knowledge_articles: number;
}

export const providerLabel = (p: BotStatus['provider']) =>
  p === 'api' ? 'API da Anthropic' : p === 'claude_cli' ? 'Assinatura Claude (CLI)' : 'Nao configurado';

export interface BotKnowledge {
  id: string;
  title: string;
  content: string;
  category: string | null;
  is_active: boolean;
  author_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BotKnowledgeInput {
  title: string;
  content: string;
  category?: string | null;
  is_active?: boolean;
}

export const getBotStatus = () => api.get<BotStatus>('/bot/status').then(r => r.data);
export const getBotHistory = () => api.get<BotMessage[]>('/bot/history').then(r => r.data);
export const sendBotMessage = (message: string) =>
  api.post<BotMessage>('/bot/chat', { message }).then(r => r.data);
export const clearBotHistory = () => api.delete('/bot/history').then(r => r.data);

export const listKnowledge = () => api.get<BotKnowledge[]>('/bot/knowledge').then(r => r.data);
export const createKnowledge = (data: BotKnowledgeInput) =>
  api.post<BotKnowledge>('/bot/knowledge', data).then(r => r.data);
export const updateKnowledge = (id: string, data: Partial<BotKnowledgeInput>) =>
  api.put<BotKnowledge>(`/bot/knowledge/${id}`, data).then(r => r.data);
export const deleteKnowledge = (id: string) => api.delete(`/bot/knowledge/${id}`).then(r => r.data);

/** Mensagem de erro legivel vinda do backend (detail) ou generica. */
export function botErrorMessage(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return 'Nao foi possivel falar com o SuporteBot agora. Tente novamente.';
}
