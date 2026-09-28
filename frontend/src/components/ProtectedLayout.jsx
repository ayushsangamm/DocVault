import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { Navbar } from './Navbar';
import { KeyRound } from 'lucide-react';
import { api } from '../lib/api';

export function ProtectedLayout() {
  const { isAuthenticated, isLoading, initSession } = useAuthStore();
  const [activeSharesCount, setActiveSharesCount] = useState(0);

  useEffect(() => {
    // Attempt silent session restoration on first load
    initSession();
  }, [initSession]);

  useEffect(() => {
    if (isAuthenticated) {
      // Fetch active shares count for top navigation badge
      api
        .get('/shares?status=active')
        .then(({ data }) => {
          setActiveSharesCount(data.shares?.length || 0);
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#FF3B5C] to-[#FF6B81] p-[2px] animate-pulse">
          <div className="w-full h-full bg-[#09090b] rounded-[14px] flex items-center justify-center">
            <KeyRound className="w-6 h-6 text-[#FF3B5C]" />
          </div>
        </div>
        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
          Authenticating Vault Session...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col selection:bg-[#FF3B5C]/30 antialiased">
      <Navbar activeSharesCount={activeSharesCount} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 sm:px-10 py-8">
        <Outlet context={{ refreshSharesCount: () => {
          api.get('/shares?status=active').then(({ data }) => setActiveSharesCount(data.shares?.length || 0)).catch(() => {});
        }}} />
      </main>
    </div>
  );
}
