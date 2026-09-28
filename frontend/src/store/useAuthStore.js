import { create } from 'zustand';
import { api, setAccessToken } from '../lib/api';

/**
 * Zustand Authentication Store - Hybrid Security Model
 * 
 * WHY:
 * 1. Tokens in memory: Access tokens are stored in active runtime memory only, never in browser storage.
 * 2. Registration requires verified email OTP via Resend.
 * 3. Login is direct Email + Password (cost factor 12 bcrypt) with timing-attack prevention.
 */
export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  initSession: async () => {
    try {
      set({ isLoading: true, error: null });
      const { data } = await api.post('/auth/refresh');
      setAccessToken(data.accessToken);
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      // User has no active cookie session or token was expired/revoked
      setAccessToken(null);
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  sendOtp: async (email) => {
    try {
      set({ error: null });
      const { data } = await api.post('/auth/send-otp', { email });
      return { success: true, message: data.message };
    } catch (err) {
      const message =
        err.response?.data?.message || 'Failed to send verification code. Please try again.';
      set({ error: message });
      return { success: false, message };
    }
  },

  signup: async (name, email, password, otp) => {
    try {
      set({ error: null });
      const { data } = await api.post('/auth/signup', { name, email, password, otp });
      setAccessToken(data.accessToken);
      set({
        user: data.user,
        isAuthenticated: true,
      });
      return { success: true };
    } catch (err) {
      const message =
        err.response?.data?.message || 'Verification failed. Please check your OTP code.';
      set({ error: message });
      return { success: false, message };
    }
  },

  login: async (email, password) => {
    try {
      set({ error: null });
      const { data } = await api.post('/auth/login', { email, password });
      setAccessToken(data.accessToken);
      set({
        user: data.user,
        isAuthenticated: true,
      });
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Invalid email or password.';
      set({ error: message });
      return { success: false, message };
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Logout API error:', err);
    } finally {
      setAccessToken(null);
      set({
        user: null,
        isAuthenticated: false,
        error: null,
      });
    }
  },
}));

// Listen for global session expiration event emitted by Axios interceptor
window.addEventListener('docvault:session_expired', () => {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
  });
});
