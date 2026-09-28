import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Eye,
  Download,
  AlertTriangle,
  XOctagon,
  Clock,
  Layers,
  FileText,
  Activity,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

export function AnalyticsPage() {
  const { addToast } = useToast();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/analytics/summary');
        setSummary(data.summary);
      } catch (err) {
        addToast('Failed to load telemetry analytics', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-48 bg-zinc-800 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-[#121214] rounded-2xl border border-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center py-12 text-zinc-500">
        No operational metrics available yet.
      </div>
    );
  }

  // Format denied reasons for BarChart
  const deniedData = [
    { reason: 'Expired', count: summary.deniedReasons?.access_denied_expired || 0 },
    { reason: 'Revoked', count: summary.deniedReasons?.access_denied_revoked || 0 },
    { reason: 'Max Views', count: summary.deniedReasons?.access_denied_max_views || 0 },
    { reason: 'Device Lock', count: summary.deniedReasons?.access_denied_different_device || 0 },
    { reason: 'Download Blocked', count: summary.deniedReasons?.download_blocked || 0 },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Top Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          Security & Access Telemetry
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Real-time metrics computed directly from database records. No synthetic values.
        </p>
      </div>

      {/* 4 Primary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Total Documents */}
        <div className="bg-[#121214] rounded-2xl border border-zinc-800/80 p-5 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Vaulted Documents</span>
            <FileText className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {summary.totalDocuments}
          </div>
          <p className="text-[11px] text-zinc-500">Authenticated storage files</p>
        </div>

        {/* Active Shares */}
        <div className="bg-[#121214] rounded-2xl border border-zinc-800/80 p-5 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Active Grants</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {summary.activeShares}
          </div>
          <p className="text-[11px] text-zinc-500">
            {summary.sharesExpiringWithin24h} expiring within 24 hours
          </p>
        </div>

        {/* Revocation Rate */}
        <div className="bg-[#121214] rounded-2xl border border-zinc-800/80 p-5 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Revocation Kill Rate</span>
            <XOctagon className="w-4 h-4 text-[#FF3B5C]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#FF3B5C]">
            {summary.revocationRate}
          </div>
          <p className="text-[11px] text-zinc-500">
            {summary.revokedShares} grants permanently invalidated
          </p>
        </div>

        {/* Blocked / Denied Attempts */}
        <div className="bg-[#121214] rounded-2xl border border-zinc-800/80 p-5 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Blocked Attempts</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {summary.blockedAttempts}
          </div>
          <p className="text-[11px] text-zinc-500">Enforced by zero-trust checks</p>
        </div>

      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Views Per Day */}
        <div className="bg-[#121214] rounded-2xl border border-zinc-800/80 p-6 shadow-xl space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">
              14-Day View Activity
            </h3>
            <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
              Daily verified recipient viewing interactions
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.viewsPerDay}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF3B5C" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#FF3B5C" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="date"
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(val) => val.slice(5)}
                />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: '#27272a',
                    borderRadius: '0.75rem',
                    fontSize: '11px',
                    color: '#f4f4f5',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  stroke="#FF3B5C"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorViews)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Denied Reasons Breakdown */}
        <div className="bg-[#121214] rounded-2xl border border-zinc-800/80 p-6 shadow-xl space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Policy Denial Categorization
            </h3>
            <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
              Security barrier enforcement telemetry
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deniedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="reason" stroke="#71717a" fontSize={10} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: '#27272a',
                    borderRadius: '0.75rem',
                    fontSize: '11px',
                    color: '#f4f4f5',
                  }}
                />
                <Bar dataKey="count" fill="#E02345" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Top Viewed Documents */}
      <div className="bg-[#121214] rounded-2xl border border-zinc-800/80 p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-semibold text-white tracking-tight">Top Accessed Documents</h3>

        {summary.topDocuments?.length > 0 ? (
          <div className="divide-y divide-zinc-800/60">
            {summary.topDocuments.map((item, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-zinc-500 text-[11px] w-4">#{idx + 1}</span>
                  <div>
                    <span className="font-semibold text-white block">{item.title}</span>
                    <span className="font-mono text-[10px] text-zinc-500 uppercase">
                      {item.fileType}
                    </span>
                  </div>
                </div>
                <div className="font-mono text-zinc-300">
                  <strong className="text-white">{item.viewCount}</strong> verified view{item.viewCount === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 italic">No document views recorded yet.</p>
        )}
      </div>

    </div>
  );
}
