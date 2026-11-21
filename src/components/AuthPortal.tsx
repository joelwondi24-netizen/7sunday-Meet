import React, { useState } from 'react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  ShieldCheck,
  Briefcase,
  ShoppingBag,
  Video,
  Mail,
  Lock,
  User,
  Phone,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  KeyRound,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { activeFirebaseConfig, auth, CORPORATE_EMAIL_DOMAIN, googleAuthProvider } from '../lib/firebase';
import { provisionOwnProfile } from '../services/firestoreService';
import { UserPrivateProfile } from '../types';

interface AuthPortalProps {
  onAuthenticated: (profile: UserPrivateProfile) => void;
  onJoinAsGuest: (meetingCode: string, guestName: string, guestPassword?: string) => void;
  initialRoomCode?: string | null;
}

type PortalTab = 'employee' | 'customer' | 'admin' | 'guest';

export const AuthPortal: React.FC<AuthPortalProps> = ({
  onAuthenticated,
  onJoinAsGuest,
  initialRoomCode,
}) => {
  const [activePortal, setActivePortal] = useState<PortalTab>(initialRoomCode ? 'guest' : 'employee');
  const [mode, setMode] = useState<'signin' | 'register' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [guestCode, setGuestCode] = useState(initialRoomCode || '');
  const [guestName, setGuestName] = useState('');
  const [guestPassword, setGuestPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [pendingVerifyUser, setPendingVerifyUser] = useState<FirebaseUser | null>(null);

  const mapAuthError = (err: any, fallback: string): string => {
    const code = err?.code as string | undefined;
    if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      setUnauthorizedDomain(host || 'current-domain');
      return `The domain "${host || 'this domain'}" is not authorized for Google OAuth sign-in in Firebase.`;
    }
    if (code === 'auth/popup-blocked') {
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again, or sign in with Email & Password below.';
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return 'Google sign-in popup was closed before completing authentication.';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'Email/Password sign-in is not yet enabled in Firebase Console -> Authentication -> Sign-in method. Please enable it or use Google Sign-In above.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'Invalid email or password. Check your credentials or use Forgot password.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account with this email already exists. Switch to Sign In or reset your password.';
    }
    if (code === 'auth/weak-password') {
      return 'Password must be at least 6 characters long.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Too many authentication attempts. Please wait a moment and try again.';
    }
    return err?.message || fallback;
  };

  const handleCopyDomain = async () => {
    if (!unauthorizedDomain) return;
    try {
      await navigator.clipboard.writeText(unauthorizedDomain);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const finalizeProfile = async (fbUser: FirebaseUser, portal: 'employee' | 'customer' | 'admin') => {
    const profile = await provisionOwnProfile(fbUser, portal, {
      displayName: fullName || fbUser.displayName || undefined,
      phone: phone || undefined,
      department: department || undefined,
    });
    if (profile.status !== 'active') {
      throw new Error(`Your account status is currently "${profile.status}". Please contact your administrator.`);
    }
    onAuthenticated(profile);
  };

  const handleGoogleAuth = async () => {
    if (activePortal === 'guest') return;
    setError(null);
    setNotice(null);
    setUnauthorizedDomain(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      await finalizeProfile(result.user, activePortal);
    } catch (err: any) {
      setError(mapAuthError(err, 'Google sign-in failed.'));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activePortal === 'guest') return;
    setError(null);
    setNotice(null);
    setUnauthorizedDomain(null);

    if (mode === 'reset') {
      if (!email.trim()) {
        setError('Please enter your email address.');
        return;
      }
      setLoading(true);
      try {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice('Password reset link sent. Check your inbox.');
        setMode('signin');
      } catch (err: any) {
        setError(mapAuthError(err, 'Failed to send password reset email.'));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (activePortal === 'employee' && mode === 'register' && !email.trim().toLowerCase().endsWith(`@${CORPORATE_EMAIL_DOMAIN}`)) {
      setError(`Employee registration requires a corporate @${CORPORATE_EMAIL_DOMAIN} email address.`);
      return;
    }

    setLoading(true);
    try {
      let fbUser: FirebaseUser;
      if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (fullName.trim()) {
          await updateProfile(cred.user, { displayName: fullName.trim() });
        }
        fbUser = cred.user;
        if (!fbUser.emailVerified) {
          await sendEmailVerification(fbUser);
          setPendingVerifyUser(fbUser);
          setNotice('Verification email sent! Please verify your email address, then click "Check Verification".');
          setLoading(false);
          return;
        }
      } else {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        fbUser = cred.user;
        if (!fbUser.emailVerified) {
          setPendingVerifyUser(fbUser);
          setNotice('Your email is not yet verified. Please check your inbox or resend verification.');
          setLoading(false);
          return;
        }
      }
      await finalizeProfile(fbUser, activePortal);
    } catch (err: any) {
      setError(mapAuthError(err, 'Authentication failed.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!pendingVerifyUser || activePortal === 'guest') return;
    setLoading(true);
    setError(null);
    try {
      await pendingVerifyUser.reload();
      const refreshed = auth.currentUser;
      if (refreshed && refreshed.emailVerified) {
        await refreshed.getIdToken(true);
        setPendingVerifyUser(null);
        await finalizeProfile(refreshed, activePortal);
      } else {
        setError('Email is still unverified. Please click the verification link in your inbox first.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to check verification status.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingVerifyUser) return;
    setLoading(true);
    try {
      await sendEmailVerification(pendingVerifyUser);
      setNotice('Verification email re-sent. Check your inbox and spam folder.');
    } catch (err: any) {
      setError(err?.message || 'Could not resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!guestCode.trim() || !guestName.trim()) {
      setError('Please enter both the Meeting Code and your Display Name.');
      return;
    }
    onJoinAsGuest(guestCode.trim(), guestName.trim(), guestPassword.trim() || undefined);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-3 sm:p-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden">
        {/* Left Brand & Isolation Overview */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950 text-white p-5 sm:p-8 flex flex-col justify-between">
          <div className="space-y-4 sm:space-y-6">
            <div className="flex items-center gap-3.5">
              <img
                src="/assets/aistudio/seven_sunday_app_icon_crcle_c5b9c7db.png"
                alt="7Sunday Meet"
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl shadow-lg object-cover shrink-0"
              />
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight truncate">7Sunday Meet</h1>
                <p className="text-xs text-sky-300 font-medium truncate">Seven Sunday Ethiopia</p>
              </div>
            </div>

            <div className="space-y-2 sm:space-y-3 sm:pt-2">
              <h2 className="text-lg sm:text-2xl font-bold leading-snug">
                Unified Enterprise Meetings & Customer Engagement
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Dedicated, strictly isolated workspaces for Seven Sunday employees, valued customers, and administrators.
              </p>
            </div>

            <div className="hidden sm:block space-y-3 pt-2 text-xs">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                <Briefcase className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Employee Portal</p>
                  <p className="text-slate-400 mt-0.5">Corporate sign-in, department meetings, internal chat, and operational reports.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                <ShoppingBag className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Customer Portal</p>
                  <p className="text-slate-400 mt-0.5">Product catalog, order tracking, invoices, customer community & support.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Administrator Console</p>
                  <p className="text-slate-400 mt-0.5">Role matrix, department governance, security audits, and system integrations.</p>
                </div>
              </div>
            </div>
          </div>

          <p className="hidden sm:block text-[11px] text-slate-400 pt-8">
            Zero-Trust Role Isolation · End-to-End Encrypted WebRTC
          </p>
        </div>

        {/* Right Portal Auth Form */}
        <div className="lg:col-span-7 p-4 sm:p-8 lg:p-10 flex flex-col justify-center">
          {/* Portal Switcher */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl mb-5 sm:mb-6">
            {[
              { id: 'employee', label: 'Employee', icon: Briefcase },
              { id: 'customer', label: 'Customer', icon: ShoppingBag },
              { id: 'admin', label: 'Admin', icon: ShieldCheck },
              { id: 'guest', label: 'Guest Join', icon: Video },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activePortal === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActivePortal(tab.id as PortalTab);
                    setError(null);
                    setNotice(null);
                    setUnauthorizedDomain(null);
                    setPendingVerifyUser(null);
                    if (tab.id === 'admin') setMode('signin');
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span className="font-medium leading-relaxed">{error}</span>
              </div>

              {unauthorizedDomain && (
                <div className="pl-6 space-y-2 text-[11px] text-slate-700 dark:text-slate-300">
                  <p className="leading-relaxed">
                    Add this host under <strong>Firebase Console → Authentication → Settings → Authorized domains</strong> for project{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 font-mono text-[10px]">
                      {activeFirebaseConfig.projectId}
                    </code>
                    :
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[11px] text-slate-900 dark:text-white break-all">
                      {unauthorizedDomain}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyDomain}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-semibold hover:bg-slate-800 transition-colors"
                    >
                      {copiedDomain ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedDomain ? 'Copied' : 'Copy Domain'}</span>
                    </button>
                    <a
                      href={`https://console.firebase.google.com/project/${activeFirebaseConfig.projectId}/authentication/settings`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-500 transition-colors"
                    >
                      <span>Open Firebase Settings</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400">
                    Tip: You can also sign in with <strong>Email & Password</strong> below, join via <strong>Guest Join</strong>, or configure your own{' '}
                    <code className="font-mono">VITE_FIREBASE_*</code> environment variables on Render.
                  </p>
                </div>
              )}
            </div>
          )}

          {notice && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          {pendingVerifyUser ? (
            <div className="space-y-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Email Verification Required</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                We sent a verification link to <strong>{pendingVerifyUser.email}</strong>. Click the link in your email, then click below to continue into 7Sunday Meet.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCheckVerification}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Check Verification</span>
                </button>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold"
                >
                  Resend Link
                </button>
              </div>
            </div>
          ) : activePortal === 'guest' ? (
            <form onSubmit={handleGuestSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Join Meeting as External Guest</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Enter the meeting link code provided by your Seven Sunday host.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Meeting Code
                </label>
                <input
                  type="text"
                  value={guestCode}
                  onChange={(e) => setGuestCode(e.target.value)}
                  placeholder="e.g. 7sm-842-190"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Your Full Name
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Enter your display name"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Meeting Password (if required)
                </label>
                <input
                  type="password"
                  value={guestPassword}
                  onChange={(e) => setGuestPassword(e.target.value)}
                  placeholder="Optional meeting password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <span>Join Meeting Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="space-y-4 sm:space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    {activePortal === 'employee'
                      ? 'Employee Portal'
                      : activePortal === 'customer'
                      ? 'Customer Portal'
                      : 'Administrator Sign-In'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {activePortal === 'employee'
                      ? `Use verified corporate Google or @${CORPORATE_EMAIL_DOMAIN} email`
                      : activePortal === 'customer'
                      ? 'Order products, track deliveries, and message support'
                      : 'Restricted to authorized Super & Company Administrators'}
                  </p>
                </div>

                {activePortal !== 'admin' && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setMode(mode === 'register' ? 'signin' : 'register')}
                      className="font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      {mode === 'register' ? 'Back to Sign In' : 'Create Account'}
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-800 dark:text-white font-semibold text-sm flex items-center justify-center gap-2.5 shadow-sm transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                  <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                <span className="shrink mx-3 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  or email & password
                </span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-3.5">
                {mode === 'register' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Full Name
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                            placeholder="Abebe Bikila"
                            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Phone Number
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+251 9..."
                            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                      </div>
                    </div>

                    {activePortal === 'employee' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Department
                        </label>
                        <input
                          type="text"
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          placeholder="e.g. Operations, Sales, Engineering"
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {activePortal === 'employee' ? 'Corporate Email' : 'Email Address'}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder={
                        activePortal === 'employee' ? `user@${CORPORATE_EMAIL_DOMAIN}` : 'name@example.com'
                      }
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {mode !== 'reset' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setMode('reset')}
                        className="text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>Forgot password?</span>
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <span>
                    {loading
                      ? 'Authenticating...'
                      : mode === 'register'
                      ? `Register ${activePortal === 'customer' ? 'Customer' : 'Employee'} Account`
                      : mode === 'reset'
                      ? 'Send Password Reset Link'
                      : 'Sign In'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {mode === 'reset' && (
                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  >
                    Back to Sign In
                  </button>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
