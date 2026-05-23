'use client';

import { useAuth } from '@/app/lib/auth/AuthContext';

export function LogoutButton() {
  const { signOut, loading } = useAuth();

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={loading}
      className="inline-flex h-10 items-center justify-center rounded-full border border-white/20 bg-white/5 px-5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
