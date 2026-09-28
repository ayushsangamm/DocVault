import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  KeyRound,
  Lock,
  Mail,
  User,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useToast } from '../components/Toast';

export function Auth({ defaultTab = 'login' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { login, sendOtp, signup } = useAuthStore();

  // Tab State: 'login' | 'signup'
  const initialTab = location.pathname.includes('signup') ? 'signup' : defaultTab;
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync tab with route if user navigates
  useEffect(() => {
    if (location.pathname.includes('signup')) {
      setActiveTab('signup');
    } else if (location.pathname.includes('login')) {
      setActiveTab('login');
    }
  }, [location.pathname]);

  // Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup Step 1 States
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupStep, setSignupStep] = useState(1); // 1 = Details, 2 = OTP

  // Signup Step 2 (OTP)
  const [otp, setOtp] = useState('');

  // Loading & Error States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Password Validation
  const hasMinLen = signupPassword.length >= 8;
  const hasLetter = /[A-Za-z]/.test(signupPassword);
  const hasNumber = /\d/.test(signupPassword);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setFormError('');
    setInfoMessage('');
    if (tab === 'login') {
      navigate('/login', { replace: true });
    } else {
      navigate('/signup', { replace: true });
    }
  };

  // ---------------------------------------------------------------------------
  // Handler: Direct Login (Email + Password)
  // ---------------------------------------------------------------------------
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setInfoMessage('');
    setIsSubmitting(true);

    const result = await login(loginEmail, loginPassword);
    setIsSubmitting(false);

    if (result.success) {
      addToast('Authenticated successfully. Welcome back.', 'success');
      navigate('/app/documents');
    } else {
      setFormError(result.message);
    }
  };

  // ---------------------------------------------------------------------------
  // Handler: Signup Step 1 (Send OTP via Resend)
  // ---------------------------------------------------------------------------
  const handleSendOtpSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setInfoMessage('');

    if (!signupName.trim()) {
      setFormError('Please enter your full name.');
      return;
    }

    if (!signupEmail.trim() || !signupEmail.includes('@')) {
      setFormError('Please enter a valid email address.');
      return;
    }

    if (!hasMinLen || !hasLetter || !hasNumber) {
      setFormError('Password must be at least 8 characters long and contain at least one letter and one number.');
      return;
    }

    setIsSubmitting(true);
    const result = await sendOtp(signupEmail.trim());
    setIsSubmitting(false);

    if (result.success) {
      setSignupStep(2);
      setInfoMessage(`Verification code sent to ${signupEmail}. Please check your inbox.`);
      addToast('Verification code dispatched via Resend', 'info');
    } else {
      setFormError(result.message);
    }
  };

  // ---------------------------------------------------------------------------
  // Handler: Signup Step 2 (Verify OTP & Register Account)
  // ---------------------------------------------------------------------------
  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setInfoMessage('');

    const cleanOtp = otp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setFormError('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsSubmitting(true);
    const result = await signup(signupName.trim(), signupEmail.trim(), signupPassword, cleanOtp);
    setIsSubmitting(false);

    if (result.success) {
      addToast('Account created and verified successfully! Welcome to DocVault.', 'success');
      navigate('/app/documents');
    } else {
      setFormError(result.message);
    }
  };

  // Resend OTP handler in Step 2
  const handleResendOtp = async () => {
    setFormError('');
    setInfoMessage('');
    setIsSubmitting(true);

    const result = await sendOtp(signupEmail.trim());
    setIsSubmitting(false);

    if (result.success) {
      setInfoMessage('A fresh verification code has been dispatched to your email.');
      addToast('New OTP dispatched via Resend', 'info');
    } else {
      setFormError(result.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col justify-center items-center px-4 py-12 selection:bg-[#FF3B5C]/30 antialiased">
      
      {/* Background glow effect */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#FF3B5C]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#FF3B5C] to-[#FF6B81] p-[2px] shadow-xl shadow-[#FF3B5C]/25 mb-2">
            <div className="w-full h-full bg-[#09090b] rounded-[14px] flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-[#FF3B5C]" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            DocVault Security Portal
          </h1>
          <p className="text-xs text-zinc-400">
            Controlled document sharing with cryptographic audit enforcement.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-2 p-1 bg-zinc-900/80 rounded-xl border border-zinc-800/80 text-xs font-medium">
          <button
            type="button"
            onClick={() => switchTab('login')}
            className={`py-2 rounded-lg transition ${
              activeTab === 'login'
                ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => switchTab('signup')}
            className={`py-2 rounded-lg transition ${
              activeTab === 'signup'
                ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Card Container */}
        <div className="bg-[#121214] border border-zinc-800/80 rounded-2xl p-7 shadow-2xl space-y-5">
          
          {/* Error Message Alert */}
          {formError && (
            <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-xl text-xs text-rose-300 flex items-start gap-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{formError}</span>
            </div>
          )}

          {/* Info Message Alert */}
          {infoMessage && (
            <div className="p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-xl text-xs text-emerald-300 flex items-start gap-2.5 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{infoMessage}</span>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 1: LOG IN (Direct Email + Password) */}
          {/* ================================================================= */}
          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4 animate-fade-in">
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="owner@docvault.io"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs rounded-xl pl-10 pr-3 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF3B5C] focus:ring-1 focus:ring-[#FF3B5C] transition"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs rounded-xl pl-10 pr-3 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF3B5C] focus:ring-1 focus:ring-[#FF3B5C] transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-[#FF3B5C] hover:bg-[#E02345] text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-[#FF3B5C]/20 active:scale-[0.99] disabled:opacity-50 mt-2"
              >
                {isSubmitting ? (
                  <span>Verifying Credentials...</span>
                ) : (
                  <>
                    <span>Sign In to Vault</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ================================================================= */}
          {/* TAB 2: CREATE ACCOUNT (2-Step Flow: Details -> OTP) */}
          {/* ================================================================= */}
          {activeTab === 'signup' && signupStep === 1 && (
            <form onSubmit={handleSendOtpSubmit} className="space-y-4 animate-fade-in">
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="Jordan Davis"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs rounded-xl pl-10 pr-3 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF3B5C] focus:ring-1 focus:ring-[#FF3B5C] transition"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="owner@docvault.io"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs rounded-xl pl-10 pr-3 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF3B5C] focus:ring-1 focus:ring-[#FF3B5C] transition"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="Minimum 8 characters"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs rounded-xl pl-10 pr-3 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF3B5C] focus:ring-1 focus:ring-[#FF3B5C] transition"
                  />
                </div>

                <div className="pt-2 flex items-center gap-3 text-[10px] font-mono text-zinc-500">
                  <span className={`flex items-center gap-1 ${hasMinLen ? 'text-emerald-400' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasMinLen ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
                    8+ chars
                  </span>
                  <span className={`flex items-center gap-1 ${hasLetter ? 'text-emerald-400' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasLetter ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
                    1+ letter
                  </span>
                  <span className={`flex items-center gap-1 ${hasNumber ? 'text-emerald-400' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasNumber ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
                    1+ number
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-[#FF3B5C] hover:bg-[#E02345] text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-[#FF3B5C]/20 active:scale-[0.99] disabled:opacity-50 mt-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending Verification Code...</span>
                  </>
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ================================================================= */}
          {/* TAB 2 - STEP 2: ENTER OTP */}
          {/* ================================================================= */}
          {activeTab === 'signup' && signupStep === 2 && (
            <form onSubmit={handleVerifyOtpSubmit} className="space-y-5 animate-fade-in">
              
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300">Enter 6-Digit OTP</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSignupStep(1);
                      setOtp('');
                      setFormError('');
                    }}
                    className="text-[11px] text-[#FF3B5C] hover:underline flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>Change Email</span>
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Verification code sent to <strong className="text-zinc-300">{signupEmail}</strong> (expires in 5 mins).
                </p>
              </div>

              {/* 6-Digit OTP Input Box */}
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                  className="w-full bg-zinc-950 border border-zinc-800 text-center font-mono text-2xl font-bold tracking-widest rounded-xl py-3 text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#FF3B5C] focus:ring-1 focus:ring-[#FF3B5C] transition"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Didn't receive the code?</span>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isSubmitting}
                  className="text-zinc-300 hover:text-white underline font-mono text-[11px] disabled:opacity-50"
                >
                  Resend Code
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || otp.length !== 6}
                className="w-full py-2.5 px-4 bg-[#FF3B5C] hover:bg-[#E02345] text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-[#FF3B5C]/20 active:scale-[0.99] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verify & Create Account</span>
                  </>
                )}
              </button>
            </form>
          )}

        </div>

        {/* Security Assurance Footnote */}
        <p className="text-center text-[11px] font-mono text-zinc-500">
          DocVault Zero-Trust Security • SHA-256 Hashed OTP • Bcrypt Cost 12
        </p>

      </div>
    </div>
  );
}
