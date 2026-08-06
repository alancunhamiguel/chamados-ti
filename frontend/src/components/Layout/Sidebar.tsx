import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import { useState, useEffect } from 'react';
import { getTeamStatus } from '../../api/users';
import { User } from '../../types';

const statusConfig: Record<string, { color: string; label: string }> = {
  disponivel: { color: 'bg-emerald-400', label: 'Disponivel' },
  ocupado: { color: 'bg-red-400', label: 'Ocupado' },
  em_atendimento: { color: 'bg-amber-400', label: 'Em atendimento' },
  offline: { color: 'bg-gray-300', label: 'Offline' },
};

const statusOptions = [
  { value: 'disponivel', label: 'Disponivel', color: 'bg-emerald-400' },
  { value: 'ocupado', label: 'Ocupado', color: 'bg-red-400' },
  { value: 'em_atendimento', label: 'Em atendimento', color: 'bg-amber-400' },
];

const navItems = [
  {
    path: '/tickets',
    label: 'Chamados',
    show: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    path: '/tickets/new',
    label: 'Novo Chamado',
    show: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    path: '/dashboard',
    label: 'Dashboard',
    show: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 12a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" />
      </svg>
    ),
  },
  {
    path: '/admin',
    label: 'Admin',
    show: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, hasRole, updateUserStatus } = useAuth();
  const { openChats, hasNewMessages } = useChat();
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [team, setTeam] = useState<User[]>([]);

  const isStaff = hasRole('admin') || hasRole('technician');
  const currentStatus = statusConfig[user?.online_status || 'offline'];

  const filteredNavItems = navItems.filter((item) => {
    if (item.path === '/dashboard' || item.path === '/admin') return isStaff;
    return true;
  });

  useEffect(() => {
    if (!isStaff) {
      const fetchTeam = () => getTeamStatus().then(setTeam).catch(() => {});
      fetchTeam();
      const interval = setInterval(fetchTeam, 5000);
      return () => clearInterval(interval);
    }
  }, [isStaff]);

  const handleChangeStatus = async (status: string) => {
    await updateUserStatus(status);
    setShowStatusMenu(false);
  };

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-white flex flex-col z-40" style={{ boxShadow: '12px 0 40px rgba(0, 0, 0, 0.12), 6px 0 20px rgba(0, 102, 255, 0.06), 1px 0 0 #E2E8F0' }}>
      {/* Logo */}
      <div className="px-5 py-5 flex items-center justify-center gap-2" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="leading-tight">
          <p className="font-bold text-slate-800 text-base" style={{ fontFamily: 'Inter, sans-serif' }}>Chamados TI</p>
          <p className="text-[10px] text-slate-400 font-medium">Helpdesk</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path === '/tickets' && location.pathname.startsWith('/tickets'));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary-50 text-primary-500 font-semibold shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
              style={isActive ? { border: '1.5px solid rgba(0, 102, 255, 0.15)', boxShadow: '0 1px 8px rgba(0, 102, 255, 0.08)' } : { border: '1.5px solid transparent' }}
            >
              <span className={isActive ? 'text-primary-500' : 'text-slate-400'}>
                {item.icon}
              </span>
              {item.label}
              {item.path === '/tickets' && hasNewMessages && openChats.length === 0 && (
                <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  !
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Team Status (employees only) */}
      {!isStaff && team.length > 0 && (
        <div className="px-4 py-3 border-t border-surface-200">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Equipe TI</p>
          <div className="space-y-1.5">
            {team.map((member) => {
              const st = statusConfig[member.online_status || 'offline'];
              return (
                <div key={member.id} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st?.color || 'bg-gray-300'}`}></span>
                  <span className="text-xs text-slate-500 truncate flex-1">{member.name}</span>
                  <span className="text-[10px] text-slate-400">{st?.label || 'Offline'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* User Card */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid #F1F5F9' }}>
        <div className="relative">
          {isStaff ? (
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{user?.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${currentStatus?.color || 'bg-gray-300'}`}></span>
                  <p className="text-[11px] text-slate-400">{currentStatus?.label || 'Offline'}</p>
                </div>
              </div>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${showStatusMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{user?.name}</p>
                <p className="text-[11px] text-slate-400 capitalize">{user?.role}</p>
              </div>
            </div>
          )}

          {/* Status Dropdown */}
          {showStatusMenu && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-lg border border-surface-200 overflow-hidden z-50">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleChangeStatus(opt.value)}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2.5 transition-colors ${
                    user?.online_status === opt.value ? 'bg-primary-50 text-primary-600 font-medium' : 'text-slate-600'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${opt.color}`}></span>
                  {opt.label}
                  {user?.online_status === opt.value && (
                    <svg className="w-4 h-4 ml-auto text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
