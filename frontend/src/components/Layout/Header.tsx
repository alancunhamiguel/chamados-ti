import { useAuth } from '../../contexts/AuthContext';

export default function Header() {
  const { logout } = useAuth();

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="flex justify-between items-center px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Painel de Chamados</h2>
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 text-sm text-red-600 hover:text-red-800"
        >
          Sair
        </button>
      </div>
    </header>
  );
}
