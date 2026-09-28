import React from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-4 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#FF3B5C]">
        <KeyRound className="w-7 h-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-4xl font-bold font-mono text-white">404</h1>
        <p className="text-sm font-semibold text-zinc-300">Vault Resource Not Found</p>
        <p className="text-xs text-zinc-500 max-w-xs mx-auto">
          The requested path does not exist or has been permanently decommissioned.
        </p>
      </div>
      <Link
        to="/app/documents"
        className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-200 transition inline-flex items-center gap-2"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Return to Vault</span>
      </Link>
    </div>
  );
}
