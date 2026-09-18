import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTicket, updateTicketStatus, updateTicketPriority, assignTicket } from '../api/tickets';
import { getComments, addComment, getHistory } from '../api/comments';
import { getAttachments, uploadAttachment, deleteAttachment, downloadAttachment } from '../api/attachments';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { useToast } from '../contexts/ToastContext';
import api from '../api/client';

const statusLabels: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em Andamento',
  waiting: 'Aguardando',
  resolved: 'Resolvido',
  closed: 'Encerrado',
};

const priorityLabels: Record<string, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
  critical: 'Critica',
};

const categoryLabels: Record<string, string> = {
  hardware: 'Hardware',
  software: 'Software',
  network: 'Rede',
  access: 'Acesso',
  other: 'Outro',
};

const statusBadgeColors: Record<string, string> = {
  open: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-50 text-blue-600',
  waiting: 'bg-amber-50 text-amber-600',
  resolved: 'bg-emerald-50 text-emerald-600',
  closed: 'bg-slate-100 text-slate-500',
};

const priorityBadgeColors: Record<string, string> = {
  low: 'bg-slate-50 text-slate-500',
  medium: 'bg-blue-50 text-blue-600',
  high: 'bg-orange-50 text-orange-600',
  critical: 'bg-red-50 text-red-600',
};

const STAFF_STATUS_OPTIONS: Record<string, string[]> = {
  open: ['in_progress'],
  in_progress: ['waiting', 'resolved'],
  waiting: ['in_progress'],
  resolved: ['in_progress'],
  closed: [],
};

