import api from './client';

export const getAttachments = async (ticketId: string) => {
  const response = await api.get(`/tickets/${ticketId}/attachments`);
  return response.data;
};

export const uploadAttachment = async (ticketId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/tickets/${ticketId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const deleteAttachment = async (ticketId: string, attachmentId: string) => {
  const response = await api.delete(`/tickets/${ticketId}/attachments/${attachmentId}`);
  return response.data;
};
