import React, { useState, useEffect } from 'react';
import {
  Layers,
  Search,
  Filter,
  Eye,
  Download,
  ShieldAlert,
  Lock,
  XOctagon,
  Clock,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { InspectorDrawer } from '../components/InspectorDrawer';

export function AuditPage() {
  const { addToast } = useToast();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('');

  const [inspectRecord, setInspectRecord] = useState(null);
  const [drawerTimeline, setDrawerTimeline] = useState([]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (selectedAction) params.append('action', selectedAction);

      const { data } = await api.get(`/audit?${params.toString()}`);
      setLogs(data.logs || []);
    } catch (err) {
      addToast('Failed to load audit trail', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [selectedAction]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchAuditLogs();
  };

  const handleRowClick = async (log) => {
    if (log.shareId) {
      try {
        const { data } = await api.get(`/shares/${log.shareId}`);
        setInspectRecord(data.share);
        setDrawerTimeline(data.timeline || []);
        return;
      } catch {}
    }
    // Fallback if share is gone or standalone event
    setInspectRecord({
      id: log.shareId || log.id,
      fileName: log.documentTitle,
      status: 'AUDIT',
      recipientEmail: log.recipientEmail,
      permission: log.action.includes('download') ? 'download' : 'view',
      viewCount: 1,
      maxViews: null,
    });
    setDrawerTimeline([log]);
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'viewed':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: <Eye className="w-3 h-3 text-emerald-400" />,
          label: 'Viewed',
        };
      case 'downloaded':
        return {
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          icon: <Download className="w-3 h-3 text-blue-400" />,
          label: 'Downloaded',
        };
      case 'download_blocked':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          icon: <ShieldAlert className="w-3 h-3 text-amber-400" />,
          label: 'Download Blocked',
        };
      case 'access_denied_different_device':
        return {
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          icon: <Lock className="w-3 h-3 text-rose-400" />,
          label: 'Device Lock Denied',
        };
      case 'access_denied_revoked':
        return {
          bg: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
          icon: <XOctagon className="w-3 h-3 text-rose-500" />,
          label: 'Access Denied (Revoked)',
        };
      case 'access_denied_expired':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          icon: <Clock className="w-3 h-3 text-amber-400" />,
          label: 'Expired Denial',
        };
      case 'access_denied_max_views':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          icon: <AlertTriangle className="w-3 h-3 text-amber-400" />,
          label: 'Quota Exceeded',
        };
      case 'share_created':
        return {
          bg: 'bg-zinc-800 text-zinc-300 border-zinc-700',
          icon: <KeyRound className="w-3 h-3 text-[#FF3B5C]" />,
          label: 'Share Minted',
        };
      case 'share_revoked':
        return {
          bg: 'bg-rose-950/40 text-rose-300 border-rose-900',
          icon: <XOctagon className="w-3 h-3 text-rose-400" />,
          label: 'Grant Revoked',
        };
      case 'suspicious_multi_device':
        return {
          bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          icon: <AlertTriangle className="w-3 h-3 text-amber-400" />,
          label: 'Forward Detected',
        };
      default:
        return {
          bg: 'bg-zinc-800 text-zinc-400 border-zinc-700',
          icon: <CheckCircle2 className="w-3 h-3" />,
          label: action,
        };
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Header & Search/Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Audit Trail & Compliance Ledger
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Immutable, append-only security logs of every token access, view, download, and denial.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2">
          {/* Action Filter Select */}
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#FF3B5C]"
          >
            <option value="">All Actions</option>
            <option value="viewed">Views</option>
            <option value="downloaded">Downloads</option>
            <option value="download_blocked">Blocked Downloads</option>
            <option value="access_denied_different_device">Device Lock Denials</option>
            <option value="access_denied_revoked">Revoked Link Attempts</option>
            <option value="access_denied_expired">Expired Attempts</option>
            <option value="suspicious_multi_device">Forward Detections</option>
            <option value="share_created">Shares Minted</option>
            <option value="share_revoked">Shares Revoked</option>
          </select>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search email, IP, device..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-xl pl-9 pr-3 py-2 w-56 sm:w-64 focus:outline-none focus:border-[#FF3B5C] transition placeholder:text-zinc-600"
            />
          </form>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-[#121214] rounded-2xl border border-zinc-800/80 shadow-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-500 animate-pulse">
            Loading immutable audit entries...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-semibold text-zinc-300">No audit events match your query</p>
            <p className="text-xs text-zinc-500">
              Try clearing filters or search keywords.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-zinc-400 font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-6">Event Action</th>
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-4">Actor / Recipient</th>
                  <th className="py-3 px-4">Network & Client Device</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {logs.map((log) => {
                  const badge = getActionBadge(log.action);

                  return (
                    <tr
                      key={log.id}
                      onClick={() => handleRowClick(log)}
                      className="hover:bg-zinc-900/60 transition cursor-pointer"
                    >
                      {/* Action Badge */}
                      <td className="py-3.5 px-6">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${badge.bg}`}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Document Title */}
                      <td className="py-3.5 px-4 font-semibold text-zinc-200">
                        {log.documentTitle}
                      </td>

                      {/* Actor Email */}
                      <td className="py-3.5 px-4 font-mono text-zinc-300">
                        {log.recipientEmail}
                      </td>

                      {/* Network & Device */}
                      <td className="py-3.5 px-4">
                        <span className="text-zinc-200 block text-[11px]">{log.deviceLabel}</span>
                        <span className="text-[10px] font-mono text-zinc-500">{log.ip}</span>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>

                      {/* Inspect Button */}
                      <td className="py-3.5 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleRowClick(log)}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspector Drawer */}
      <InspectorDrawer
        record={inspectRecord}
        timeline={drawerTimeline}
        onClose={() => setInspectRecord(null)}
      />

    </div>
  );
}
