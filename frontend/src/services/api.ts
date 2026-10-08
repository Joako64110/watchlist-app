import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

export async function checkServerHealth() {
  const response = await api.get('/');
  return response.data;
}

export async function getTrendingPosters(limit = 60): Promise<string[]> {
  const response = await api.get('/trending', { params: { limit } });
  return response.data;
}

export async function loginUser(email: string, password: string) {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
}