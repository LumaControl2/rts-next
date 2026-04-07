'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';

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
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem('rts_token');
    const u = localStorage.getItem('rts_user');
    if (t && u) {
      try {
        setToken(t);
        tokenRef.current = t;
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

  const logout = useCallback(() => {
    localStorage.removeItem('rts_token');
    localStorage.removeItem('rts_user');
    router.push('/');
  }, [router]);

  const authFetch = useCallback((url: string, options: RequestInit = {}) => {
    const t = tokenRef.current;
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...options.headers,
      },
    });
  }, []);

  // Keep ref in sync
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  return { user, token, loading, logout, authFetch };
}
