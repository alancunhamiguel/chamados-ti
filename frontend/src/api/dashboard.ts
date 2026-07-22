import api from './client';

export const getDashboardStats = async () => {
  const response = await api.get('/dashboard/stats');
  return response.data;
};

export const getByStatus = async () => {
  const response = await api.get('/dashboard/by-status');
  return response.data;
};

export const getByPriority = async () => {
  const response = await api.get('/dashboard/by-priority');
  return response.data;
};

export const getBySector = async () => {
  const response = await api.get('/dashboard/by-sector');
  return response.data;
};

export const getByTechnician = async () => {
  const response = await api.get('/dashboard/by-technician');
  return response.data;
};

export const getSlaCompliance = async () => {
  const response = await api.get('/dashboard/sla-compliance');
  return response.data;
};
