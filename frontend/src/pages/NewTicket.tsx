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
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    sector_id: '',
    category: '',
    priority: 'medium',
  });

  const MAX_FILE_SIZE = 50 * 1024 * 1024;

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    if (selected.length === 0) return;
    const oversized = selected.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      addToast('error', 'Alguns arquivos excedem o limite de 50MB e foram ignorados.');
    }
    const ok = selected.filter((f) => f.size <= MAX_FILE_SIZE);
    setFiles((prev) => [...prev, ...ok]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ ...form, files });
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

        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-600 mb-2">
            Anexos
          </label>
          <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-surface-200 rounded-lg px-4 py-6 cursor-pointer hover:border-primary-400 hover:bg-primary-50/50 transition-all">
            <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-slate-500 font-medium">Clique para anexar arquivos (max 50MB cada)</p>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 bg-slate-50 border border-surface-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-slate-600 truncate flex-1">{file.name}</span>
                  <span className="text-[11px] text-slate-400 flex-shrink-0">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                    aria-label={`Remover ${file.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
