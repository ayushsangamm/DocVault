import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Share2,
  Search,
  XOctagon,
  RefreshCw,
  Lock,
  Unlock,
  Copy,
  Check,
  Eye,
  Download,
  AlertCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { InspectorDrawer } from '../components/InspectorDrawer';

export function SharesPage() {
  const { refreshSharesCount } = useOutletContext() || {};
  const { addToast } = useToast();

  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'revoked' | 'expired' | 'exhausted'

  const [inspectRecord, setInspectRecord] = useState(null);
  const [drawerTimeline, setDrawerTimeline] = useState([]);

  // Revoke Confirm Modal State
  const [revokingShareId, setRevokingShareId] = useState(null);

  // Newly generated link modal/toast state
  const [regeneratedLink, setRegeneratedLink] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const fetchShares = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/shares');
      setShares(data.shares || []);
    } catch (err) {
      addToast('Failed to load shared grants', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
  }, []);

  const handleInspect = async (share) => {
    try {
      const { data } = await api.get(`/shares/${share.id}`);
      setInspectRecord(data.share);
      setDrawerTimeline(data.timeline || []);
    } catch {
      setInspectRecord(share);
      setDrawerTimeline([]);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokingShareId) return;
    try {
      await api.post(`/shares/${revokingShareId}/revoke`, { reason: 'Revoked by owner' });
      addToast('Access grant immediately revoked and blacklisted in Redis', 'info');
      setRevokingShareId(null);
      fetchShares();
      if (refreshSharesCount) refreshSharesCount();
      if (inspectRecord && inspectRecord.id === revokingShareId) {
        setInspectRecord((prev) => ({ ...prev, status: 'revoked', computedStatus: 'revoked' }));
      }
    } catch (err) {
      addToast('Failed to revoke share', 'error');
    }
  };

  const handleResetLock = async (shareId) => {
    try {
      await api.post(`/shares/${shareId}/reset-lock`);
      addToast('Device binding cleared. Next device to open the link will lock it.', 'success');
      fetchShares();
    } catch (err) {
      addToast('Failed to reset device lock', 'error');
    }
  };

  const handleRegenerateLink = async (shareId) => {
    try {
      const { data } = await api.post(`/shares/${shareId}/regenerate-link`);
      setRegeneratedLink(data.shareUrl);
      addToast('New secure link generated. Old link permanently invalidated.', 'success');
      fetchShares();
      if (refreshSharesCount) refreshSharesCount();
    } catch (err) {
      addToast('Failed to regenerate link', 'error');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          dot: 'bg-emerald-400 animate-pulse',
          label: 'ACTIVE',
        };
      case 'revoked':
        return {
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          dot: 'bg-rose-500',
          label: 'REVOKED',
        };
      case 'expired':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          dot: 'bg-amber-400',
          label: 'EXPIRED',
        };
      case 'exhausted':
        return {
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          dot: 'bg-blue-400',
          label: 'EXHAUSTED',
        };
      default:
        return {
          bg: 'bg-zinc-800 text-zinc-400 border-zinc-700',
          dot: 'bg-zinc-500',
          label: status?.toUpperCase() || 'UNKNOWN',
        };
    }
  };

  const filteredShares = shares.filter((s) => {
    const matchesSearch =
      s.recipientEmail.toLowerCase().includes(search.toLowerCase()) ||
      s.documentTitle.toLowerCase().includes(search.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && s.computedStatus === statusFilter;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Active & Issued Grants
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time management of recipient links, device locks, and instant kill switches.
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by recipient or document..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-xl pl-9 pr-3 py-2 w-64 sm:w-72 focus:outline-none focus:border-[#FF3B5C] transition placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {[
          { key: 'all', label: 'All Grants' },
          { key: 'active', label: 'Active' },
          { key: 'revoked', label: 'Revoked' },
          { key: 'expired', label: 'Expired' },
          { key: 'exhausted', label: 'View Limit Reached' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              statusFilter === tab.key
                ? 'bg-zinc-800 text-white border border-zinc-700/60 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Shares Table */}
      <div className="bg-[#121214] rounded-2xl border border-zinc-800/80 shadow-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-500 animate-pulse">
            Loading share grants...
          </div>
        ) : filteredShares.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-semibold text-zinc-300">No share grants found</p>
            <p className="text-xs text-zinc-500">
              Go to the Documents tab to issue new time-bound, watermarked links.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-zinc-400 font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-6">Document & Recipient</th>
                  <th className="py-3 px-4">Permission</th>
                  <th className="py-3 px-4">Views Used</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4">Forward Lock</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredShares.map((s) => {
                  const badge = getStatusBadge(s.computedStatus);
                  const isActive = s.computedStatus === 'active';

                  return (
                    <tr
                      key={s.id}
                      onClick={() => handleInspect(s)}
                      className="hover:bg-zinc-900/60 transition cursor-pointer"
                    >
                      <td className="py-3.5 px-6">
                        <span className="font-semibold text-white block hover:text-[#FF3B5C] transition">
                          {s.documentTitle}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400">
                          {s.recipientEmail}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 capitalize">
                        <span className="inline-flex items-center gap-1.5 text-zinc-300 font-medium">
                          {s.permission === 'view' ? (
                            <Eye className="w-3.5 h-3.5 text-[#FF3B5C]" />
                          ) : (
                            <Download className="w-3.5 h-3.5 text-emerald-400" />
                          )}
                          <span>{s.permission}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-zinc-300">
                        {s.viewCount} / {s.maxViews ?? '∞'}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-400">
                        {new Date(s.expiresAt).toLocaleDateString()}
                      </td>

                      <td className="py-3.5 px-4">
                        {s.lockToFirstDevice ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border ${
                              s.isDeviceBound
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            }`}
                          >
                            <Lock className="w-3 h-3" />
                            <span>{s.isDeviceBound ? 'Locked' : 'Awaiting'}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-zinc-600">Disabled</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${badge.bg}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {isActive && (
                            <button
                              onClick={() => setRevokingShareId(s.id)}
                              title="Instant Kill Switch"
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-[#FF3B5C] border border-rose-500/20 transition flex items-center gap-1"
                            >
                              <XOctagon className="w-3.5 h-3.5" />
                              <span>Revoke</span>
                            </button>
                          )}

                          {s.lockToFirstDevice && s.isDeviceBound && isActive && (
                            <button
                              onClick={() => handleResetLock(s.id)}
                              title="Reset Device Binding"
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg transition"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => handleRegenerateLink(s.id)}
                            title="Regenerate Signed Link"
                            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg transition"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
        onRevoke={(id) => setRevokingShareId(id)}
      />

      {/* Revoke Confirmation Modal */}
      {revokingShareId && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-zinc-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <XOctagon className="w-4 h-4 text-rose-500" />
              </div>
              <h3 className="text-sm font-semibold text-white">Execute Revocation?</h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              This triggers the <strong className="text-[#FF3B5C]">distributed Redis blacklist</strong>. The very next request or open viewer with this link will return <strong className="text-white">403 Forbidden</strong> within milliseconds.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setRevokingShareId(null)}
                className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRevoke}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition"
              >
                Revoke Link Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerated Link Modal */}
      {regeneratedLink && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Regenerated Secure Link</h3>
              <button onClick={() => setRegeneratedLink(null)} className="text-zinc-500 hover:text-white">
                <XOctagon className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              The previous link has been killed in Redis. Send this new signed link to the recipient:
            </p>

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between gap-3 font-mono text-xs">
              <span className="truncate select-all text-zinc-300">{regeneratedLink}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(regeneratedLink);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
                className="px-3 py-1.5 bg-[#FF3B5C] hover:bg-[#E02345] text-white text-xs font-semibold rounded-lg transition flex items-center gap-1 flex-shrink-0"
              >
                {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{linkCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <button
              onClick={() => setRegeneratedLink(null)}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
            >
              Done
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
