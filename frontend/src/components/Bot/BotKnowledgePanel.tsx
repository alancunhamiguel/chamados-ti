import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../contexts/ToastContext';
import {
  BotKnowledge,
  BotKnowledgeInput,
  botErrorMessage,
  createKnowledge,
  deleteKnowledge,
  getBotStatus,
  listKnowledge,
  updateKnowledge,
} from '../../api/bot';

const emptyForm = { title: '', category: '', content: '' };

/**
 * Base de conhecimento do SuporteBot. Cada artigo ativo entra no prompt do bot,
 * entao e aqui que a equipe "ensina" o bot sobre a empresa (procedimentos,
 * sistemas internos, politicas, FAQ).
 */
export default function BotKnowledgePanel() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BotKnowledge | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: status } = useQuery({ queryKey: ['bot-status'], queryFn: getBotStatus });
  const { data: articles, isLoading } = useQuery({ queryKey: ['bot-knowledge'], queryFn: listKnowledge });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['bot-knowledge'] });
    queryClient.invalidateQueries({ queryKey: ['bot-status'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: BotKnowledgeInput) => createKnowledge(data),
    onSuccess: () => { invalidate(); closeForm(); addToast('success', 'Artigo criado. O SuporteBot ja usa esse conteudo.'); },
    onError: (err) => addToast('error', botErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BotKnowledgeInput> }) => updateKnowledge(id, data),
    onSuccess: () => { invalidate(); closeForm(); addToast('success', 'Artigo atualizado.'); },
    onError: (err) => addToast('error', botErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteKnowledge(id),
    onSuccess: () => { invalidate(); addToast('success', 'Artigo excluido.'); },
    onError: (err) => addToast('error', botErrorMessage(err)),
  });

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (art: BotKnowledge) => {
    setEditing(art);
    setForm({ title: art.title, category: art.category || '', content: art.content });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const submit = () => {
    const data = { title: form.title.trim(), category: form.category.trim() || null, content: form.content.trim() };
    if (data.title.length < 3 || data.content.length < 3) {
      addToast('error', 'Preencha titulo e conteudo.');
      return;
    }
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      {/* Situacao */}
      <div className="bg-white rounded-card shadow-card p-5 mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-700">Base de conhecimento do SuporteBot</p>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Tudo que estiver ativo aqui vai para o bot em toda resposta. Escreva como se explicasse para um colega:
            procedimentos passo a passo, nomes de sistemas, quem procurar, politicas. Tecnicos tambem podem salvar
            boas respostas direto pelo chat com o botao &quot;Ensinar&quot;.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</p>
            <p className={`text-sm font-semibold ${status?.configured ? 'text-emerald-600' : 'text-amber-600'}`}>
              {status ? (status.configured ? 'Ativo' : 'Sem ANTHROPIC_API_KEY') : '...'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Modelo</p>
            <p className="text-sm font-semibold text-slate-600">{status?.model || '...'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Artigos ativos</p>
            <p className="text-sm font-semibold text-slate-600">{status?.knowledge_articles ?? '...'}</p>
          </div>
          <button
            onClick={openNew}
            className="bg-primary-500 text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-primary-600 transition-all shadow-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo artigo
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-200">
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Titulo</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Categoria</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Autor</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                    Carregando...
                  </div>
                </td>
              </tr>
            ) : !articles || articles.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400 text-sm">
                  Nenhum artigo ainda. Comece com os problemas mais comuns (VPN, impressora, e-mail, senha).
                </td>
              </tr>
            ) : (
              articles.map((art) => (
                <tr key={art.id} className="border-b border-surface-200/60 hover:bg-slate-50/50 transition-colors align-top">
                  <td className="px-5 py-3.5">
                    <button onClick={() => setExpanded(expanded === art.id ? null : art.id)} className="text-left">
                      <p className="font-medium text-sm text-slate-700">{art.title}</p>
                      <p className={`text-xs text-slate-400 mt-1 whitespace-pre-line ${expanded === art.id ? '' : 'line-clamp-2'}`}>
                        {art.content}
                      </p>
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-500">{art.category || '-'}</td>
                  <td className="px-5 py-3.5 text-sm text-slate-500">{art.author_name || '-'}</td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => updateMutation.mutate({ id: art.id, data: { is_active: !art.is_active } })}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        art.is_active ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      title="Clique para ativar/desativar"
                    >
                      {art.is_active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(art)}
                        className="text-primary-500 hover:text-primary-600 text-sm font-semibold hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-all"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => { if (confirm(`Excluir o artigo "${art.title}"?`)) deleteMutation.mutate(art.id); }}
                        className="text-red-500 hover:text-red-600 text-sm font-semibold hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal novo/editar */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-1">{editing ? 'Editar artigo' : 'Ensinar o SuporteBot'}</h2>
            <p className="text-xs text-slate-400 mb-4">O bot le este texto literalmente. Seja direto e inclua os passos exatos.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Titulo</label>
                  <input
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    maxLength={200}
                    placeholder="Ex.: Como conectar na VPN"
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Categoria (opcional)</label>
                  <input
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    maxLength={50}
                    placeholder="rede, acesso, impressora..."
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Conteudo</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  rows={10}
                  maxLength={20000}
                  placeholder={'1. Abra o cliente de VPN.\n2. Entre com o e-mail corporativo.\n3. Se der erro 809, ligue para o ramal 2200.'}
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={closeForm} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 rounded-lg transition-all">
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="px-4 py-2 bg-primary-500 text-white text-sm font-semibold rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-all shadow-sm"
              >
                {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar artigo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
