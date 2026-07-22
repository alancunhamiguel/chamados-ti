import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function Sidebar() {
  const location = useLocation();
  const { user, hasRole } = useAuth();

  const navItems = [
    { path: '/tickets', label: 'Chamados', show: true },
    { path: '/tickets/new', label: 'Novo Chamado', show: true },
    { path: '/dashboard', label: 'Dashboard', show: hasRole('admin') },
    { path: '/admin', label: 'Admin', show: hasRole('admin') },
  ];

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-primary-700 text-white">
      <div className="p-4">
        <h1 className="text-xl font-bold">Chamados TI</h1>
      </div>
      <nav className="mt-4">
        {navItems
          .filter((item) => item.show)
          .map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-4 py-3 hover:bg-primary-600 ${
                location.pathname === item.path ? 'bg-primary-800' : ''
              }`}
            >
              {item.label}
            </Link>
          ))}
      </nav>
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-primary-600">
        <p className="text-sm text-primary-200">{user?.name}</p>
        <p className="text-xs text-primary-300">{user?.role}</p>
      </div>
    </div>
  );
}
