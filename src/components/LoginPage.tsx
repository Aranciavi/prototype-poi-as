import { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import { useAuth, type VerificationPreview } from '../context/AuthContext';
import { BriLogo } from './BriLogo';

type AuthMode = 'login' | 'register' | 'verify';

export function LoginPage() {
  const { login, register, verifyEmail, resendCode } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');

  // Login form state (username & password only)
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Register form state ("Tambah Akun")
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);

  // Verification state
  const [pendingIdentifier, setPendingIdentifier] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [emailPreview, setEmailPreview] = useState<VerificationPreview | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleFillExample = () => {
    setLoginUsername('brioutlet');
    setLoginPassword('11111');
    setErrorMsg(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    if (!loginUsername.trim() || !loginPassword) {
      setErrorMsg('Masukkan username dan password Anda.');
      return;
    }

    setIsSubmitting(true);
    const res = await login(loginUsername.trim(), loginPassword);
    setIsSubmitting(false);

    if (!res.ok) {
      if (res.needsVerification && res.email) {
        setPendingIdentifier(res.username || loginUsername.trim());
        setPendingEmail(res.email);
        const resent = await resendCode(res.username || loginUsername.trim());
        if (resent.ok && resent.verificationPreview) {
          setEmailPreview(resent.verificationPreview);
        }
        setMode('verify');
        setInfoMsg(`Akun Anda membutuhkan verifikasi email ke ${res.email}.`);
        return;
      }
      setErrorMsg(res.error || 'Gagal masuk.');
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!regUsername.trim() || !regEmail.trim() || !regPassword) {
      setErrorMsg('Username, email, dan password wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    const res = await register({
      username: regUsername.trim(),
      email: regEmail.trim(),
      password: regPassword,
      fullName: regFullName.trim() || undefined,
    });
    setIsSubmitting(false);

    if (!res.ok) {
      setErrorMsg(res.error || 'Pendaftaran gagal.');
      return;
    }

    setPendingIdentifier(res.username || regUsername.trim());
    setPendingEmail(res.email || regEmail.trim());
    setEmailPreview(res.verificationPreview ?? null);
    setOtpCode('');
    setInfoMsg(`Kode verifikasi 6 digit telah dikirim ke ${res.email || regEmail.trim()}.`);
    setMode('verify');
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!otpCode.trim()) {
      setErrorMsg('Masukkan 6 digit kode verifikasi email.');
      return;
    }

    setIsSubmitting(true);
    const res = await verifyEmail(pendingIdentifier || pendingEmail, otpCode.trim());
    setIsSubmitting(false);

    if (!res.ok) {
      setErrorMsg(res.error || 'Kode verifikasi tidak valid.');
    }
  };

  const handleResendCode = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setIsSubmitting(true);
    const res = await resendCode(pendingIdentifier || pendingEmail);
    setIsSubmitting(false);

    if (!res.ok) {
      setErrorMsg(res.error || 'Gagal mengirim ulang kode.');
      return;
    }
    if (res.verificationPreview) {
      setEmailPreview(res.verificationPreview);
    }
    setInfoMsg(`Kode verifikasi baru dikirim ulang ke ${pendingEmail}.`);
  };

  return (
    <div className="min-h-screen bg-[#fbf8ff] text-[#1a1b22] flex flex-col lg:flex-row">
      {/* Left Brand Showcase Panel */}
      <div className="lg:w-[46%] bg-[#00529C] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 20%, #38bdf8 0%, transparent 45%), radial-gradient(circle at 85% 85%, #F37021 0%, transparent 42%)',
          }}
        />

        <div className="relative z-10 space-y-10">
          <BriLogo theme="dark" />

          <div className="space-y-4 max-w-lg">
            <p className="text-xs font-semibold tracking-wider text-[#93c5fd]">
              BANK RAKYAT INDONESIA · PORTAL LOKASI NASIONAL
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight text-balance">
              Sinkronisasi Master Data Unit Kerja & Google Maps
            </h1>
            <p className="text-sm sm:text-base text-white/80 leading-relaxed">
              Kelola informasi resmi jaringan KC, KCP, BRI Unit, dan Teras BRI di seluruh
              Indonesia. Perubahan pada master data otomatis diajukan ke antrean review Google
              Maps dan ulasan nasabah terpantau secara langsung.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-10 pt-8 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <p className="font-mono text-2xl font-bold tabular-nums">10.000+</p>
            <p className="text-xs text-white/75 mt-0.5">Titik Layanan Terindeks</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-bold tabular-nums">18 RO</p>
            <p className="text-xs text-white/75 mt-0.5">Kantor Wilayah BRI</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-bold tabular-nums">Live</p>
            <p className="text-xs text-white/75 mt-0.5">Peta & Ulasan Google Maps</p>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-md space-y-6">
          {/* Mode Switcher Tabs (Masuk / Tambah Akun) */}
          {mode !== 'verify' && (
            <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#f1f5f9] border border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`h-10 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 smooth-transition whitespace-nowrap ${
                  mode === 'login'
                    ? 'bg-white text-[#00529C] shadow-xs'
                    : 'text-[#444653] hover:text-[#1a1b22]'
                }`}
              >
                <KeyRound className="h-4 w-4 shrink-0" />
                <span>Masuk</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`h-10 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 smooth-transition whitespace-nowrap ${
                  mode === 'register'
                    ? 'bg-white text-[#00529C] shadow-xs'
                    : 'text-[#444653] hover:text-[#1a1b22]'
                }`}
              >
                <UserPlus className="h-4 w-4 shrink-0" />
                <span>Tambah Akun</span>
              </button>
            </div>
          )}

          {/* Error & Info Alerts */}
          {errorMsg && (
            <div
              role="alert"
              className="rounded-2xl bg-[#fef2f2] border border-[#fecaca] p-4 flex items-start gap-3 text-xs text-[#991b1b]"
            >
              <AlertCircle className="h-4 w-4 text-[#dc2626] shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="rounded-2xl bg-[#eff6ff] border border-[#bfdbfe] p-4 flex items-start gap-3 text-xs text-[#1e40af]">
              <CheckCircle2 className="h-4 w-4 text-[#2563eb] shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          {/* MODE 1: LOGIN (Username & Password saja) */}
          {mode === 'login' && (
            <div className="rounded-3xl bg-white border border-[#e2e8f0] p-7 sm:p-8 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] space-y-6">
              <div className="space-y-1.5">
                <h2 className="font-display text-2xl font-bold text-[#1a1b22]">
                  Masuk Operator BRI
                </h2>
                <p className="text-xs text-[#64748b]">
                  Gunakan username dan password unit kerja Anda untuk mengakses dasbor.
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#444653]">Username</span>
                  <div className="relative">
                    <User className="h-4 w-4 text-[#64748b] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      autoComplete="username"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="brioutlet"
                      className="w-full h-11 pl-11 pr-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-sm text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
                    />
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#444653]">Password</span>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-[#64748b] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showLoginPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="•••••"
                      className="w-full h-11 pl-11 pr-11 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-sm text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPass((v) => !v)}
                      aria-label={showLoginPass ? 'Sembunyikan password' : 'Lihat password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1a1b22]"
                    >
                      {showLoginPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 rounded-2xl bg-[#00529C] hover:bg-[#004080] active:bg-[#003366] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 smooth-transition disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Memverifikasi...</span>
                    </>
                  ) : (
                    <span>Masuk ke Dasbor</span>
                  )}
                </button>
              </form>

              {/* Example Credentials Box */}
              <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-4 flex items-center justify-between gap-3">
                <div className="space-y-0.5 text-xs">
                  <p className="font-semibold text-[#1a1b22]">Contoh Akun Demo</p>
                  <p className="font-mono text-[#444653] tabular-nums">
                    username: <span className="font-bold text-[#00529C]">brioutlet</span> · pass:{' '}
                    <span className="font-bold text-[#00529C]">11111</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleFillExample}
                  className="h-9 px-3.5 rounded-xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] smooth-transition whitespace-nowrap shrink-0"
                >
                  Isi Contoh
                </button>
              </div>
            </div>
          )}

          {/* MODE 2: TAMBAH AKUN (Register + Wajib Email & Verifikasi) */}
          {mode === 'register' && (
            <div className="rounded-3xl bg-white border border-[#e2e8f0] p-7 sm:p-8 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] space-y-6">
              <div className="space-y-1.5">
                <h2 className="font-display text-2xl font-bold text-[#1a1b22]">
                  Tambah Akun Baru
                </h2>
                <p className="text-xs text-[#64748b]">
                  Daftarkan akun operator baru. Alamat email wajib diverifikasi sebelum dapat masuk.
                </p>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#444653]">Nama Lengkap / Unit</span>
                  <input
                    type="text"
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="Contoh: Petugas KC Veteran"
                    className="w-full h-11 px-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-sm text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#444653]">Username</span>
                  <div className="relative">
                    <User className="h-4 w-4 text-[#64748b] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="contoh: bri_kanwil1"
                      required
                      className="w-full h-11 pl-11 pr-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-sm text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
                    />
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#444653]">
                    Alamat Email (Untuk Verifikasi)
                  </span>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-[#64748b] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="nama@bri.co.id"
                      required
                      className="w-full h-11 pl-11 pr-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-sm text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
                    />
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#444653]">Password</span>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-[#64748b] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showRegPass ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Minimal 5 karakter"
                      required
                      className="w-full h-11 pl-11 pr-11 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-sm text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPass((v) => !v)}
                      aria-label={showRegPass ? 'Sembunyikan password' : 'Lihat password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1a1b22]"
                    >
                      {showRegPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 rounded-2xl bg-[#00529C] hover:bg-[#004080] active:bg-[#003366] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 smooth-transition disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Mengirim Kode Verifikasi...</span>
                    </>
                  ) : (
                    <span>Daftar & Kirim Verifikasi Email</span>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* MODE 3: VERIFIKASI EMAIL */}
          {mode === 'verify' && (
            <div className="rounded-3xl bg-white border border-[#e2e8f0] p-7 sm:p-8 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="h-11 w-11 rounded-2xl bg-[#eff6ff] text-[#00529C] flex items-center justify-center mb-3">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <h2 className="font-display text-2xl font-bold text-[#1a1b22]">
                    Verifikasi Email Anda
                  </h2>
                  <p className="text-xs text-[#64748b]">
                    Masukkan kode 6 digit yang dikirim ke{' '}
                    <span className="font-semibold text-[#1a1b22]">{pendingEmail}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg(null);
                    setInfoMsg(null);
                  }}
                  className="h-9 px-3 rounded-xl border border-[#e2e8f0] text-xs font-medium text-[#444653] hover:bg-[#f8fafc] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Kembali</span>
                </button>
              </div>

              <form onSubmit={handleVerifySubmit} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#444653]">
                    Kode Verifikasi 6 Digit
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full h-12 px-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-center text-xl font-bold tracking-[0.35em] text-[#1a1b22] placeholder:text-[#cbd5e1] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition tabular-nums"
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting || otpCode.length < 6}
                  className="w-full h-11 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 smooth-transition disabled:opacity-55"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Memverifikasi...</span>
                    </>
                  ) : (
                    <span>Verifikasi & Masuk</span>
                  )}
                </button>
              </form>

              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748b]">Belum menerima kode?</span>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleResendCode}
                  className="font-semibold text-[#00529C] hover:underline disabled:opacity-50"
                >
                  Kirim Ulang Kode
                </button>
              </div>

              {/* Sandbox Email Verification Preview Box */}
              {emailPreview && (
                <div className="rounded-2xl bg-[#fffbeb] border border-[#fde68a] p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#92400e] inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      Kotak Masuk Verifikasi Email
                    </span>
                    <span className="font-mono text-[11px] text-[#92400e]/80">
                      {emailPreview.sentAt}
                    </span>
                  </div>
                  <p className="text-[#78350f]">
                    Kepada: <span className="font-mono">{emailPreview.to}</span>
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[#78350f]">
                      Kode Anda:{' '}
                      <strong className="font-mono text-sm text-[#1a1b22] tabular-nums">
                        {emailPreview.code}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOtpCode(emailPreview.code)}
                      className="h-8 px-3 rounded-xl bg-white border border-[#fcd34d] text-[#92400e] font-semibold hover:bg-[#fef3c7] smooth-transition whitespace-nowrap"
                    >
                      Gunakan Kode
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
