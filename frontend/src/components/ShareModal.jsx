import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  X,
  Share2,
  Copy,
  Check,
  Lock,
  Eye,
  Download,
  Clock,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  UserCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';

export function ShareModal({ document, isOpen, onClose, onShareCreated }) {
  const { addToast } = useToast();

  const [recipientEmail, setRecipientEmail] = useState('');
  const [permission, setPermission] = useState('view'); // 'view' | 'download'
  const [expiryOption, setExpiryOption] = useState('24'); // '1' | '24' | '48' | '168' (7d) | 'custom'
  const [customHours, setCustomHours] = useState('72');
  const [maxViewsOption, setMaxViewsOption] = useState('unlimited'); // '1' | '3' | '10' | 'unlimited' | 'custom'
  const [customViews, setCustomViews] = useState('5');
  const [lockToFirstDevice, setLockToFirstDevice] = useState(false);
  const [requireRecipientLogin, setRequireRecipientLogin] = useState(false);
  const [note, setNote] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdShare, setCreatedShare] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !document) return null;

  const handleCreateShare = async (e) => {
    e.preventDefault();
    setError('');

    if (!recipientEmail || !recipientEmail.includes('@')) {
      setError('Please provide a valid recipient email address.');
      return;
    }

    let expiresInHours = parseInt(expiryOption, 10);
    if (expiryOption === 'custom') {
      expiresInHours = parseInt(customHours, 10);
      if (isNaN(expiresInHours) || expiresInHours <= 0 || expiresInHours > 720) {
        setError('Custom expiry must be between 1 and 720 hours (30 days).');
        return;
      }
    }

    let maxViews = null;
    if (maxViewsOption !== 'unlimited') {
      if (maxViewsOption === 'custom') {
        maxViews = parseInt(customViews, 10);
        if (isNaN(maxViews) || maxViews < 1 || maxViews > 1000) {
          setError('Max views must be between 1 and 1000.');
          return;
        }
      } else {
        maxViews = parseInt(maxViewsOption, 10);
      }
    }

    setIsSubmitting(true);
    try {
      const { data } = await api.post('/shares', {
        documentId: document.id || document._id,
        recipientEmail,
        permission,
        expiresInHours,
        maxViews,
        lockToFirstDevice,
        requireRecipientLogin,
        note,
      });

      setCreatedShare(data);
      addToast('Secure signed share link generated', 'success');
      if (onShareCreated) onShareCreated(data.share);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to generate share link.';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdShare?.shareUrl) return;
    navigator.clipboard.writeText(createdShare.shareUrl);
    setCopied(true);
    addToast('Link copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2400);
  };

  const handleClose = () => {
    setCreatedShare(null);
    setRecipientEmail('');
    setRequireRecipientLogin(false);
    setNote('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-[#121214] border border-zinc-800 rounded-2xl max-w-lg w-full p-6 text-zinc-100 space-y-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-[#FF3B5C] border border-zinc-700/60">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Create Controlled Share</h3>
              <p className="text-[11px] font-mono text-zinc-500 truncate max-w-xs">
                {document.title}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-zinc-500 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* If Share was created successfully, show Link & QR Code */}
        {createdShare ? (
          <div className="space-y-5 animate-fade-in">
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/40 text-emerald-300 text-xs flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Signed Share Token Active</span>
                <span className="text-[11px] text-zinc-400">
                  This single-use cryptographic token gives controlled access to{' '}
                  <strong className="text-zinc-200">{recipientEmail}</strong>.
                </span>
              </div>
            </div>

            {/* Generated URL copy box */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Encrypted Link URL
              </span>
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-zinc-300 truncate select-all">
                  {createdShare.shareUrl}
                </span>
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 bg-[#FF3B5C] hover:bg-[#E02345] text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 flex-shrink-0 shadow-sm shadow-[#FF3B5C]/20"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col items-center gap-2">
              <div className="p-2.5 bg-white rounded-lg inline-block">
                <QRCodeSVG value={createdShare.shareUrl} size={130} />
              </div>
              <p className="text-[10px] font-mono text-zinc-500">
                Scan with phone camera to test mobile access
              </p>
            </div>

            <div className="text-[11px] text-zinc-500 text-center">
              Direct email delivery is currently disabled. Send the copied link directly to the recipient.
            </div>

            <button
              onClick={handleClose}
              className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
            >
              Done
            </button>
          </div>
        ) : (
          /* Share Creation Form */
          <form onSubmit={handleCreateShare} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Recipient Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Recipient Email Address</label>
              <input
                type="email"
                required
                placeholder="recruiter@acmecorp.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs rounded-xl px-3.5 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF3B5C] transition"
              />
            </div>

            {/* Permission Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Granted Permission Level</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPermission('view')}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                    permission === 'view'
                      ? 'bg-zinc-800/90 border-[#FF3B5C] text-white'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Eye className="w-4 h-4 text-[#FF3B5C]" />
                  <div>
                    <span className="text-xs font-semibold block">View Only</span>
                    <span className="text-[10px] text-zinc-500">Watermarked, download blocked</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPermission('download')}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                    permission === 'download'
                      ? 'bg-zinc-800/90 border-[#FF3B5C] text-white'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="text-xs font-semibold block">Allow Download</span>
                    <span className="text-[10px] text-zinc-500">Direct binary file delivery</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Expiry Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Access Expiry Window</label>
              <div className="grid grid-cols-5 gap-1.5 text-xs font-mono">
                {[
                  { label: '1 Hour', val: '1' },
                  { label: '24 Hours', val: '24' },
                  { label: '48 Hours', val: '48' },
                  { label: '7 Days', val: '168' },
                  { label: 'Custom', val: 'custom' },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setExpiryOption(item.val)}
                    className={`py-1.5 rounded-lg border text-center transition text-[11px] ${
                      expiryOption === item.val
                        ? 'bg-[#FF3B5C]/15 border-[#FF3B5C] text-[#FF3B5C] font-semibold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {expiryOption === 'custom' && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="720"
                    placeholder="Hours (e.g. 72)"
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    className="w-32 bg-zinc-950 border border-zinc-800 text-xs rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-[#FF3B5C]"
                  />
                  <span className="text-xs text-zinc-500">hours from now (max 30 days)</span>
                </div>
              )}
            </div>

            {/* Max Views Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">View Limit Quota</label>
              <div className="grid grid-cols-5 gap-1.5 text-xs font-mono">
                {[
                  { label: 'Single (1)', val: '1' },
                  { label: '3 Views', val: '3' },
                  { label: '10 Views', val: '10' },
                  { label: 'Unlimited', val: 'unlimited' },
                  { label: 'Custom', val: 'custom' },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setMaxViewsOption(item.val)}
                    className={`py-1.5 rounded-lg border text-center transition text-[11px] ${
                      maxViewsOption === item.val
                        ? 'bg-[#FF3B5C]/15 border-[#FF3B5C] text-[#FF3B5C] font-semibold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {maxViewsOption === 'custom' && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    placeholder="Views (e.g. 5)"
                    value={customViews}
                    onChange={(e) => setCustomViews(e.target.value)}
                    className="w-32 bg-zinc-950 border border-zinc-800 text-xs rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-[#FF3B5C]"
                  />
                  <span className="text-xs text-zinc-500">maximum view opens</span>
                </div>
              )}
            </div>

            {/* Forward Protection: Lock to First Device Toggle */}
            <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-800/90 flex items-start gap-3">
              <input
                id="deviceLockCheckbox"
                type="checkbox"
                checked={lockToFirstDevice}
                onChange={(e) => setLockToFirstDevice(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-zinc-700 text-[#FF3B5C] focus:ring-[#FF3B5C] bg-zinc-900 cursor-pointer"
              />
              <label htmlFor="deviceLockCheckbox" className="cursor-pointer text-xs space-y-0.5 select-none">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#FF3B5C]" />
                  Lock to First Device (Anti-Forwarding)
                </span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Cryptographically binds to the first device that opens this link. If forwarded to another person or device, access is instantly denied with code 403.
                </p>
              </label>
            </div>

            {/* Mandatory Recipient Login (Strict Email Match) */}
            <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-800/90 flex items-start gap-3">
              <input
                id="requireLoginCheckbox"
                type="checkbox"
                checked={requireRecipientLogin}
                onChange={(e) => setRequireRecipientLogin(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-zinc-700 text-[#FF3B5C] focus:ring-[#FF3B5C] bg-zinc-900 cursor-pointer"
              />
              <label htmlFor="requireLoginCheckbox" className="cursor-pointer text-xs space-y-0.5 select-none">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                  Require Recipient Login (Strict Email Match)
                </span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Recipient must be logged in with the target email address to view this file.
                </p>
              </label>
            </div>

            {/* Purpose Note */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Context / Purpose Note <span className="text-zinc-500">(Optional)</span>
              </label>
              <input
                type="text"
                maxLength={300}
                placeholder="e.g. Compliance background check round 2"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs rounded-xl px-3.5 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF3B5C] transition"
              />
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-zinc-800 flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2 px-4 bg-[#FF3B5C] hover:bg-[#E02345] text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-[#FF3B5C]/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Generating Secure Link...</span>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Issue Signed Share Link</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
