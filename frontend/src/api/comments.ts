import api from './client';

export const getComments = async (ticketId: string) => {
  const response = await api.get(`/tickets/${ticketId}/comments`);
  return response.data;
};

export const addComment = async (ticketId: string, data: { message: string; is_internal?: boolean }) => {
  const response = await api.post(`/tickets/${ticketId}/comments`, data);
  return response.data;
};

export const getHistory = async (ticketId: string) => {
  const response = await api.get(`/tickets/${ticketId}/history`);
  return response.data;
};
