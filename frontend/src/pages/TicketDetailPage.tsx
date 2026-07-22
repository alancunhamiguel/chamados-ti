import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTicket, updateTicketStatus, updateTicketPriority, assignTicket, closeTicket } from '../api/tickets';
import { getComments, addComment, getHistory } from '../api/comments';
import { useAuth } from '../contexts/AuthContext';

const statusLabels: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em Andamento',
  waiting: 'Aguardando',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

const priorityLabels: Record<string, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
  critical: 'Critica',
};

const statusColors: Record<string, string> = {
  open: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  waiting: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-200 text-gray-600',
};

const priorityColors: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const { data: ticket } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id!),
    enabled: !!id,
  });

  const { data: comments } = useQuery({
    queryKey: ['comments', id],
    queryFn: () => getComments(id!),
    enabled: !!id,
  });

  const { data: history } = useQuery({
    queryKey: ['history', id],
    queryFn: () => getHistory(id!),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateTicketStatus(id!, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: string) => updateTicketPriority(id!, priority),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  const closeMutation = useMutation({
    mutationFn: () => closeTicket(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  const commentMutation = useMutation({
    mutationFn: () => addComment(id!, { message: comment, is_internal: isInternal }),
    onSuccess: () => {
      setComment('');
      setIsInternal(false);
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
    },
  });

  if (!ticket) return <div className="text-center py-8">Carregando...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold">#{ticket.ticket_number} - {ticket.title}</h1>
            <p className="text-gray-500 mt-1">
              Criado por {ticket.creator?.name} em {new Date(ticket.created_at).toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-sm ${statusColors[ticket.status]}`}>
              {statusLabels[ticket.status]}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm ${priorityColors[ticket.priority]}`}>
              {priorityLabels[ticket.priority]}
            </span>
          </div>
        </div>

        <p className="text-gray-700 mb-4">{ticket.description}</p>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Setor:</span> {ticket.sector?.name}
          </div>
          <div>
            <span className="text-gray-500">Categoria:</span> {ticket.category || '-'}
          </div>
          <div>
            <span className="text-gray-500">Responsavel:</span> {ticket.assignee?.name || 'Nao atribuido'}
          </div>
        </div>

        {ticket.sla_deadline && (
          <div className="mt-4 p-3 bg-gray-50 rounded-md text-sm">
            <span className="text-gray-500">SLA:</span>{' '}
            {new Date(ticket.sla_deadline).toLocaleString('pt-BR')}
          </div>
        )}
      </div>

      {hasRole('technician') || hasRole('admin') ? (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="font-semibold mb-4">Acoes</h2>
          <div className="flex gap-4">
            <select
              value={ticket.status}
              onChange={(e) => statusMutation.mutate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="open">Aberto</option>
              <option value="in_progress">Em Andamento</option>
              <option value="waiting">Aguardando</option>
              <option value="resolved">Resolvido</option>
              <option value="closed">Fechado</option>
            </select>
            <select
              value={ticket.priority}
              onChange={(e) => priorityMutation.mutate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="low">Baixa</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="critical">Critica</option>
            </select>
          </div>
        </div>
      ) : null}

      {ticket.status !== 'closed' && (
        <div className="flex justify-end mb-6">
          <button
            onClick={() => closeMutation.mutate()}
            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
          >
            Fechar Chamado
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-4">Comentarios</h2>
        <div className="space-y-4 mb-4">
          {comments?.map((c: any) => (
            <div key={c.id} className={`p-3 rounded-md ${c.is_internal ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
              <div className="flex justify-between text-sm">
                <span className="font-medium">{c.user?.name}</span>
                <span className="text-gray-500">{new Date(c.created_at).toLocaleString('pt-BR')}</span>
              </div>
              <p className="mt-1 text-gray-700">{c.message}</p>
              {c.is_internal && (
                <span className="text-xs text-yellow-600">Comentario interno</span>
              )}
            </div>
          ))}
        </div>

        <div className="border-t pt-4">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Adicionar comentario..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2"
          />
          <div className="flex justify-between items-center">
            {(hasRole('technician') || hasRole('admin')) && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                />
                <span className="text-sm text-gray-600">Comentario interno</span>
              </label>
            )}
            <button
              onClick={() => commentMutation.mutate()}
              disabled={!comment.trim() || commentMutation.isPending}
              className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="font-semibold mb-4">Historico</h2>
        <div className="space-y-3">
          {history?.map((h: any) => (
            <div key={h.id} className="flex items-start gap-3 text-sm">
              <div className="w-2 h-2 bg-primary-500 rounded-full mt-2"></div>
              <div>
                <p className="text-gray-700">
                  <span className="font-medium">{h.user_name}</span>{' '}
                  {h.description || h.action}
                  {h.old_value && h.new_value && (
                    <span className="text-gray-500"> ({h.old_value} → {h.new_value})</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(h.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
