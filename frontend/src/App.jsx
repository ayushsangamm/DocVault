import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { ProtectedLayout } from './components/ProtectedLayout';
import { Auth } from './pages/Auth';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentDetailPage } from './pages/DocumentDetailPage';
import { SharesPage } from './pages/SharesPage';
import { AuditPage } from './pages/AuditPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { RecipientViewPage } from './pages/RecipientViewPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Routes (Tabbed Log In / Create Account with OTP) */}
          <Route path="/login" element={<Auth defaultTab="login" />} />
          <Route path="/signup" element={<Auth defaultTab="signup" />} />
          <Route path="/auth" element={<Auth defaultTab="login" />} />

          {/* Public Recipient Access Link */}
          <Route path="/s/:token" element={<RecipientViewPage />} />

          {/* Protected Owner Vault Application */}
          <Route path="/app" element={<ProtectedLayout />}>
            <Route index element={<Navigate to="/app/documents" replace />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="documents/:id" element={<DocumentDetailPage />} />
            <Route path="shares" element={<SharesPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
          </Route>

          {/* Root Redirect */}
          <Route path="/" element={<Navigate to="/app/documents" replace />} />

          {/* 404 Fallback */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
