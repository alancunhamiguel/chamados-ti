import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../contexts/ToastContext';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  technician: 'Tecnico',
  employee: 'Colaborador',
};

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-purple-50 text-purple-600',
  technician: 'bg-blue-50 text-blue-600',
  employee: 'bg-slate-100 text-slate-600',
};

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'users' | 'sectors'>('users');
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: '', sector: '', is_active: true });
  const [editingSector, setEditingSector] = useState<any>(null);
  const [sectorForm, setSectorForm] = useState({ name: '', description: '' });
  const [showNewSector, setShowNewSector] = useState(false);
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users');
      return response.data;
    },
  });

  const { data: sectors, isLoading: sectorsLoading } = useQuery({
    queryKey: ['sectors-all'],
    queryFn: async () => {
      const response = await api.get('/sectors/all');
      return response.data;
    },
    enabled: activeTab === 'sectors',
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof editForm }) => {
      const response = await api.put(`/users/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
      addToast('success', 'Usuario atualizado!');
    },
    onError: () => addToast('error', 'Erro ao atualizar usuario.'),
  });

  const createSectorMutation = useMutation({
    mutationFn: async (data: typeof sectorForm) => {
      const response = await api.post('/sectors', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors-all'] });
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      setShowNewSector(false);
      setSectorForm({ name: '', description: '' });
      addToast('success', 'Setor criado!');
    },
    onError: () => addToast('error', 'Erro ao criar setor.'),
  });

  const updateSectorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof sectorForm }) => {
      const response = await api.put(`/sectors/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors-all'] });
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      setEditingSector(null);
      addToast('success', 'Setor atualizado!');
    },
    onError: () => addToast('error', 'Erro ao atualizar setor.'),
  });

  const deactivateSectorMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/sectors/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors-all'] });
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      addToast('success', 'Setor desativado!');
    },
    onError: () => addToast('error', 'Erro ao desativar setor.'),
  });

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
      sector: user.sector,
      is_active: user.is_active,
    });
  };

  const handleSave = () => {
    if (editForm.name.trim() && editForm.email.trim() && editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: editForm });
    }
  };

  const setField = (field: string, value: any) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Painel Administrativo</h1>
        <p className="text-sm text-slate-400 mt-1">Gerencie usuarios e configuracoes do sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'users'
              ? 'bg-primary-500 text-white shadow-sm'
              : 'bg-white text-slate-500 hover:bg-slate-50 border border-surface-200'
          }`}
        >
          Usuarios
        </button>
        <button
          onClick={() => setActiveTab('sectors')}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'sectors'
              ? 'bg-primary-500 text-white shadow-sm'
              : 'bg-white text-slate-500 hover:bg-slate-50 border border-surface-200'
          }`}
        >
          Setores
        </button>
      </div>

      {/* Users Table */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Nome</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Setor</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                      Carregando...
                    </div>
                  </td>
                </tr>
              ) : (
                users?.map((user: any) => (
                  <tr key={user.id} className="border-b border-surface-200/60 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-sm text-slate-700">{user.name}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-500">{user.email}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleBadgeColors[user.role] || 'bg-slate-100 text-slate-600'}`}>
                        {roleLabels[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-500">{user.sector}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                      }`}>
                        {user.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-primary-500 hover:text-primary-600 text-sm font-semibold hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-all"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sectors Tab */}
      {activeTab === 'sectors' && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => { setShowNewSector(true); setSectorForm({ name: '', description: '' }); }}
              className="bg-primary-500 text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-primary-600 transition-all shadow-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Novo Setor
            </button>
          </div>

          <div className="bg-white rounded-card shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Nome</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Descricao</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {sectorsLoading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                        Carregando...
                      </div>
                    </td>
                  </tr>
                ) : sectors?.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-slate-400 text-sm">
                      Nenhum setor encontrado
                    </td>
                  </tr>
                ) : (
                  sectors?.map((sector: any) => (
                    <tr key={sector.id} className="border-b border-surface-200/60 hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-sm text-slate-700">{sector.name}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-500">{sector.description || '-'}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          sector.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {sector.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingSector(sector);
                              setSectorForm({ name: sector.name, description: sector.description || '' });
                            }}
                            className="text-primary-500 hover:text-primary-600 text-sm font-semibold hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-all"
                          >
                            Editar
                          </button>
                          {sector.is_active && (
                            <button
                              onClick={() => {
                                if (confirm(`Desativar setor "${sector.name}"?`)) {
                                  deactivateSectorMutation.mutate(sector.id);
                                }
                              }}
                              className="text-red-500 hover:text-red-600 text-sm font-semibold hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all"
                            >
                              Desativar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-card shadow-xl p-6 w-[480px]">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Editar Usuario</h2>
            <p className="text-sm text-slate-400 mb-5">{editingUser.email}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Nome</label>
                <input type="text" value={editForm.name} onChange={(e) => setField('name', e.target.value)}
                  className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                <input type="email" value={editForm.email} onChange={(e) => setField('email', e.target.value)}
                  className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
                <select value={editForm.role} onChange={(e) => setField('role', e.target.value)}
                  className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white">
                  <option value="employee">Colaborador</option>
                  <option value="technician">Tecnico</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Setor</label>
                <input type="text" value={editForm.sector} onChange={(e) => setField('sector', e.target.value)}
                  className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                <select value={editForm.is_active ? 'active' : 'inactive'} onChange={(e) => setField('is_active', e.target.value === 'active')}
                  className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white">
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setEditingUser(null)}
                className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-all border border-surface-200">
                Cancelar
              </button>
              <button onClick={handleSave}
                disabled={!editForm.name.trim() || !editForm.email.trim() || updateMutation.isPending}
                className="px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all shadow-sm">
                {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New/Edit Sector Modal */}
      {(showNewSector || editingSector) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-card shadow-xl p-6 w-96">
            <h2 className="text-lg font-bold text-slate-800 mb-1">
              {editingSector ? 'Editar Setor' : 'Novo Setor'}
            </h2>
            <p className="text-sm text-slate-400 mb-5">
              {editingSector ? editingSector.name : 'Preencha os dados do novo setor'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Nome *</label>
                <input type="text" value={sectorForm.name} onChange={(e) => setSectorForm({ ...sectorForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Nome do setor" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Descricao</label>
                <textarea value={sectorForm.description} onChange={(e) => setSectorForm({ ...sectorForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  placeholder="Descricao opcional" />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => { setShowNewSector(false); setEditingSector(null); }}
                className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-all border border-surface-200">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!sectorForm.name.trim()) return;
                  if (editingSector) {
                    updateSectorMutation.mutate({ id: editingSector.id, data: sectorForm });
                  } else {
                    createSectorMutation.mutate(sectorForm);
                  }
                }}
                disabled={!sectorForm.name.trim() || createSectorMutation.isPending || updateSectorMutation.isPending}
                className="px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all shadow-sm">
                {(createSectorMutation.isPending || updateSectorMutation.isPending) ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