function getSlaStatus(slaDeadline: string | undefined, status: string): { color: string; label: string } {
  if (!slaDeadline || status === 'closed' || status === 'resolved') return { color: 'text-slate-400', label: '' };
  const now = new Date();
  const deadline = new Date(slaDeadline);
  const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursLeft < 0) return { color: 'text-red-600 bg-red-50 border-red-200', label: 'SLA estourado' };
  if (hoursLeft < 4) return { color: 'text-red-600 bg-red-50 border-red-200', label: 'SLA critico' };
  if (hoursLeft < 8) return { color: 'text-amber-600 bg-amber-50 border-amber-200', label: 'SLA proximo' };
  return { color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'SLA ok' };
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole, user } = useAuth();
  const { addToast } = useToast();
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', category: '' });
  const { openChat, closeChat, isChatOpen } = useChat();

  const { data: ticket } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id!),
    enabled: !!id,
    refetchInterval: 8000,
  });

  const ticketChatOpen = id ? isChatOpen(id) : false;

  useEffect(() => {
    if (id && ticket) openChat(id, ticket.ticket_number);
  }, [id, ticket]);

  const { data: comments } = useQuery({
    queryKey: ['comments', id],
    queryFn: () => getComments(id!),
    enabled: !!id,
    refetchInterval: 8000,
  });

  const { data: history } = useQuery({
    queryKey: ['history', id],
    queryFn: () => getHistory(id!),
    enabled: !!id,
    refetchInterval: 8000,
  });

  const { data: technicians } = useQuery({
    queryKey: ['technicians'],
    queryFn: async () => {
      const res = await api.get('/users/technicians');
      return res.data;
    },
    enabled: hasRole(['admin', 'technician']),
  });

  const { data: attachments } = useQuery({
    queryKey: ['attachments', id],
    queryFn: () => getAttachments(id!),
    enabled: !!id,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(id!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', id] });
      addToast('success', 'Arquivo anexado com sucesso!');
    },
    onError: () => addToast('error', 'Erro ao enviar arquivo.'),
  });

  const deleteAttachMutation = useMutation({
    mutationFn: (attachmentId: string) => deleteAttachment(id!, attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', id] });
      addToast('success', 'Anexo removido!');
    },
    onError: () => addToast('error', 'Erro ao remover anexo.'),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
      e.target.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateTicketStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      addToast('success', 'Status atualizado com sucesso!');
    },
    onError: () => addToast('error', 'Erro ao atualizar status.'),
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: string) => updateTicketPriority(id!, priority),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      addToast('success', 'Prioridade atualizada!');
    },
    onError: () => addToast('error', 'Erro ao atualizar prioridade.'),
  });

  const closeMutation = useMutation({
    mutationFn: () => updateTicketStatus(id!, 'closed'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      setShowCloseConfirm(false);
      addToast('success', 'Chamado encerrado com sucesso!');
    },
    onError: () => addToast('error', 'Erro ao encerrar chamado.'),
  });

  const assignMutation = useMutation({
    mutationFn: (technicianId: string) => assignTicket(id!, technicianId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      addToast('success', 'Tecnico atribuido com sucesso!');
    },
    onError: () => addToast('error', 'Erro ao atribuir tecnico.'),
  });

  const editMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const res = await api.put(`/tickets/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      setIsEditing(false);
      addToast('success', 'Chamado atualizado!');
    },
    onError: () => addToast('error', 'Erro ao atualizar chamado.'),
  });

  const commentMutation = useMutation({
    mutationFn: () => addComment(id!, { message: comment, is_internal: isInternal }),
    onSuccess: () => {
      setComment('');
      setIsInternal(false);
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
      addToast('success', 'Comentario adicionado!');
    },
    onError: () => addToast('error', 'Erro ao enviar comentario.'),
  });

  const startEdit = () => {
    setEditForm({
      title: ticket.title,
      description: ticket.description,
      category: ticket.category || '',
    });
    setIsEditing(true);
  };

  if (!ticket) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  const isOwner = ticket.created_by === user?.id;
  const slaInfo = getSlaStatus(ticket.sla_deadline, ticket.status);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back Button */}
      <button
        onClick={() => navigate('/tickets')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-primary-500 mb-4 transition-colors font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar para chamados
      </button>

      {/* Ticket Header */}
      <div className="bg-white rounded-card shadow-card p-6 mb-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-primary-500">#{ticket.ticket_number}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-800">{ticket.title}</h1>
            <p className="text-sm text-slate-400 mt-1">
              Criado por <span className="font-medium text-slate-500">{ticket.creator?.name}</span> em {new Date(ticket.created_at).toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${statusBadgeColors[ticket.status]}`}>
              {statusLabels[ticket.status]}
            </span>
            {(hasRole('technician') || hasRole('admin')) && (
              <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${priorityBadgeColors[ticket.priority]}`}>
                {priorityLabels[ticket.priority]}
              </span>
            )}
          </div>
        </div>

        {/* Edit Mode */}
        {isEditing && isOwner ? (
          <div className="space-y-4 mb-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Titulo</label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Descricao</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Categoria</label>
              <select
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="">Selecione</option>
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => editMutation.mutate(editForm)}
                disabled={editMutation.isPending}
                className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-600 disabled:opacity-50"
              >
                {editMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 border border-surface-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">{ticket.description}</p>
            <div className="grid grid-cols-3 gap-4 text-sm bg-slate-50 rounded-xl p-4">
              <div>
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Setor</span>
                <p className="text-slate-700 font-medium mt-0.5">{ticket.sector?.name}</p>
              </div>
              <div>
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Categoria</span>
                <p className="text-slate-700 font-medium mt-0.5">{categoryLabels[ticket.category || ''] || ticket.category || '-'}</p>
              </div>
              <div>
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Responsavel</span>
                <p className="text-slate-700 font-medium mt-0.5">{ticket.assignee?.name || 'Nao atribuido'}</p>
              </div>
            </div>
          </>
        )}

        {/* SLA */}
        {ticket.sla_deadline && (
          <div className={`mt-4 flex items-center gap-2 text-sm border rounded-lg px-4 py-2.5 ${slaInfo.color}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{slaInfo.label}</span>
            <span className="text-slate-400">|</span>
            <span>{new Date(ticket.sla_deadline).toLocaleString('pt-BR')}</span>
          </div>
        )}

        {/* Edit button for owner */}
        {isOwner && !isEditing && ticket.status !== 'closed' && (
          <button
            onClick={startEdit}
            className="mt-4 flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-600 font-semibold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar chamado
          </button>
        )}
      </div>

      {/* Actions (tech/admin) */}
      {(hasRole('technician') || hasRole('admin')) && (
        <div className="bg-white rounded-card shadow-card p-6 mb-5">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Acoes</h2>
          <div className="flex gap-3 flex-wrap">
            <select
              value={ticket.status}
              onChange={(e) => statusMutation.mutate(e.target.value)}
              disabled={statusMutation.isPending}
              className="px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            >
              <option value={ticket.status} disabled>{statusLabels[ticket.status]}</option>
              {(STAFF_STATUS_OPTIONS[ticket.status] || []).map((s) => (
                <option key={s} value={s}>{statusLabels[s]}</option>
              ))}
            </select>
            <select
              value={ticket.priority}
              onChange={(e) => priorityMutation.mutate(e.target.value)}
              disabled={priorityMutation.isPending}
              className="px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            >
              <option value="low">Baixa</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="critical">Critica</option>
            </select>
            {(hasRole('admin') || hasRole('technician')) && technicians && ticket.status !== 'closed' && (
              <select
                value={ticket.assigned_to || ''}
                onChange={(e) => e.target.value && assignMutation.mutate(e.target.value)}
                disabled={assignMutation.isPending}
                className="px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
              >
                <option value="">Atribuir responsavel</option>
                {technicians.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <button
          onClick={() => {
            if (ticketChatOpen) {
              closeChat(id!);
            } else {
              openChat(id!);
            }
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            ticketChatOpen
              ? 'bg-primary-500 text-white shadow-sm'
              : 'bg-primary-50 text-primary-600 border border-primary-200 hover:bg-primary-100'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {(ticketChatOpen) ? 'Fechar Chat' : 'Abrir Chat'}
        </button>

        <div className="flex gap-2 flex-wrap">
          {ticket.status === 'resolved' && isOwner && (
            <>
              <button
                onClick={() => statusMutation.mutate('closed')}
                disabled={statusMutation.isPending}
                className="bg-emerald-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-all shadow-sm"
              >
                Confirmar Solucao
              </button>
              <button
                onClick={() => statusMutation.mutate('in_progress')}
                disabled={statusMutation.isPending}
                className="bg-amber-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-all shadow-sm"
              >
                Devolver / Nao resolvido
              </button>
            </>
          )}
          {ticket.status !== 'closed' && (hasRole('technician') || hasRole('admin')) && (
            <button
              onClick={() => setShowCloseConfirm(true)}
              className="bg-red-50 text-red-600 border border-red-200 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-red-100 transition-all"
            >
              Encerrar Chamado
            </button>
          )}
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-card shadow-card p-6 mb-5">
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Historico</h2>
        <div className="space-y-3">
          {history?.map((h: any) => (
            <div key={h.id} className="flex items-start gap-3 text-sm">
              <div className="w-2 h-2 bg-primary-400 rounded-full mt-2 flex-shrink-0"></div>
              <div className="flex-1">
                <p className="text-slate-600">
                  <span className="font-semibold text-slate-700">{h.user_name}</span>{' '}
                  {h.description || h.action}
                  {h.old_value && h.new_value && (
                    <span className="text-slate-400"> ({h.old_value} &rarr; {h.new_value})</span>
                  )}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(h.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comments */}
      <div className="bg-white rounded-card shadow-card p-6 mb-5">
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Comentarios</h2>
        <div className="space-y-3 mb-5">
          {comments?.map((c: any) => (
            <div key={c.id} className={`p-4 rounded-xl ${c.is_internal ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-400 flex items-center justify-center text-white text-[10px] font-bold">
                    {c.user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <span className="font-semibold text-sm text-slate-700">{c.user?.name}</span>
                </div>
                <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleString('pt-BR')}</span>
              </div>
              <p className="text-sm text-slate-600 ml-8">{c.message}</p>
              {c.is_internal && (
                <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide ml-8">Comentario interno</span>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-surface-200 pt-4">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Adicionar comentario..."
            rows={3}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) commentMutation.mutate(); }}
            className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none mb-3"
          />
          <div className="flex justify-between items-center">
            {(hasRole('technician') || hasRole('admin')) && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="w-4 h-4 text-primary-500 rounded border-surface-200 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-500">Comentario interno</span>
              </label>
            )}
            <button
              onClick={() => commentMutation.mutate()}
              disabled={!comment.trim() || commentMutation.isPending}
              className="bg-primary-500 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all shadow-sm"
            >
              {commentMutation.isPending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">Ctrl+Enter para enviar rapidamente</p>
        </div>
      </div>

      {/* Attachments */}
      <div className="bg-white rounded-card shadow-card p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Anexos</h2>
          {ticket.status !== 'closed' && (
            <>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="flex items-center gap-1.5 text-sm font-semibold text-primary-500 hover:text-primary-600 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-all"
              >
                {uploadMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                )}
                Anexar arquivo
              </button>
            </>
          )}
        </div>

        {attachments?.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-surface-200">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-primary-50 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </div>
                  <button
                    onClick={() => downloadAttachment(id!, a.id, a.original_filename)}
                    className="text-left hover:text-primary-600"
                  >
                    <p className="text-sm font-medium text-slate-700 group-hover:text-primary-600">{a.original_filename}</p>
                    <p className="text-[10px] text-slate-400">{formatFileSize(a.file_size)} · {a.uploader_name} · {new Date(a.created_at).toLocaleString('pt-BR')}</p>
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => downloadAttachment(id!, a.id, a.original_filename)}
                    title="Baixar"
                    className="text-slate-400 hover:text-primary-500 p-1.5 rounded-lg hover:bg-primary-50 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 12m4 4V4" />
                    </svg>
                  </button>
                  {(isOwner || hasRole('technician') || hasRole('admin')) && (
                  <button
                    onClick={() => {
                      if (confirm(`Remover "${a.original_filename}"?`)) {
                        deleteAttachMutation.mutate(a.id);
                      }
                    }}
                    className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-4">Nenhum anexo</p>
        )}
      </div>

      {/* Close Confirmation Modal */}
      {showCloseConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-card shadow-xl p-6 w-96">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Encerrar Chamado</h2>
                <p className="text-sm text-slate-400">Tem certeza?</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              Esta acao ira encerrar o chamado <span className="font-semibold">#{ticket.ticket_number}</span>. O historico sera preservado.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-all border border-surface-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending}
                className="px-4 py-2.5 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-all shadow-sm"
              >
                {closeMutation.isPending ? 'Fechando...' : 'Sim, fechar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
