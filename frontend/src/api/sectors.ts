import api from './client';

export const getSectors = async () => {
  const response = await api.get('/sectors');
  return response.data;
};
