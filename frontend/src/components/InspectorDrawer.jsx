import React, { useEffect } from 'react';
import {
  X,
  ShieldAlert,
  Clock,
  Eye,
  Download,
  Lock,
  XOctagon,
  KeyRound,
  AlertTriangle,
  ExternalLink,
  Laptop,
  CheckCircle2,
  UserX,
} from 'lucide-react';

/**
 * Inspector Drawer Component
 * 
 * WHY:
 * Matches the reference design aesthetic: 460px slide-in panel with dimmed backdrop,
 * file pill with status badge, left-rail event timeline with action-specific colors,
 * client device traces, and an instant kill-switch button.
 */
export function InspectorDrawer({ record, timeline = [], onClose, onRevoke }) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!record) return null;

  const isShareActive = record.computedStatus === 'active' || record.status === 'active';

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

  const getActionIcon = (action) => {
    switch (action) {
      case 'viewed':
        return <Eye className="w-3.5 h-3.5 text-emerald-400" />;
      case 'downloaded':
        return <Download className="w-3.5 h-3.5 text-blue-400" />;
      case 'download_blocked':
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />;
      case 'access_denied_different_device':
        return <Lock className="w-3.5 h-3.5 text-rose-400" />;
      case 'access_denied_unauthorized_account':
        return <UserX className="w-3.5 h-3.5 text-rose-400" />;
      case 'access_denied_revoked':
        return <XOctagon className="w-3.5 h-3.5 text-rose-500" />;
      case 'access_denied_expired':
        return <Clock className="w-3.5 h-3.5 text-amber-400" />;
      case 'access_denied_max_views':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      case 'share_created':
        return <KeyRound className="w-3.5 h-3.5 text-[#FF3B5C]" />;
      case 'share_revoked':
        return <XOctagon className="w-3.5 h-3.5 text-rose-500" />;
      case 'suspicious_multi_device':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const formatActionName = (action) => {
    return action
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const badge = getStatusBadge(record.computedStatus || record.status);

  return (
    <>
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 transition-opacity"
        onClick={onClose}
      />

      {/* 460px Right-side Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[460px] bg-[#121214] border-l border-zinc-800/90 z-50 shadow-2xl flex flex-col animate-slide-in">
        
        {/* Drawer Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Audit & Grant Inspection
            </h3>
            <p className="text-[11px] font-mono text-zinc-500 mt-0.5 uppercase tracking-wider">
              GRANT #{record.id?.slice(-8) || 'RECORD'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Inspector"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition focus:outline-none focus:ring-1 focus:ring-[#FF3B5C]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* File Pill */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-white truncate">
                  {record.documentTitle || record.fileName || 'Secured Payload'}
                </h4>
                <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                  {record.originalName || record.documentTitle}
                </p>
              </div>
              <span
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${badge.bg}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                {badge.label}
              </span>
            </div>
          </div>

          {/* Grant Configuration Summary */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
              Permission Parameters
            </span>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-zinc-500 block text-[11px]">Recipient</span>
                <span className="text-zinc-200 font-medium truncate block">
                  {record.recipientEmail || record.claimedBy?.name || 'Unassigned'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[11px]">Permission</span>
                <span className="text-zinc-200 font-medium capitalize">
                  {record.permission === 'download' ? 'Allow Download' : 'View Only (Watermarked)'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[11px]">Views Consumed</span>
                <span className="text-zinc-200 font-mono font-medium">
                  {record.viewCount ?? 0} / {record.maxViews ? record.maxViews : '∞ (Unlimited)'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[11px]">Expiration</span>
                <span className="text-zinc-200 font-mono text-[11px]">
                  {record.expiresAt ? new Date(record.expiresAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>

            {/* Device Lock Pill */}
            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs">
              <span className="text-zinc-400 text-[11px]">Forward Protection:</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  record.lockToFirstDevice
                    ? record.isDeviceBound
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                }`}
              >
                {record.lockToFirstDevice
                  ? record.isDeviceBound
                    ? 'LOCKED TO FIRST DEVICE'
                    : 'AWAITING FIRST DEVICE'
                  : 'DEVICE LOCK DISABLED'}
              </span>
            </div>

            {record.note && (
              <div className="pt-2 border-t border-zinc-800/60 text-[11px] text-zinc-400 italic">
                "{record.note}"
              </div>
            )}
          </div>

          {/* Audit Event Timeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Cryptographic Audit Trail
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                {timeline.length} event(s)
              </span>
            </div>

            {timeline.length > 0 ? (
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-zinc-800">
                {timeline.map((event, idx) => (
                  <div key={idx} className="relative flex items-start gap-3 pl-1">
                    <div className="w-5 h-5 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center z-10 flex-shrink-0 mt-0.5">
                      {getActionIcon(event.action)}
                    </div>
                    <div className="flex-1 bg-zinc-950/70 border border-zinc-800/60 rounded-xl p-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-zinc-200">
                          {formatActionName(event.action)}
                        </span>
                        <span className="font-mono text-zinc-500 text-[10px]">
                          {new Date(event.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                        <span>{event.deviceLabel || 'Client'}</span>
                        <span className="text-zinc-500">{event.ip}</span>
                      </div>
                      {event.meta?.note && (
                        <p className="text-[10px] text-zinc-500 italic mt-0.5">
                          {event.meta.note}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 italic p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                No recipient access recorded yet. Waiting for link to be opened.
              </p>
            )}
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-5 border-t border-zinc-800 bg-zinc-950/80 flex items-center gap-3">
          {isShareActive && onRevoke && (
            <button
              onClick={() => onRevoke(record.id)}
              className="flex-1 py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-[#FF3B5C] border border-rose-500/20 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-[#FF3B5C]"
            >
              <XOctagon className="w-3.5 h-3.5" />
              <span>Revoke Access Now</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}
