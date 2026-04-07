'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface UsuarioOption {
  _id: string;
  nombre: string;
  rol: string;
  turno: string;
}

export default function LoginPage() {
  const router = useRouter();

  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [selectedNombre, setSelectedNombre] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(true);

  // Check if already logged in
  useEffect(() => {
    const token = localStorage.getItem('rts_token');
    const user = localStorage.getItem('rts_user');
    if (token && user) {
      router.push('/home');
    }
  }, [router]);

  // Fetch users for dropdown
  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch('/api/usuarios');
        if (res.ok) {
          const data = await res.json();
          setUsuarios(data);
        }
      } catch {
        // If API unavailable, users will see empty dropdown
      } finally {
        setFetchingUsers(false);
      }
    }
    loadUsers();
  }, []);

  const handleLogin = async () => {
    if (!selectedNombre) {
      setError('Seleccione un usuario');
      return;
    }
    if (pin.length !== 4) {
      setError('Ingrese un PIN de 4 digitos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: selectedNombre, pin }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        localStorage.setItem('rts_token', data.token);
        localStorage.setItem('rts_user', JSON.stringify(data.user));
        router.push('/home');
      } else {
        setError(data.error || 'Error al iniciar sesion');
        setPin('');
        setLoading(false);
      }
    } catch {
      setError('Error de conexion. Intente nuevamente.');
      setPin('');
      setLoading(false);
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + digit);
    }
  };

  const handleKeypadDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  // Auto-submit when PIN reaches 4 digits
  useEffect(() => {
    if (pin.length === 4 && selectedNombre && !loading) {
      handleLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  return (
    <div className="flex flex-col flex-1 items-center justify-center px-6 py-8 min-h-screen bg-navy">
      {/* Logo area */}
      <div className="text-center mb-10">
        <div className="mb-2">
          <span className="text-5xl font-bold text-white tracking-tight">RT</span>
          <span className="text-5xl font-bold text-cyan tracking-tight"> NEXT</span>
        </div>
        <p className="text-muted text-lg mt-2">Plataforma de Gestion Operativa</p>
        <div className="mt-4 px-4 py-2 rounded-full bg-navy-surface inline-block border border-navy-light">
          <p className="text-cyan text-sm font-medium">Lote I — Consorcio Panda Energy</p>
        </div>
      </div>

      {/* Login form */}
      <div className="w-full max-w-sm space-y-6">
        {/* User selector */}
        <div>
          <label className="block text-muted text-base mb-2 font-medium">Operador</label>
          <select
            value={selectedNombre}
            onChange={e => { setSelectedNombre(e.target.value); setError(''); }}
            disabled={fetchingUsers}
            className="w-full p-4 text-lg rounded-xl bg-navy-surface border border-navy-light text-text-primary min-h-[52px]"
          >
            <option value="">
              {fetchingUsers ? 'Cargando usuarios...' : 'Seleccione un usuario'}
            </option>
            {usuarios.map(u => (
              <option key={u._id} value={u.nombre}>
                {u.nombre} — {u.rol === 'operador' ? 'Operador' : 'Supervisor'}
              </option>
            ))}
          </select>
        </div>

        {/* PIN display */}
        <div>
          <label className="block text-muted text-base mb-2 font-medium">PIN de acceso</label>
          <div className="flex justify-center gap-3 mb-4">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={cn(
                  'w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold border-2 transition-all',
                  i < pin.length
                    ? 'border-cyan bg-navy-surface text-cyan'
                    : 'border-navy-light bg-navy-surface text-navy-light'
                )}
              >
                {i < pin.length ? '\u2022' : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'].map((key) => (
            <button
              key={key || 'empty'}
              onClick={() => {
                if (key === 'DEL') handleKeypadDelete();
                else if (key) handleKeypadPress(key);
              }}
              disabled={!key || loading}
              className={cn(
                'h-14 rounded-xl text-xl font-semibold transition-all active:scale-95 min-h-[48px]',
                !key && 'invisible',
                key === 'DEL'
                  ? 'bg-navy-surface text-muted hover:bg-navy-light border border-navy-light'
                  : 'bg-navy-surface text-text-primary hover:bg-navy-light active:bg-cyan active:text-navy border border-navy-light'
              )}
            >
              {key === 'DEL' ? '\u232B' : key}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-danger/20 border border-danger/40 rounded-xl p-3 text-center">
            <p className="text-danger text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={loading || !selectedNombre || pin.length !== 4}
          className={cn(
            'w-full py-4 rounded-xl text-lg font-bold transition-all active:scale-98 min-h-[52px]',
            loading || !selectedNombre || pin.length !== 4
              ? 'bg-navy-surface text-muted cursor-not-allowed border border-navy-light'
              : 'bg-cyan text-navy hover:bg-cyan-dark active:bg-cyan-dark'
          )}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              INGRESANDO...
            </span>
          ) : 'INGRESAR'}
        </button>
      </div>

      {/* Footer */}
      <div className="mt-10 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-muted text-sm">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span>Modo offline disponible</span>
        </div>
        <p className="text-navy-light text-xs mt-1">v1.0.0</p>
      </div>
    </div>
  );
}
