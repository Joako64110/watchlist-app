import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

export async function checkServerHealth() {
  const response = await api.get('/');
  return response.data;
}