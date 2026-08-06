import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getTickets } from '../api/tickets';
import { TicketStatus, TicketPriority, Ticket } from '../types';
import { useAuth } from '../contexts/AuthContext';

const statusLabels: Record<TicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em Andamento',
  waiting: 'Aguardando',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

const priorityLabels: Record<TicketPriority, string> = {
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

const statusBadgeColors: Record<TicketStatus, string> = {
  open: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-50 text-blue-600',
  waiting: 'bg-amber-50 text-amber-600',
  resolved: 'bg-emerald-50 text-emerald-600',
  closed: 'bg-slate-100 text-slate-500',
};

const priorityBadgeColors: Record<TicketPriority, string> = {
  low: 'bg-slate-50 text-slate-500',
  medium: 'bg-blue-50 text-blue-600',
  high: 'bg-orange-50 text-orange-600',
  critical: 'bg-red-50 text-red-600',
};

function getSlaBadge(slaDeadline: string | undefined, status: string): { color: string; icon: string } | null {
  if (!slaDeadline || status === 'closed' || status === 'resolved') return null;
  const now = new Date();
  const deadline = new Date(slaDeadline);
  const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursLeft < 0) return { color: 'bg-red-50 text-red-600 border-red-200', icon: '!' };
  if (hoursLeft < 4) return { color: 'bg-red-50 text-red-600 border-red-200', icon: '!' };
  if (hoursLeft < 8) return { color: 'bg-amber-50 text-amber-600 border-amber-200', icon: '~' };
  return null;
}

function getRowColor(status: TicketStatus, priority: TicketPriority): string {
  if (status === 'resolved') return 'hover:bg-emerald-50/50';
  if (status === 'in_progress') return 'hover:bg-blue-50/50';
  if (status === 'waiting') return 'hover:bg-amber-50/50';
  if (priority === 'critical') return 'hover:bg-red-50/50';
  if (priority === 'high') return 'hover:bg-orange-50/50';
  return 'hover:bg-slate-50';
}

function TicketTable({ tickets, colSpan }: { tickets: Ticket[]; colSpan: number }) {
  const { hasRole } = useAuth();
  if (tickets.length === 0) {
    return (
      <tr>
        <td colSpan={colSpan} className="text-center py-12 text-slate-400 text-sm">
          Nenhum chamado encontrado
        </td>
      </tr>
    );
  }
  return tickets.map((ticket: Ticket) => {
    const slaBadge = getSlaBadge(ticket.sla_deadline, ticket.status);
    return (
      <tr
        key={ticket.id}
        className={`border-b border-surface-200/60 transition-colors cursor-pointer ${getRowColor(ticket.status, ticket.priority)}`}
      >
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Link to={`/tickets/${ticket.id}`} className="text-primary-500 hover:text-primary-600 font-semibold text-sm">
              #{ticket.ticket_number}
            </Link>
            {slaBadge && (
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${slaBadge.color}`}>
                {slaBadge.icon}
              </span>
            )}
          </div>
        </td>
        <td className="px-5 py-3.5">
          <Link to={`/tickets/${ticket.id}`} className="hover:text-primary-500 font-medium text-sm text-slate-700">
            {ticket.title}
          </Link>
        </td>
        <td className="px-5 py-3.5 text-sm text-slate-500">{ticket.sector?.name || '-'}</td>
        <td className="px-5 py-3.5 text-sm text-slate-500">{categoryLabels[ticket.category || ''] || '-'}</td>
        {(hasRole('technician') || hasRole('admin')) && (
          <td className="px-5 py-3.5">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityBadgeColors[ticket.priority]}`}>
              {priorityLabels[ticket.priority]}
            </span>
          </td>
        )}
        <td className="px-5 py-3.5">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadgeColors[ticket.status]}`}>
            {statusLabels[ticket.status]}
          </span>
        </td>
        <td className="px-5 py-3.5 text-sm text-slate-500">{ticket.creator?.name || '-'}</td>
        <td className="px-5 py-3.5 text-sm text-slate-400">
          {new Date(ticket.created_at).toLocaleDateString('pt-BR')}
        </td>
      </tr>
    );
  });
}

export default function TicketListPage() {
  const { hasRole } = useAuth();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', filters, search, page],
    queryFn: () => getTickets({ ...filters, search, page, per_page: 15 }),
    refetchInterval: 10000,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setFilters((prev) => ({ ...prev, search }));
  };

  const allTickets = data?.tickets || [];
  const totalPages = data?.pages || 1;
  const total = data?.total || 0;
  const activeTickets = allTickets.filter((t: any) => t.status !== 'closed');
  const closedTickets = allTickets.filter((t: any) => t.status === 'closed');
  const colSpan = hasRole('technician') || hasRole('admin') ? 8 : 7;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Chamados</h1>
          <p className="text-sm text-slate-400 mt-0.5">{total} chamado{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</p>
        </div>
        <Link
          to="/tickets/new"
          className="bg-primary-500 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-primary-600 transition-all shadow-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Chamado
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-card shadow-card p-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar chamados..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <select
            value={filters.status || ''}
            onChange={(e) => { setFilters((prev) => ({ ...prev, status: e.target.value })); setPage(1); }}
            className="px-3 py-2.5 border border-surface-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todos os Status</option>
            <option value="open">Aberto</option>
            <option value="in_progress">Em Andamento</option>
            <option value="waiting">Aguardando</option>
            <option value="resolved">Resolvido</option>
            <option value="closed">Fechado</option>
          </select>
          <select
            value={filters.priority || ''}
            onChange={(e) => { setFilters((prev) => ({ ...prev, priority: e.target.value })); setPage(1); }}
            className="px-3 py-2.5 border border-surface-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todas Prioridades</option>
            <option value="critical">Critica</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baixa</option>
          </select>
        </form>
      </div>

      {/* Active Tickets */}
      <div className="bg-white rounded-card shadow-card overflow-hidden mb-6">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-200">
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">#</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Titulo</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Setor</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Categoria</th>
              {(hasRole('technician') || hasRole('admin')) && (
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Prioridade</th>
              )}
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Criado por</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Data</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={colSpan} className="text-center py-12 text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                    Carregando...
                  </div>
                </td>
              </tr>
            ) : (
              <TicketTable tickets={activeTickets} colSpan={colSpan} />
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-slate-400">
            Pagina {page} de {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-surface-200 transition-all"
            >
              Anterior
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${
                    page === pageNum
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 border border-surface-200'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-surface-200 transition-all"
            >
              Proximo
            </button>
          </div>
        </div>
      )}

      {/* Closed Tickets */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <button
          onClick={() => setShowClosed(!showClosed)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-600">Chamados Fechados</span>
            <span className="bg-slate-100 text-slate-500 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {closedTickets.length}
            </span>
          </div>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${showClosed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showClosed && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">#</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Titulo</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Setor</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Categoria</th>
                {(hasRole('technician') || hasRole('admin')) && (
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Prioridade</th>
                )}
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Criado por</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Data</th>
              </tr>
            </thead>
            <tbody>
              <TicketTable tickets={closedTickets} colSpan={colSpan} />
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
