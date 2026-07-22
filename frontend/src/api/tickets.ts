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
}) => {
  const response = await api.post('/tickets', data);
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

export const closeTicket = async (id: string) => {
  const response = await api.put(`/tickets/${id}/close`);
  return response.data;
};
