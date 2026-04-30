import axios from 'axios';
import { supabase } from './supabase';
import { isGuestSessionActive } from './guestSession';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  // Skip auth header for guest sessions
  if (isGuestSessionActive()) {
    console.log('Guest session active - skipping auth');
    return config;
  }

  try {
    // First check if we have a session
    let { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      // Try to refresh or get user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Force a session refresh
        const refreshResult = await supabase.auth.refreshSession();
        session = refreshResult.data.session;
      }
    }
    
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
      console.log('Auth token added to request');
    } else {
      console.log('No session found - no auth token');
    }
  } catch (err) {
    console.error('Auth interceptor error:', err);
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.config.url, response.status);
    return response;
  },
  async (error) => {
    console.error('API Error:', error.config?.url, error.response?.status, error.response?.data);
    if (error.response?.status === 401) {
      if (isGuestSessionActive()) {
        return Promise.reject(error);
      }

      try {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError && typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      } catch {
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
