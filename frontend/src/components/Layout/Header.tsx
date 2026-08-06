import { useAuth } from '../../contexts/AuthContext';
import { useState, useEffect } from 'react';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  technician: 'Tecnico',
  employee: 'Colaborador',
};

const roleColors: Record<string, string> = {
  admin: 'text-rose-500',
  technician: 'text-primary-500',
  employee: 'text-slate-500',
};

export default function Header() {
  const { user, logout } = useAuth();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (d: Date) => {
    const days = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const dayName = days[d.getDay()];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${dayName}., ${day} de ${month}. de ${year} | ${time}`;
  };

  return (
    <header className="bg-white/50 backdrop-blur-xl border-b border-white/50 sticky top-0 z-30">
      <div className="flex justify-between items-center px-6 py-3">
        {/* Date/Time */}
        <div className="text-sm text-slate-400 font-medium">
          {formatDate(now)}
        </div>

        {/* User Widget */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-bold text-slate-700">{user?.name}</p>
            <p className={`text-[11px] font-semibold ${roleColors[user?.role || 'employee']}`}>
              {roleLabels[user?.role || 'employee']}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <button
            onClick={logout}
            className="ml-2 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
            title="Sair"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
