'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export interface AuthUser {
  id: string;
  nombre: string;
  rol: string;
  baterias: string[];
  turno: string;
}

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('rts_token');
    const u = localStorage.getItem('rts_user');
    if (t && u) {
      try {
        setToken(t);
        setUser(JSON.parse(u));
      } catch {
        localStorage.removeItem('rts_token');
        localStorage.removeItem('rts_user');
        router.push('/');
      }
    } else {
      router.push('/');
    }
    setLoading(false);
  }, [router]);

  const logout = () => {
    localStorage.removeItem('rts_token');
    localStorage.removeItem('rts_user');
    router.push('/');
  };

  const authFetch = (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  };

  return { user, token, loading, logout, authFetch };
}
