import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { getDashboardStats, getByStatus, getByPriority, getBySector, getByTechnician, getSlaCompliance } from '../api/dashboard';

const COLORS = ['#0066FF', '#F59E0B', '#10B981', '#EF4444', '#94A3B8'];

const statusPT: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em Andamento',
  waiting: 'Aguardando',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

const priorityPT: Record<string, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
  critical: 'Critica',
};

const formatDuration = (hours: number | null | undefined): string => {
  if (hours == null) return '-';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  return `${h}h ${String(min).padStart(2, '0')}min`;
};

export default function Dashboard() {
  const { data: stats } = useQuery({ queryKey: ['dashboard-stats'], queryFn: getDashboardStats });
  const { data: statusData } = useQuery({ queryKey: ['dashboard-status'], queryFn: getByStatus });
  const { data: priorityData } = useQuery({ queryKey: ['dashboard-priority'], queryFn: getByPriority });
  const { data: sectorData } = useQuery({ queryKey: ['dashboard-sector'], queryFn: getBySector });
  const { data: techData } = useQuery({ queryKey: ['dashboard-tech'], queryFn: getByTechnician });
  const { data: slaData } = useQuery({ queryKey: ['dashboard-sla'], queryFn: getSlaCompliance });

  const translatedStatus = (statusData || []).map((d: any) => ({ ...d, status: statusPT[d.status] || d.status }));
  const translatedPriority = (priorityData || []).map((d: any) => ({ ...d, priority: priorityPT[d.priority] || d.priority }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Visao geral do sistema de chamados</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-6 gap-4 mb-8">
        <div className="bg-white rounded-card shadow-card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats?.total_tickets || 0}</p>
          <p className="text-xs text-slate-400 font-medium mt-1">Total</p>
        </div>
        <div className="bg-white rounded-card shadow-card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-bold text-primary-500">{stats?.open_tickets || 0}</p>
          <p className="text-xs text-slate-400 font-medium mt-1">Abertos</p>
        </div>
        <div className="bg-white rounded-card shadow-card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-500">{stats?.in_progress_tickets || 0}</p>
          <p className="text-xs text-slate-400 font-medium mt-1">Em Andamento</p>
        </div>
        <div className="bg-white rounded-card shadow-card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-500">{stats?.resolved_tickets || 0}</p>
          <p className="text-xs text-slate-400 font-medium mt-1">Resolvidos</p>
        </div>
        <div className="bg-white rounded-card shadow-card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-500">
            {formatDuration(stats?.avg_resolution_hours)}
          </p>
          <p className="text-xs text-slate-400 font-medium mt-1">Tempo Medio</p>
        </div>
        <div className="bg-white rounded-card shadow-card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-bold text-red-500">{stats?.sla_breach_count || 0}</p>
          <p className="text-xs text-slate-400 font-medium mt-1">Violacoes SLA</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-card shadow-card p-5">
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Por Status</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={translatedStatus}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="status" tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
              />
              <Bar dataKey="count" fill="#0066FF" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-card shadow-card p-5">
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Por Prioridade</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={translatedPriority}
                cx="50%"
                cy="50%"
                outerRadius={90}
                dataKey="count"
                nameKey="priority"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {(translatedPriority || []).map((_: unknown, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-card shadow-card p-5">
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Por Departamento</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={sectorData || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis dataKey="sector_name" type="category" width={100} tick={{ fontSize: 12, fill: '#64748B' }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
              />
              <Bar dataKey="count" fill="#10B981" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tech Table + SLA */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-card shadow-card p-5">
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Por Tecnico</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tecnico</th>
                <th className="text-right py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Chamados</th>
              </tr>
            </thead>
            <tbody>
              {(techData || []).map((tech: { technician_name: string; count: number }) => (
                <tr key={tech.technician_name} className="border-b border-surface-200/60">
                  <td className="py-2.5 text-sm text-slate-600 font-medium">{tech.technician_name}</td>
                  <td className="text-right py-2.5">
                    <span className="bg-primary-50 text-primary-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                      {tech.count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-card shadow-card p-5">
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">SLA</h3>
          <div className="text-center py-4">
            <p className="text-5xl font-bold text-emerald-500">
              {slaData?.percentage || 0}%
            </p>
            <p className="text-sm text-slate-400 mt-3">
              {slaData?.compliant || 0} de {slaData?.total_with_sla || 0} dentro do prazo
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
