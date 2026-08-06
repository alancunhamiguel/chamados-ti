import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { createTicket } from '../api/tickets';
import { getSectors } from '../api/sectors';
import { useToast } from '../contexts/ToastContext';

const categoryLabels: Record<string, string> = {
  hardware: 'Hardware',
  software: 'Software',
  network: 'Rede',
  access: 'Acesso',
  other: 'Outro',
};

const priorityLabels: Record<string, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
  critical: 'Critica',
};

const priorityColors: Record<string, string> = {
  low: 'bg-slate-50 text-slate-600 border-slate-200',
  medium: 'bg-blue-50 text-blue-600 border-blue-200',
  high: 'bg-orange-50 text-orange-600 border-orange-200',
  critical: 'bg-red-50 text-red-600 border-red-200',
};

export default function NewTicket() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    sector_id: '',
    category: '',
    priority: 'medium',
  });

  useEffect(() => {
    getSectors().then(setSectors).catch(() => {});
  }, []);

  const mutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (data) => {
      addToast('success', 'Chamado criado com sucesso!');
      navigate(`/tickets/${data.id}`);
    },
    onError: () => {
      addToast('error', 'Erro ao criar chamado. Tente novamente.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Novo Chamado</h1>
        <p className="text-sm text-slate-400 mt-1">Preencha os dados para abrir um novo chamado</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-card p-6">
        <div className="mb-5">
          <label className="block text-sm font-semibold text-slate-600 mb-1.5">
            Titulo *
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            placeholder="Descreva brevemente o problema"
            required
          />
        </div>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-slate-600 mb-1.5">
            Descricao *
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={5}
            className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all resize-none"
            placeholder="Detalhe o problema com mais informacoes..."
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1.5">
              Setor *
            </label>
            <select
              value={form.sector_id}
              onChange={(e) => setForm({ ...form, sector_id: e.target.value })}
              className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">Selecione o setor</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1.5">
              Categoria
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Selecione</option>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-600 mb-2">
            Prioridade
          </label>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(priorityLabels).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm({ ...form, priority: key })}
                className={`px-3 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                  form.priority === key
                    ? priorityColors[key] + ' border-current shadow-sm'
                    : 'bg-white text-slate-400 border-surface-200 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-primary-500 text-white px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-primary-600 disabled:opacity-50 transition-all shadow-sm"
          >
            {mutation.isPending ? 'Criando...' : 'Criar Chamado'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/tickets')}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition-all border border-surface-200"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
