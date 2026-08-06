import api from './client';

export const getTeamStatus = async () => {
  const response = await api.get('/users/team-status');
  return response.data;
};
