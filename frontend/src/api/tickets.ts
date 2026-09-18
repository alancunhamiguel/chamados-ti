import api from './client';

export const getTickets = async (params?: Record<string, string | number>) => {
  const response = await api.get('/tickets', { params });
  return response.data;
};

export const getTicket = async (id: string) => {
  const response = await api.get(`/tickets/${id}`);
  return response.data;
};

export const createTicket = async (data: {
  title: string;
  description: string;
  sector_id: string;
  category?: string;
  priority?: string;
  files?: File[];
}) => {
  const formData = new FormData();
  formData.append('title', data.title);
  formData.append('description', data.description);
  formData.append('sector_id', data.sector_id);
  if (data.category) formData.append('category', data.category);
  if (data.priority) formData.append('priority', data.priority);
  (data.files || []).forEach((file) => formData.append('files', file));
  const response = await api.post('/tickets', formData);
  return response.data;
};

export const updateTicketStatus = async (id: string, status: string) => {
  const response = await api.put(`/tickets/${id}/status`, { status });
  return response.data;
};

export const updateTicketPriority = async (id: string, priority: string) => {
  const response = await api.put(`/tickets/${id}/priority`, { priority });
  return response.data;
};

export const assignTicket = async (id: string, assigned_to: string) => {
  const response = await api.put(`/tickets/${id}/assign`, { assigned_to });
  return response.data;
};
