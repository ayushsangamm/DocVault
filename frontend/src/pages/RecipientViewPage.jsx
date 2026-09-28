import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  KeyRound,
  ShieldAlert,
  Clock,
  Eye,
  Download,
  Lock,
  XOctagon,
  AlertTriangle,
  FileText,
  FileImage,
  FileSpreadsheet,
  ShieldCheck,
  RefreshCw,
  EyeOff,
} from 'lucide-react';
import { api } from '../lib/api';

export function RecipientViewPage() {
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [errorState, setErrorState] = useState(null); // { code, message }
  const [viewerTicket, setViewerTicket] = useState(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [blobUrl, setBlobUrl] = useState(null);
  const [isStreamLoading, setIsStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [securityWarning, setSecurityWarning] = useState('');

  const heartbeatRef = useRef(null);
  const blobUrlRef = useRef(null);

  // 1. Initial Access Verification
  useEffect(() => {
    let isMounted = true;

    async function openAccess() {
      try {
        setLoading(true);
        setErrorState(null);

        const res = await api.post('/access/open', { token });
        if (!isMounted) return;

        setData(res.data);
        setViewerTicket(res.data.viewerTicket);

        // Build streaming URL with viewer ticket using backend API base URL
        const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        setStreamUrl(`${base}/access/stream?ticket=${encodeURIComponent(res.data.viewerTicket)}`);
      } catch (err) {
        if (!isMounted) return;
        const code = err.response?.data?.code || 'TOKEN_INVALID';
        const message =
          err.response?.data?.message ||
          'Unable to verify document access. This link may be expired, revoked, or invalid.';
        setErrorState({ code, message });
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (token) {
      openAccess();
    }

    return () => {
      isMounted = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [token]);

  // 2. Client-Side Blob Rendering Strategy: Fetch stream securely as blob and bind local object URL
  useEffect(() => {
    if (!viewerTicket) return;

    let isMounted = true;
    setIsStreamLoading(true);
    setStreamError(null);

    async function loadStreamBlob() {
      try {
        const response = await api.get(`/access/stream?ticket=${encodeURIComponent(viewerTicket)}`, {
          responseType: 'blob',
        });

        if (!isMounted) return;

        // Clean up previous blob URL if exists
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }

        const objectUrl = URL.createObjectURL(response.data);
        blobUrlRef.current = objectUrl;
        setBlobUrl(objectUrl);
      } catch (err) {
        if (!isMounted) return;
        console.error('[Stream Blob Load Error]:', err);
        const message =
          err.response?.data?.message ||
          (err.response?.status === 403
            ? 'Access revoked or expired by owner.'
            : 'Unable to stream confidential document payload.');
        setStreamError(message);
      } finally {
        if (isMounted) {
          setIsStreamLoading(false);
        }
      }
    }

    loadStreamBlob();

    return () => {
      isMounted = false;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [viewerTicket]);

  // 3. Real-Time Revocation Heartbeat Polling (every 4 seconds)
  useEffect(() => {
    if (!viewerTicket || errorState) return;

    heartbeatRef.current = setInterval(async () => {
      try {
        const { data: statusData } = await api.post('/access/verify-status', {
          ticket: viewerTicket,
        });

        if (!statusData.active) {
          setErrorState({
            code: statusData.reason || 'SHARE_REVOKED',
            message: 'Access to this document was just revoked by the owner.',
          });
          clearInterval(heartbeatRef.current);
        }
      } catch {
        // Network blip, continue
      }
    }, 4000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [viewerTicket, errorState]);

  // 3. View Deterrents (Disable Right-click, Text Selection, Print/Copy Shortcuts)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Block Ctrl+P (Print)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setSecurityWarning('Printing is strictly prohibited for this confidential document.');
        setTimeout(() => setSecurityWarning(''), 3000);
      }

      // Block Ctrl+S (Save)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSecurityWarning('Direct saving is disabled. Please view inside the secure browser session.');
        setTimeout(() => setSecurityWarning(''), 3000);
      }

      // Block Ctrl+C (Copy) if in view mode
      if (data?.share?.permission === 'view' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setSecurityWarning('Text copying is disabled on this view-only document.');
        setTimeout(() => setSecurityWarning(''), 3000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data]);

  // Handle Download Action
  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      const res = await api.post(
        '/access/download',
        { token },
        { responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', data?.document?.originalName || 'document');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err.response?.data?.message || 'Download forbidden or failed.';
      alert(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // LOADING STATE
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center space-y-4 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#FF3B5C] to-[#FF6B81] p-[2px] shadow-2xl shadow-[#FF3B5C]/25 animate-pulse">
          <div className="w-full h-full bg-[#09090b] rounded-[14px] flex items-center justify-center">
            <KeyRound className="w-7 h-7 text-[#FF3B5C]" />
          </div>
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-white tracking-tight">
            Verifying Cryptographic Grant...
          </h2>
          <p className="text-[11px] font-mono text-zinc-500">
            Checking signature, Redis blacklist, and device authorization
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // FAILURE SCREENS (Dedicated screen & icon for every error code)
  // ---------------------------------------------------------------------------
  if (errorState) {
    const getErrorDetails = (code) => {
      switch (code) {
        case 'SHARE_REVOKED':
          return {
            icon: <XOctagon className="w-10 h-10 text-rose-500" />,
            title: 'Access Revoked by Owner',
            desc: 'The sender of this document has explicitly invalidated this share link. All active viewers and tokens have been disconnected.',
            badge: 'REVOCATION SIGNAL ACTIVE',
            color: 'rose',
          };
        case 'SHARE_EXPIRED':
          return {
            icon: <Clock className="w-10 h-10 text-amber-400" />,
            title: 'Access Window Expired',
            desc: 'The pre-configured access window for this document has elapsed. Please request a newly issued link from the document owner.',
            badge: 'TTL ELAPSED',
            color: 'amber',
          };
        case 'SHARE_EXHAUSTED':
          return {
            icon: <EyeOff className="w-10 h-10 text-blue-400" />,
            title: 'Maximum View Limit Reached',
            desc: 'This document was shared with a strict view quota which has now been fully consumed.',
            badge: 'VIEW QUOTA EXHAUSTED',
            color: 'blue',
          };
        case 'DEVICE_LOCK_MISMATCH':
          return {
            icon: <Lock className="w-10 h-10 text-rose-400" />,
            title: 'Device Lock Enforced',
            desc: 'This confidential link was already bound to another browser or computer. Forwarding is prohibited by the document owner.',
            badge: 'ANTI-FORWARDING PROTECTION',
            color: 'rose',
          };
        default:
          return {
            icon: <AlertTriangle className="w-10 h-10 text-zinc-400" />,
            title: 'Invalid or Expired Link',
            desc: 'This document link is corrupt, unrecognized, or the token signature could not be verified.',
            badge: 'SIGNATURE INVALID',
            color: 'zinc',
          };
      }
    };

    const details = getErrorDetails(errorState.code);

    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-4 py-12 selection:bg-[#FF3B5C]/30">
        <div className="max-w-md w-full bg-[#121214] border border-zinc-800/80 rounded-2xl p-8 text-center space-y-5 shadow-2xl animate-fade-in">
          
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto">
            {details.icon}
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 tracking-wider">
              {details.badge}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white mt-2">
              {details.title}
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {details.desc}
            </p>
          </div>

          <div className="pt-4 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-500">
            DocVault Zero-Trust Security Enforcement
          </div>

        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // SUCCESSFUL VIEWER VIEWPORT
  // ---------------------------------------------------------------------------
  const { document: docMeta, share: shareMeta } = data;
  const isViewOnly = shareMeta.permission === 'view';

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        setSecurityWarning('Right-click context menu is disabled on this confidential document.');
        setTimeout(() => setSecurityWarning(''), 3000);
      }}
      className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col select-none selection:bg-transparent"
    >
      
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#09090b]/90 backdrop-blur-xl border-b border-zinc-800 px-6 py-3.5 flex items-center justify-between gap-4">
        
        {/* Brand & Document Title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF3B5C] to-[#FF6B81] p-[1.5px] shadow-sm shadow-[#FF3B5C]/20 flex-shrink-0">
            <div className="w-full h-full bg-[#09090b] rounded-[10px] flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-[#FF3B5C]" />
            </div>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white tracking-tight truncate max-w-xs sm:max-w-md">
              {docMeta.title}
            </h1>
            <p className="text-[10px] font-mono text-zinc-400">
              Shared with <strong className="text-zinc-200">{shareMeta.recipientEmail}</strong>
            </p>
          </div>
        </div>

        {/* Right Header Status & Download Button */}
        <div className="flex items-center gap-3">
          
          {/* View Limit / Expiry Countdown */}
          <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-zinc-400">
            {shareMeta.remainingViews !== null && (
              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                {shareMeta.remainingViews} view{shareMeta.remainingViews === 1 ? '' : 's'} remaining
              </span>
            )}
            <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
              Expires {new Date(shareMeta.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Download Button (Only when permission === 'download') */}
          {!isViewOnly ? (
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="py-1.5 px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloading ? 'Downloading...' : 'Download File'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400">
              <Eye className="w-3.5 h-3.5 text-[#FF3B5C]" />
              <span className="hidden sm:inline">View Only Mode</span>
            </div>
          )}

        </div>
      </header>

      {/* Security Warning Toast */}
      {securityWarning && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#121214] border border-rose-900/80 text-rose-300 text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-fade-in">
          <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{securityWarning}</span>
        </div>
      )}

      {/* Main Secure Viewer Container */}
      <main className="flex-1 relative flex flex-col items-center justify-center p-4 sm:p-8 overflow-hidden">
        
        {/* Deterrent Notice Banner */}
        <div className="mb-4 max-w-2xl w-full p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center text-[11px] text-zinc-400 flex items-center justify-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span>
            This document session is actively monitored. Your IP address and client device are verified and logged.
          </span>
        </div>

        {/* Secure Document Canvas with Diagonal Watermark Overlay */}
        <div className="relative max-w-5xl w-full bg-[#121214] border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden min-h-[650px] flex items-center justify-center">
          
          {/* DIAGONAL WATERMARK OVERLAY (Section 11) */}
          <div
            className="absolute inset-0 pointer-events-none z-30 overflow-hidden flex items-center justify-center opacity-15 select-none"
            aria-hidden="true"
          >
            <div className="w-[180%] h-[180%] -rotate-25 flex flex-wrap content-around justify-around text-zinc-300 font-mono font-bold text-xs uppercase tracking-widest leading-loose">
              {Array.from({ length: 48 }).map((_, i) => (
                <div key={i} className="p-4 whitespace-nowrap">
                  {shareMeta.recipientEmail} • CONFIDENTIAL • MONITORED
                </div>
              ))}
            </div>
          </div>

          {/* DOCUMENT RENDERER */}
          <div className="w-full h-full min-h-[650px] flex items-center justify-center p-4 secure-document-viewport">
            {isStreamLoading ? (
              <div className="flex flex-col items-center justify-center space-y-4 py-24 text-center animate-fade-in">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#FF3B5C] to-[#FF6B81] p-[2px] shadow-lg shadow-[#FF3B5C]/20 animate-spin">
                  <div className="w-full h-full bg-[#09090b] rounded-[14px] flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 text-[#FF3B5C]" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Decrypting & Streaming Document...
                  </h3>
                  <p className="text-[11px] font-mono text-zinc-500">
                    Establishing zero-trust in-memory stream buffer
                  </p>
                </div>
              </div>
            ) : streamError ? (
              <div className="flex flex-col items-center justify-center space-y-4 py-16 text-center max-w-sm animate-fade-in">
                <div className="w-14 h-14 rounded-2xl bg-rose-950/40 border border-rose-900/60 flex items-center justify-center text-rose-400">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">Stream Render Error</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">{streamError}</p>
                </div>
                <button
                  onClick={() => {
                    setIsStreamLoading(true);
                    setStreamError(null);
                    api
                      .get(`/access/stream?ticket=${encodeURIComponent(viewerTicket)}`, {
                        responseType: 'blob',
                      })
                      .then((res) => {
                        const objectUrl = URL.createObjectURL(res.data);
                        blobUrlRef.current = objectUrl;
                        setBlobUrl(objectUrl);
                      })
                      .catch((err) => {
                        setStreamError(err.response?.data?.message || 'Retry failed.');
                      })
                      .finally(() => setIsStreamLoading(false));
                  }}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200 transition"
                >
                  Retry Loading
                </button>
              </div>
            ) : (blobUrl || streamUrl) ? (
              docMeta.fileType === 'pdf' ? (
                /* PDF Stream Viewer (authenticated blob URL) */
                <iframe
                  src={`${blobUrl || streamUrl}#toolbar=0&navpanes=0`}
                  title={docMeta.title}
                  className="w-full h-[750px] rounded-xl border border-zinc-800/60 bg-zinc-950 shadow-inner"
                />
              ) : docMeta.fileType === 'image' ? (
                /* Image Stream Viewer (authenticated blob URL) */
                <div className="max-w-3xl max-h-[700px] flex items-center justify-center overflow-auto p-2">
                  <img
                    src={blobUrl || streamUrl}
                    alt={docMeta.title}
                    className="rounded-xl max-h-[650px] object-contain shadow-2xl pointer-events-none select-none"
                    draggable={false}
                  />
                </div>
              ) : (
                /* Other types (DOCX / Archive) */
                <div className="text-center p-8 space-y-4 max-w-sm">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mx-auto">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{docMeta.title}</h3>
                    <p className="text-xs text-zinc-500 mt-1 font-mono">
                      {docMeta.originalName} ({(docMeta.sizeBytes / (1024 * 1024)).toFixed(1)} MB)
                    </p>
                  </div>
                  {!isViewOnly ? (
                    <button
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      <span>{isDownloading ? 'Downloading...' : 'Download Confidential File'}</span>
                    </button>
                  ) : (
                    <p className="text-xs text-amber-400/90 italic bg-amber-950/20 border border-amber-900/40 p-3 rounded-xl">
                      This file format cannot be rendered inline and download is restricted under view-only permission.
                    </p>
                  )}
                </div>
              )
            ) : null}
          </div>

        </div>

      </main>

      {/* Recipient Footer */}
      <footer className="border-t border-zinc-800/80 px-6 py-3 text-center text-[10px] font-mono text-zinc-500 bg-[#09090b]">
        DocVault Ephemeral Transfer Engine • Forwarding Prohibited • Monitored Node Access
      </footer>

    </div>
  );
}
