import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import { getDashboardStats, getByStatus, getByPriority, getByTechnician, getSlaCompliance } from '../api/dashboard';

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#6b7280'];

export default function Dashboard() {
  const { data: stats } = useQuery({ queryKey: ['dashboard-stats'], queryFn: getDashboardStats });
  const { data: statusData } = useQuery({ queryKey: ['dashboard-status'], queryFn: getByStatus });
  const { data: priorityData } = useQuery({ queryKey: ['dashboard-priority'], queryFn: getByPriority });
  const { data: techData } = useQuery({ queryKey: ['dashboard-tech'], queryFn: getByTechnician });
  const { data: slaData } = useQuery({ queryKey: ['dashboard-sla'], queryFn: getSlaCompliance });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold">{stats?.total_tickets || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500">Abertos</p>
          <p className="text-2xl font-bold text-blue-600">{stats?.open_tickets || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500">Em Andamento</p>
          <p className="text-2xl font-bold text-yellow-600">{stats?.in_progress_tickets || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500">Resolvidos</p>
          <p className="text-2xl font-bold text-green-600">{stats?.resolved_tickets || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-4">Por Status</h3>
          <BarChart width={400} height={250} data={statusData || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="status" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" />
          </BarChart>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-4">Por Prioridade</h3>
          <PieChart width={400} height={250}>
            <Pie
              data={priorityData || []}
              cx={200}
              cy={125}
              outerRadius={100}
              dataKey="count"
              nameKey="priority"
              label
            >
              {(priorityData || []).map((_: unknown, index: number) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-4">Por Tecnico</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Tecnico</th>
                <th className="text-right py-2">Chamados</th>
              </tr>
            </thead>
            <tbody>
              {(techData || []).map((tech: { technician_name: string; count: number }) => (
                <tr key={tech.technician_name} className="border-b">
                  <td className="py-2">{tech.technician_name}</td>
                  <td className="text-right py-2">{tech.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-4">SLA</h3>
          <div className="text-center">
            <p className="text-4xl font-bold text-green-600">
              {slaData?.percentage || 0}%
            </p>
            <p className="text-sm text-gray-500 mt-2">
              {slaData?.compliant || 0} de {slaData?.total_with_sla || 0} dentro do prazo
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
