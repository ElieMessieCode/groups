import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import type { User } from '../types/index.js';

interface AuthResponse {
  user: User;
  token?: string;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ user: User } | null>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return await api.get<{ user: User }>('/api/auth/me');
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 401) {
          localStorage.removeItem('token');
          return null;
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await api.post<AuthResponse>('/api/auth/login', credentials);
      if (res.token) {
        localStorage.setItem('token', res.token);
      }
      return res;
    },
    onSuccess: (res) => {
      queryClient.setQueryData(['auth', 'me'], { user: res.user });
    }
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await api.post<AuthResponse>('/api/auth/register', credentials);
      if (res.token) {
        localStorage.setItem('token', res.token);
      }
      return res;
    },
    onSuccess: (res) => {
      queryClient.setQueryData(['auth', 'me'], { user: res.user });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await api.post('/api/auth/logout');
      } finally {
        localStorage.removeItem('token');
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.clear();
    }
  });

  return {
    user: data?.user ?? null,
    isAuthenticated: !!data?.user,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
    logout: logoutMutation.mutateAsync
  };
}
