import React, { useState, useEffect, useRef } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  FileText,
  Upload,
  Share2,
  Trash2,
  Edit2,
  Search,
  FileCheck,
  FileImage,
  FileSpreadsheet,
  AlertCircle,
  Clock,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { ShareModal } from '../components/ShareModal';

export function DocumentsPage() {
  const { refreshSharesCount } = useOutletContext() || {};
  const { addToast } = useToast();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Upload State
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  // Rename State
  const [editingDocId, setEditingDocId] = useState(null);
  const [renameTitle, setRenameTitle] = useState('');

  // Delete Confirm State
  const [deletingDoc, setDeletingDoc] = useState(null);

  // Share Modal State
  const [sharingDoc, setSharingDoc] = useState(null);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/documents');
      setDocuments(data.documents || []);
    } catch (err) {
      addToast('Failed to load vaulted documents', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFileUpload = async (file) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      addToast('File exceeds maximum limit of 10 MB', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name.replace(/\.[^/.]+$/, ''));

    setIsUploading(true);
    setUploadProgress(15);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => (prev < 85 ? prev + 15 : prev));
    }, 200);

    try {
      const { data } = await api.post('/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      addToast(`"${data.document.title}" safely vaulted in authenticated storage`, 'success');
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        fetchDocuments();
      }, 500);
    } catch (err) {
      clearInterval(progressInterval);
      setIsUploading(false);
      setUploadProgress(0);
      const msg = err.response?.data?.message || 'Upload failed. Ensure file signature is valid.';
      addToast(msg, 'error');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleStartRename = (doc) => {
    setEditingDocId(doc.id);
    setRenameTitle(doc.title);
  };

  const handleSaveRename = async (id) => {
    if (!renameTitle.trim()) return;
    try {
      await api.patch(`/documents/${id}`, { title: renameTitle.trim() });
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, title: renameTitle.trim() } : d))
      );
      setEditingDocId(null);
      addToast('Document renamed', 'success');
    } catch (err) {
      addToast('Failed to rename document', 'error');
    }
  };

  const handleDeleteDocument = async () => {
    if (!deletingDoc) return;
    try {
      await api.delete(`/documents/${deletingDoc.id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== deletingDoc.id));
      addToast('Document and its active shares permanently revoked', 'info');
      setDeletingDoc(null);
      if (refreshSharesCount) refreshSharesCount();
    } catch (err) {
      addToast('Failed to delete document', 'error');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const getDocIcon = (fileType) => {
    switch (fileType) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-[#FF3B5C]" />;
      case 'image':
        return <FileImage className="w-5 h-5 text-emerald-400" />;
      default:
        return <FileSpreadsheet className="w-5 h-5 text-blue-400" />;
    }
  };

  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(search.toLowerCase()) ||
    doc.originalName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Vaulted Documents</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Encrypted storage isolated from public CDNs. Delivered strictly via verified tokens.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search documents by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-xl pl-9 pr-3 py-2 w-64 sm:w-72 focus:outline-none focus:border-[#FF3B5C] transition placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`bg-[#121214] border border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-[#FF3B5C] bg-[#FF3B5C]/5'
            : 'border-zinc-800 hover:border-zinc-700 bg-[#121214]/60'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
        />

        <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#FF3B5C] mb-1">
            <Upload className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-zinc-200">
            {isUploading ? 'Encrypting & Staging in Authenticated Storage...' : 'Drop confidential document here or click to browse'}
          </p>
          <p className="text-[11px] text-zinc-500">
            Supported: PDF, PNG, JPG/JPEG, WEBP, DOCX • Up to 10 MB per file
          </p>

          {isUploading && (
            <div className="w-full max-w-xs mt-3 space-y-1">
              <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden border border-zinc-800">
                <div
                  className="bg-[#FF3B5C] h-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-400 block text-right">
                {uploadProgress}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Documents Grid / List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[#121214] rounded-2xl border border-zinc-800/80 p-5 space-y-4 animate-pulse"
            >
              <div className="w-8 h-8 rounded-lg bg-zinc-800" />
              <div className="space-y-2">
                <div className="h-4 bg-zinc-800 rounded w-3/4" />
                <div className="h-3 bg-zinc-900 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredDocs.length === 0 ? (
        /* Empty State with Personality */
        <div className="bg-[#121214] border border-zinc-800/80 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">
            No sensitive documents vaulted yet
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
            Drop a certificate, medical report, executive NDA, or audit report above to start sharing with instant revocation and device-level forward protection.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="bg-[#121214] rounded-2xl border border-zinc-800/80 p-5 flex flex-col justify-between hover:border-zinc-700/80 transition-all duration-200 shadow-xl space-y-4 group"
            >
              <div>
                {/* Card Top: Icon & Active Shares Badge */}
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                    {getDocIcon(doc.fileType)}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${
                      doc.activeSharesCount > 0
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                    }`}
                  >
                    {doc.activeSharesCount > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    <span>{doc.activeSharesCount} Active Share{doc.activeSharesCount === 1 ? '' : 's'}</span>
                  </span>
                </div>

                {/* Title (or Inline Rename) */}
                {editingDocId === doc.id ? (
                  <div className="flex items-center gap-1.5 my-1">
                    <input
                      type="text"
                      value={renameTitle}
                      onChange={(e) => setRenameTitle(e.target.value)}
                      className="bg-zinc-950 border border-[#FF3B5C] rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none w-full"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveRename(doc.id)}
                      className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingDocId(null)}
                      className="p-1.5 bg-zinc-800 text-zinc-400 rounded-lg hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <Link
                      to={`/app/documents/${doc.id}`}
                      className="text-sm font-semibold text-white group-hover:text-[#FF3B5C] transition truncate block"
                    >
                      {doc.title}
                    </Link>
                    <p className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
                      {doc.originalName}
                    </p>
                  </div>
                )}

                {/* Metadata Pills */}
                <div className="flex items-center gap-3 mt-3 text-[11px] font-mono text-zinc-500">
                  <span>{formatBytes(doc.sizeBytes)}</span>
                  <span>•</span>
                  <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => setSharingDoc(doc)}
                  className="flex-1 py-1.5 px-3 bg-[#FF3B5C] hover:bg-[#E02345] text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm shadow-[#FF3B5C]/20"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStartRename(doc)}
                    title="Rename Document"
                    className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setDeletingDoc(doc)}
                    title="Delete Document"
                    className="p-1.5 bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-900/50 rounded-lg transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Share Dialog */}
      <ShareModal
        document={sharingDoc}
        isOpen={!!sharingDoc}
        onClose={() => setSharingDoc(null)}
        onShareCreated={() => {
          fetchDocuments();
          if (refreshSharesCount) refreshSharesCount();
        }}
      />

      {/* Delete Confirmation Modal */}
      {deletingDoc && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-zinc-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-rose-500" />
              </div>
              <h3 className="text-sm font-semibold text-white">Permanently Delete?</h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Deleting <strong className="text-white">"{deletingDoc.title}"</strong> will remove it from Cloudinary and <strong className="text-rose-400">immediately invalidate all active share links in Redis</strong>. Audit history will remain intact.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setDeletingDoc(null)}
                className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDocument}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
