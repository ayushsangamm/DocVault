import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Share2,
  FileText,
  Clock,
  Eye,
  Download,
  Lock,
  XOctagon,
  Layers,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { ShareModal } from '../components/ShareModal';
import { InspectorDrawer } from '../components/InspectorDrawer';

export function DocumentDetailPage() {
  const { id } = useParams();
  const { addToast } = useToast();

  const [document, setDocument] = useState(null);
  const [shares, setShares] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [inspectRecord, setInspectRecord] = useState(null);
  const [drawerTimeline, setDrawerTimeline] = useState([]);

  const fetchDocumentDetail = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/documents/${id}`);
      setDocument(data.document);
      setShares(data.shares || []);
      setRecentLogs(data.recentLogs || []);
    } catch (err) {
      addToast('Document not found or inaccessible', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocumentDetail();
  }, [id]);

  const handleInspectShare = async (share) => {
    try {
      const { data } = await api.get(`/shares/${share.id}`);
      setInspectRecord(data.share);
      setDrawerTimeline(data.timeline || []);
    } catch {
      setInspectRecord(share);
      setDrawerTimeline([]);
    }
  };

  const handleRevokeShare = async (shareId) => {
    try {
      await api.post(`/shares/${shareId}/revoke`, { reason: 'Revoked via detail view' });
      addToast('Share grant instantly revoked', 'info');
      fetchDocumentDetail();
      if (inspectRecord && inspectRecord.id === shareId) {
        setInspectRecord((prev) => ({ ...prev, status: 'revoked', computedStatus: 'revoked' }));
      }
    } catch (err) {
      addToast('Failed to revoke share', 'error');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-zinc-800 rounded" />
        <div className="h-32 bg-[#121214] rounded-2xl border border-zinc-800" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-sm text-zinc-400">Document could not be found.</p>
        <Link to="/app/documents" className="text-xs text-[#FF3B5C] hover:underline font-medium">
          ← Back to Documents
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Back button & Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/app/documents"
            className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {document.title}
            </h1>
            <p className="text-xs font-mono text-zinc-500 mt-0.5">{document.originalName}</p>
          </div>
        </div>

        <button
          onClick={() => setIsShareModalOpen(true)}
          className="py-2 px-4 bg-[#FF3B5C] hover:bg-[#E02345] text-white text-xs font-semibold rounded-xl transition flex items-center gap-2 shadow-lg shadow-[#FF3B5C]/20"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>New Share Grant</span>
        </button>
      </div>

      {/* Metadata Card */}
      <div className="bg-[#121214] border border-zinc-800/80 rounded-2xl p-6 shadow-xl space-y-4">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
          Document Specifications
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-zinc-500 block text-[11px]">Format / MIME</span>
            <span className="text-zinc-200 font-mono font-medium">{document.mimeType}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[11px]">Payload Size</span>
            <span className="text-zinc-200 font-mono font-medium">
              {(document.sizeBytes / (1024 * 1024)).toFixed(2)} MB
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[11px]">Vaulted On</span>
            <span className="text-zinc-200 font-mono font-medium">
              {new Date(document.createdAt).toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[11px]">Storage Mode</span>
            <span className="text-emerald-400 font-mono font-medium">
              Authenticated (Non-CDN)
            </span>
          </div>
        </div>
      </div>

      {/* Shares List */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-white tracking-tight">Active & Historical Shares</h2>

        {shares.length === 0 ? (
          <p className="text-xs text-zinc-500 italic p-6 bg-[#121214] border border-zinc-800/80 rounded-2xl text-center">
            No recipients have been granted access to this document yet. Click "New Share Grant" to issue a signed link.
          </p>
        ) : (
          <div className="bg-[#121214] rounded-2xl border border-zinc-800/80 overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-zinc-400 font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-6">Recipient</th>
                  <th className="py-3 px-4">Permission</th>
                  <th className="py-3 px-4">Views</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4">Forward Lock</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {shares.map((share) => (
                  <tr
                    key={share.id}
                    onClick={() => handleInspectShare(share)}
                    className="hover:bg-zinc-900/50 transition cursor-pointer"
                  >
                    <td className="py-3.5 px-6 font-medium text-white">
                      {share.recipientEmail}
                    </td>
                    <td className="py-3.5 px-4 capitalize text-zinc-300">
                      {share.permission}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-zinc-300">
                      {share.viewCount} / {share.maxViews ?? '∞'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-400">
                      {new Date(share.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4">
                      {share.lockToFirstDevice ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {share.isDeviceBound ? 'Bound' : 'Enabled'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-zinc-500">Off</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-[10px] font-mono uppercase text-zinc-300">
                        {share.computedStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                      {share.computedStatus === 'active' && (
                        <button
                          onClick={() => handleRevokeShare(share.id)}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-[#FF3B5C] border border-rose-500/20 transition"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ShareModal
        document={document}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onShareCreated={() => fetchDocumentDetail()}
      />

      <InspectorDrawer
        record={inspectRecord}
        timeline={drawerTimeline}
        onClose={() => setInspectRecord(null)}
        onRevoke={handleRevokeShare}
      />

    </div>
  );
}
