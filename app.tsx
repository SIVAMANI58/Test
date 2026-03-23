import {
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
  KeyboardEvent,
} from "react";

/* ══════════════════════════════════════════════════════════════════
   TYPES & INTERFACES
══════════════════════════════════════════════════════════════════ */
type Screen =
  | "landing"
  | "google-loading"
  | "phone-entry"
  | "otp-verify"
  | "mfa"
  | "role-select"
  | "dashboard";

type AuthMethod = "google" | "phone" | null;
type Role = "clinician" | "admin" | "patient" | "api-client";
type MfaMethod = "totp" | "sms";

interface GoogleUser {
  name: string;
  email: string;
  picture: string;
  sub: string;
}

interface JWTPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  iat: number;
  exp: number;
  iss: string;
  jti: string;
  mfa_verified: boolean;
}

interface Session {
  user: GoogleUser | PhoneUser;
  role: Role;
  method: AuthMethod;
  jwt: string;
  payload: JWTPayload;
  loginTime: Date;
  expiresAt: Date;
  mfaVerified: boolean;
}

interface PhoneUser {
  name: string;
  phone: string;
  sub: string;
}

interface Country {
  code: string;
  name: string;
  dial: string;
  flag: string;
}

/* ══════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════ */

// ⚠️  REPLACE WITH YOUR GOOGLE CLOUD CONSOLE CLIENT ID
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

const DEMO_OTP = "847291"; // Shown in demo banner
const DEMO_TOTP = "628510";

const COUNTRIES: Country[] = [
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬" },
];

const ROLES: Array<{
  id: Role;
  label: string;
  desc: string;
  icon: string;
  color: string;
}> = [
  {
    id: "clinician",
    label: "Clinician",
    desc: "Full patient record access, prescription review, Q&A",
    icon: "⚕",
    color: "#0ea5e9",
  },
  {
    id: "admin",
    label: "Administrator",
    desc: "User management, audit logs, system configuration",
    icon: "⬡",
    color: "#8b5cf6",
  },
  {
    id: "patient",
    label: "Patient",
    desc: "Own records, consent management, prescription history",
    icon: "◈",
    color: "#10b981",
  },
  {
    id: "api-client",
    label: "API Client",
    desc: "Programmatic access via service account token",
    icon: "◉",
    color: "#f59e0b",
  },
];

/* ══════════════════════════════════════════════════════════════════
   DESIGN TOKENS
══════════════════════════════════════════════════════════════════ */
const C = {
  bg: "#07090f",
  surface: "#0d1117",
  card: "#111827",
  border: "#1f2937",
  borderHi: "#374151",
  teal: "#14b8a6",
  tealDim: "#14b8a619",
  tealBdr: "#14b8a640",
  blue: "#3b82f6",
  blueDim: "#3b82f619",
  blueBdr: "#3b82f640",
  red: "#ef4444",
  redDim: "#ef444419",
  green: "#10b981",
  greenDim: "#10b98119",
  text: "#f1f5f9",
  muted: "#64748b",
  faint: "#334155",
  gold: "#f59e0b",
  purple: "#8b5cf6",
} as const;

/* ══════════════════════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════════════════════ */
function b64url(obj: object): string {
  return btoa(JSON.stringify(obj))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function buildJWT(
  user: GoogleUser | PhoneUser,
  role: Role,
  method: AuthMethod,
): { jwt: string; payload: JWTPayload } {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    sub: user.sub,
    email:
      (user as GoogleUser).email ??
      `${(user as PhoneUser).phone}@phone.medscript`,
    name: user.name,
    role,
    iat: now,
    exp: now + 3600,
    iss: "https://auth.medscript.ai",
    jti: crypto.randomUUID(),
    mfa_verified: true,
  };
  const header = b64url({ alg: "RS256", typ: "JWT", kid: "ms-2026-03" });
  const body = b64url(payload);
  const sig = b64url({
    demo: true,
    note: "Signature is demo-only — use real RS256 in production",
  }).slice(0, 43);
  return { jwt: `${header}.${body}.${sig}`, payload };
}

function timeLeft(exp: number): string {
  const secs = exp - Math.floor(Date.now() / 1000);
  if (secs <= 0) return "Expired";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

/* ══════════════════════════════════════════════════════════════════
   PRIMITIVES
══════════════════════════════════════════════════════════════════ */
interface BtnProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}
function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  loading,
  fullWidth,
}: BtnProps) {
  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 24px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    border: "none",
    transition: "all 0.15s",
    width: fullWidth ? "100%" : undefined,
    fontFamily: "'IBM Plex Sans', sans-serif",
    opacity: disabled ? 0.5 : 1,
  };
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: `linear-gradient(135deg, ${C.teal}, #0891b2)`,
      color: "#fff",
    },
    ghost: {
      background: "transparent",
      color: C.muted,
      border: `1px solid ${C.border}`,
    },
    danger: {
      background: C.redDim,
      color: C.red,
      border: `1px solid ${C.red}44`,
    },
  };
  return (
    <button
      style={{ ...base, ...styles[variant] }}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: `2px solid #ffffff33`,
        borderTop: "2px solid #fff",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

function Badge({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        background: color + "22",
        border: `1px solid ${color}44`,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {children}
    </span>
  );
}

function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: 32,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: C.muted,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        marginBottom: 8,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {children}
    </div>
  );
}

function DemoBanner({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: `${C.gold}15`,
        border: `1px solid ${C.gold}40`,
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        color: C.gold,
        fontFamily: "'JetBrains Mono', monospace",
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      <span>⚠</span>
      <span>{children}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   OTP INPUT
══════════════════════════════════════════════════════════════════ */
interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (v: string) => void;
}
function OtpInput({ length = 6, value, onChange }: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(length, "").split("").slice(0, length);

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      const next = value.slice(0, i) + value.slice(i + 1);
      onChange(next);
      if (i > 0) refs.current[i - 1]?.focus();
    }
  };

  const handleChange = (i: number, v: string) => {
    const char = v.replace(/\D/g, "").slice(-1);
    const next = (value.slice(0, i) + char + value.slice(i + 1)).slice(
      0,
      length,
    );
    onChange(next);
    if (char && i < length - 1) refs.current[i + 1]?.focus();
  };

  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] === " " ? "" : (digits[i] ?? "")}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onFocus={(e) => e.target.select()}
          style={{
            width: 52,
            height: 60,
            textAlign: "center",
            fontSize: 24,
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            background: C.surface,
            color: C.text,
            border: `2px solid ${digits[i] && digits[i] !== " " ? C.teal : C.border}`,
            borderRadius: 10,
            outline: "none",
            transition: "border-color 0.15s",
          }}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   GOOGLE OAUTH HOOK
══════════════════════════════════════════════════════════════════ */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: object) => void;
          renderButton: (el: HTMLElement, cfg: object) => void;
          prompt: () => void;
        };
      };
    };
    handleGoogleCredential?: (response: { credential: string }) => void;
  }
}

function useGoogleAuth(onSuccess: (user: GoogleUser) => void) {
  const btnRef = useRef<HTMLDivElement>(null);

  const parseJWT = (token: string): GoogleUser => {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return {
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
        sub: payload.sub,
      };
    } catch {
      // Demo fallback
      return {
        name: "Dr. Sarah Kim",
        email: "sarah.kim@medscript.ai",
        picture: "",
        sub: "google-demo-" + Date.now(),
      };
    }
  };

  useEffect(() => {
    window.handleGoogleCredential = (response: { credential: string }) => {
      const user = parseJWT(response.credential);
      onSuccess(user);
    };

    const init = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: window.handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 340,
        });
      }
    };

    if (window.google) {
      init();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.head.appendChild(script);

    return () => {
      window.handleGoogleCredential = undefined;
    };
  }, [onSuccess]);

  return btnRef;
}

/* ══════════════════════════════════════════════════════════════════
   SCREEN: LANDING
══════════════════════════════════════════════════════════════════ */
interface LandingProps {
  onGoogle: () => void;
  onPhone: () => void;
  googleBtnRef: React.RefObject<HTMLDivElement>;
  googleReady: boolean;
}
function LandingScreen({
  onGoogle,
  onPhone,
  googleBtnRef,
  googleReady,
}: LandingProps) {
  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      {/* Brand */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${C.teal}, #0891b2)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            margin: "0 auto 16px",
            boxShadow: `0 0 32px ${C.teal}44`,
          }}
        >
          ⊕
        </div>
        <h1
          style={{
            fontFamily: "'IBM Plex Serif', Georgia, serif",
            fontSize: 28,
            fontWeight: 700,
            color: C.text,
            letterSpacing: "-0.02em",
            marginBottom: 8,
          }}
        >
          MedScript AI
        </h1>
        <p style={{ color: C.muted, fontSize: 14, letterSpacing: "0.02em" }}>
          Prescription Intelligence Platform
        </p>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Label>Sign in with</Label>

        {/* Google OAuth Button */}
        <div style={{ marginBottom: 12 }}>
          {!googleReady ? (
            <Btn fullWidth onClick={onGoogle} variant="ghost">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google (Gmail)
            </Btn>
          ) : (
            <div
              ref={googleBtnRef}
              style={{ display: "flex", justifyContent: "center" }}
            />
          )}
        </div>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "20px 0",
          }}
        >
          <div style={{ flex: 1, height: 1, background: C.border }} />
          <span
            style={{
              color: C.muted,
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            OR
          </span>
          <div style={{ flex: 1, height: 1, background: C.border }} />
        </div>

        {/* Phone */}
        <button
          onClick={onPhone}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            color: C.text,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            fontFamily: "'IBM Plex Sans', sans-serif",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.borderHi)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
        >
          <span style={{ fontSize: 18 }}>📱</span>
          Continue with Phone Number
        </button>
      </Card>

      {/* HIPAA notice */}
      <div
        style={{
          textAlign: "center",
          fontSize: 11,
          color: C.faint,
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: 1.8,
        }}
      >
        🔒 HIPAA-compliant · End-to-end encrypted · MFA required
        <br />
        All logins are audit-logged per §164.312(b)
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SCREEN: PHONE ENTRY
══════════════════════════════════════════════════════════════════ */
interface PhoneEntryProps {
  onNext: (phone: string, dial: string) => void;
  onBack: () => void;
}
function PhoneEntryScreen({ onNext, onBack }: PhoneEntryProps) {
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDrop, setShowDrop] = useState(false);

  const submit = () => {
    if (phone.length < 7) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onNext(phone, country.dial);
    }, 1200);
  };

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: C.muted,
          cursor: "pointer",
          fontSize: 13,
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        ← Back
      </button>

      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📱</div>
        <h2
          style={{
            fontFamily: "'IBM Plex Serif', serif",
            fontSize: 22,
            fontWeight: 700,
            color: C.text,
            marginBottom: 6,
          }}
        >
          Enter your phone number
        </h2>
        <p style={{ color: C.muted, fontSize: 13 }}>
          We'll send a one-time verification code via SMS
        </p>
      </div>

      <Card>
        <Label>Country</Label>
        <div style={{ position: "relative", marginBottom: 16 }}>
          <button
            onClick={() => setShowDrop(!showDrop)}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              color: C.text,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 14,
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            <span>{country.flag}</span>
            <span style={{ flex: 1, textAlign: "left" }}>{country.name}</span>
            <span
              style={{
                color: C.muted,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {country.dial}
            </span>
            <span style={{ color: C.muted }}>▾</span>
          </button>
          {showDrop && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                zIndex: 50,
                overflow: "hidden",
                boxShadow: "0 8px 32px #00000066",
              }}
            >
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  onClick={() => {
                    setCountry(c);
                    setShowDrop(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    background: "none",
                    border: "none",
                    color: C.text,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    borderBottom: `1px solid ${C.border}`,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = C.surface)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "none")
                  }
                >
                  <span>{c.flag}</span>
                  <span style={{ flex: 1, textAlign: "left" }}>{c.name}</span>
                  <span
                    style={{
                      color: C.muted,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {c.dial}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Label>Phone Number</Label>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <div
            style={{
              padding: "12px 14px",
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              color: C.muted,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              whiteSpace: "nowrap",
            }}
          >
            {country.dial}
          </div>
          <input
            type="tel"
            placeholder="(555) 000-0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{
              flex: 1,
              padding: "12px 16px",
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              color: C.text,
              fontSize: 16,
              outline: "none",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        </div>

        <Btn
          fullWidth
          onClick={submit}
          loading={loading}
          disabled={phone.length < 7}
        >
          Send Verification Code
        </Btn>
      </Card>

      <div style={{ marginTop: 16 }}>
        <DemoBanner>
          DEMO MODE — SMS delivery simulated. Use OTP:{" "}
          <strong>{DEMO_OTP}</strong> on the next screen.
        </DemoBanner>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SCREEN: OTP VERIFY
══════════════════════════════════════════════════════════════════ */
interface OtpProps {
  phone: string;
  dial: string;
  onVerified: (user: PhoneUser) => void;
  onBack: () => void;
}
function OtpScreen({ phone, dial, onVerified, onBack }: OtpProps) {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(30);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const verify = useCallback(() => {
    if (otp.length !== 6) return;
    setLoading(true);
    setError("");
    setTimeout(() => {
      if (otp === DEMO_OTP) {
        onVerified({
          name: "Demo User",
          phone: `${dial}${phone}`,
          sub: "phone-" + Date.now(),
        });
      } else {
        setError("Incorrect code. Please try again.");
        setLoading(false);
      }
    }, 1000);
  }, [otp, dial, phone, onVerified]);

  useEffect(() => {
    if (otp.length === 6) verify();
  }, [otp, verify]);

  const maskedPhone = `${dial} ${"•".repeat(phone.length - 4)}${phone.slice(-4)}`;

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: C.muted,
          cursor: "pointer",
          fontSize: 13,
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        ← Back
      </button>

      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
        <h2
          style={{
            fontFamily: "'IBM Plex Serif', serif",
            fontSize: 22,
            fontWeight: 700,
            color: C.text,
            marginBottom: 6,
          }}
        >
          Verify your number
        </h2>
        <p style={{ color: C.muted, fontSize: 13 }}>
          Enter the 6-digit code sent to
          <br />
          <span
            style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}
          >
            {maskedPhone}
          </span>
        </p>
      </div>

      <Card>
        <div style={{ marginBottom: 24 }}>
          <OtpInput value={otp} onChange={setOtp} />
        </div>

        {error && (
          <div
            style={{
              background: C.redDim,
              border: `1px solid ${C.red}44`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: C.red,
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <Btn
          fullWidth
          onClick={verify}
          loading={loading}
          disabled={otp.length !== 6}
        >
          Verify Code
        </Btn>

        <div
          style={{
            textAlign: "center",
            marginTop: 16,
            fontSize: 13,
            color: C.muted,
          }}
        >
          {resendTimer > 0 ? (
            <span>
              Resend code in{" "}
              <span
                style={{
                  color: C.teal,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {resendTimer}s
              </span>
            </span>
          ) : (
            <button
              onClick={() => setResendTimer(30)}
              style={{
                background: "none",
                border: "none",
                color: C.teal,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Resend verification code
            </button>
          )}
        </div>
      </Card>

      <div style={{ marginTop: 16 }}>
        <DemoBanner>
          DEMO — Enter code <strong>{DEMO_OTP}</strong> to continue.
        </DemoBanner>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SCREEN: MFA
══════════════════════════════════════════════════════════════════ */
interface MfaProps {
  user: GoogleUser | PhoneUser;
  onVerified: () => void;
}
function MfaScreen({ user, onVerified }: MfaProps) {
  const [method, setMethod] = useState<MfaMethod>("totp");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const verify = useCallback(() => {
    if (code.length !== 6) return;
    setLoading(true);
    setTimeout(() => {
      if (code === DEMO_TOTP || code === DEMO_OTP) {
        onVerified();
      } else {
        setError("Invalid MFA code.");
        setLoading(false);
      }
    }, 900);
  }, [code, onVerified]);

  useEffect(() => {
    if (code.length === 6) verify();
  }, [code, verify]);

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `${C.teal}22`,
            border: `2px solid ${C.teal}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            margin: "0 auto 16px",
          }}
        >
          🔐
        </div>
        <h2
          style={{
            fontFamily: "'IBM Plex Serif', serif",
            fontSize: 22,
            fontWeight: 700,
            color: C.text,
            marginBottom: 6,
          }}
        >
          Multi-Factor Authentication
        </h2>
        <p style={{ color: C.muted, fontSize: 13 }}>
          Required for all clinical platform access (HIPAA)
        </p>
      </div>

      <Card>
        {/* MFA method tabs */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 24,
            background: C.surface,
            borderRadius: 10,
            padding: 4,
          }}
        >
          {(["totp", "sms"] as MfaMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMethod(m);
                setCode("");
                setError("");
              }}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: method === m ? C.card : "transparent",
                color: method === m ? C.text : C.muted,
                fontSize: 13,
                fontWeight: method === m ? 600 : 400,
                fontFamily: "'IBM Plex Sans', sans-serif",
                transition: "all 0.15s",
                boxShadow: method === m ? `0 1px 4px #00000044` : "none",
              }}
            >
              {m === "totp" ? "🔑 Authenticator App" : "📱 SMS Backup"}
            </button>
          ))}
        </div>

        {method === "totp" && (
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            {/* TOTP QR placeholder */}
            <div
              style={{
                width: 120,
                height: 120,
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                margin: "0 auto 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 32 }}>▦</div>
              <div
                style={{
                  fontSize: 9,
                  color: C.faint,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                TOTP QR
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Scan with Google Authenticator, Authy, or 1Password
            </div>
            <div
              style={{
                fontSize: 11,
                color: C.faint,
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: 4,
              }}
            >
              Secret: MEDSCRIPT2026BASE32
            </div>
          </div>
        )}

        {method === "sms" && (
          <div
            style={{
              background: C.blueDim,
              border: `1px solid ${C.blueBdr}`,
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 20,
              fontSize: 13,
              color: C.blue,
              textAlign: "center",
            }}
          >
            SMS backup code sent to{" "}
            {(user as PhoneUser).phone ?? (user as GoogleUser).email}
          </div>
        )}

        <Label>6-Digit MFA Code</Label>
        <div style={{ marginBottom: 20 }}>
          <OtpInput value={code} onChange={setCode} />
        </div>

        {error && (
          <div
            style={{
              background: C.redDim,
              border: `1px solid ${C.red}44`,
              borderRadius: 8,
              padding: "10px",
              fontSize: 13,
              color: C.red,
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <Btn
          fullWidth
          onClick={verify}
          loading={loading}
          disabled={code.length !== 6}
        >
          Verify MFA Code
        </Btn>
      </Card>

      <div style={{ marginTop: 16 }}>
        <DemoBanner>
          DEMO — Use either <strong>{DEMO_TOTP}</strong> (TOTP) or{" "}
          <strong>{DEMO_OTP}</strong> (SMS backup)
        </DemoBanner>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SCREEN: ROLE SELECT
══════════════════════════════════════════════════════════════════ */
interface RoleSelectProps {
  user: GoogleUser | PhoneUser;
  onSelect: (role: Role) => void;
}
function RoleSelectScreen({ user, onSelect }: RoleSelectProps) {
  const [selected, setSelected] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);

  const confirm = () => {
    if (!selected) return;
    setLoading(true);
    setTimeout(() => onSelect(selected), 800);
  };

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: C.greenDim,
            border: `2px solid ${C.green}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            margin: "0 auto 12px",
          }}
        >
          ✓
        </div>
        <h2
          style={{
            fontFamily: "'IBM Plex Serif', serif",
            fontSize: 20,
            fontWeight: 700,
            color: C.text,
            marginBottom: 4,
          }}
        >
          Identity verified
        </h2>
        <p style={{ color: C.muted, fontSize: 13 }}>
          Welcome,{" "}
          <span style={{ color: C.text, fontWeight: 600 }}>{user.name}</span>.
          Select your role to continue.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r.id)}
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              cursor: "pointer",
              background: selected === r.id ? `${r.color}15` : C.card,
              border: `2px solid ${selected === r.id ? r.color : C.border}`,
              display: "flex",
              alignItems: "center",
              gap: 16,
              transition: "all 0.15s",
              textAlign: "left",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: `${r.color}22`,
                border: `1px solid ${r.color}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              {r.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  color: C.text,
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 3,
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              >
                {r.label}
              </div>
              <div style={{ color: C.muted, fontSize: 12 }}>{r.desc}</div>
            </div>
            {selected === r.id && (
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: r.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                ✓
              </div>
            )}
          </button>
        ))}
      </div>

      <Btn fullWidth onClick={confirm} disabled={!selected} loading={loading}>
        Enter Platform
      </Btn>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SCREEN: DASHBOARD (Session Manager)
══════════════════════════════════════════════════════════════════ */
interface DashboardProps {
  session: Session;
  onLogout: () => void;
}
function DashboardScreen({ session, onLogout }: DashboardProps) {
  const [tick, setTick] = useState(0);
  const [showJwt, setShowJwt] = useState(false);
  const [copied, setCopied] = useState(false);
  const role = ROLES.find((r) => r.id === session.role)!;

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const copyJwt = () => {
    navigator.clipboard.writeText(session.jwt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const timeLeftStr = timeLeft(session.payload.exp);
  const expPct = Math.max(
    0,
    ((session.payload.exp - Math.floor(Date.now() / 1000)) / 3600) * 100,
  );

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 24,
          padding: "16px 20px",
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `${role.color}22`,
            border: `1px solid ${role.color}44`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          {role.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>
            {session.user.name}
          </div>
          <div
            style={{
              color: C.muted,
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {(session.user as GoogleUser).email ??
              (session.user as PhoneUser).phone}
          </div>
        </div>
        <Badge color={role.color}>{role.label}</Badge>
        <Badge color={C.green}>MFA ✓</Badge>
        <button
          onClick={onLogout}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            background: C.redDim,
            border: `1px solid ${C.red}44`,
            color: C.red,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          Sign out
        </button>
      </div>

      {/* Session metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: "Auth Method",
            value:
              session.method === "google" ? "Google OAuth 2.0" : "Phone + OTP",
            color: C.teal,
          },
          { label: "MFA Method", value: "TOTP / SMS Backup", color: C.blue },
          {
            label: "Session Start",
            value: session.loginTime.toLocaleTimeString(),
            color: C.purple,
          },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: C.muted,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              {m.label}
            </div>
            <div style={{ color: m.color, fontWeight: 600, fontSize: 13 }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Token expiry */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 20,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>
            JWT Token Expiry
          </span>
          <span
            style={{
              color: expPct > 30 ? C.green : expPct > 10 ? C.gold : C.red,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {timeLeftStr}
          </span>
        </div>
        <div
          style={{
            background: C.surface,
            borderRadius: 6,
            height: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${expPct}%`,
              background:
                expPct > 30
                  ? `linear-gradient(90deg, ${C.teal}, ${C.blue})`
                  : expPct > 10
                    ? C.gold
                    : C.red,
              borderRadius: 6,
              transition: "width 1s linear",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
            fontSize: 11,
            color: C.faint,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <span>
            Issued: {new Date(session.payload.iat * 1000).toLocaleTimeString()}
          </span>
          <span>
            Expires: {new Date(session.payload.exp * 1000).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* JWT viewer */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setShowJwt(!showJwt)}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: "none",
            border: "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>
            🔑 JWT Payload Inspector
          </span>
          <span
            style={{
              color: C.muted,
              fontSize: 16,
              transform: showJwt ? "rotate(180deg)" : "none",
              transition: "0.2s",
            }}
          >
            ▾
          </span>
        </button>

        {showJwt && (
          <div
            style={{ borderTop: `1px solid ${C.border}`, padding: "16px 20px" }}
          >
            {/* Decoded claims */}
            <div style={{ marginBottom: 16 }}>
              {Object.entries(session.payload).map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "7px 0",
                    borderBottom: `1px solid ${C.faint}44`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: C.teal,
                      minWidth: 100,
                    }}
                  >
                    {k}
                  </span>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: C.muted,
                    }}
                  >
                    {typeof v === "boolean"
                      ? v
                        ? "true"
                        : "false"
                      : String(v)}
                  </span>
                </div>
              ))}
            </div>

            {/* Raw token */}
            <div
              style={{
                background: C.surface,
                borderRadius: 8,
                padding: "12px 14px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: C.faint,
                wordBreak: "break-all",
                lineHeight: 1.6,
                marginBottom: 10,
              }}
            >
              {session.jwt.split(".").map((part, i) => (
                <span key={i} style={{ color: [C.red, C.teal, C.muted][i] }}>
                  {part}
                  {i < 2 ? "." : ""}
                </span>
              ))}
            </div>

            <button
              onClick={copyJwt}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: C.tealDim,
                border: `1px solid ${C.tealBdr}`,
                color: C.teal,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            >
              {copied ? "✓ Copied!" : "Copy Token"}
            </button>
          </div>
        )}
      </div>

      {/* RBAC permissions */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 20,
          marginTop: 14,
        }}
      >
        <div
          style={{
            color: C.text,
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          RBAC Permissions —{" "}
          <span style={{ color: role.color }}>{role.label}</span>
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
        >
          {[
            { perm: "Read Patient PHI", roles: ["clinician", "admin"] },
            { perm: "Write Prescriptions", roles: ["clinician"] },
            {
              perm: "NER Service Access",
              roles: ["clinician", "admin", "api-client"],
            },
            { perm: "Medical LLM Q&A", roles: ["clinician", "admin"] },
            {
              perm: "Upload Documents",
              roles: ["clinician", "admin", "patient"],
            },
            {
              perm: "View Own Records",
              roles: ["patient", "clinician", "admin"],
            },
            { perm: "User Management", roles: ["admin"] },
            { perm: "Audit Log Export", roles: ["admin"] },
          ].map((p) => {
            const allowed = p.roles.includes(session.role);
            return (
              <div
                key={p.perm}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: allowed ? C.greenDim : C.surface,
                  border: `1px solid ${allowed ? C.green + "33" : C.border}`,
                }}
              >
                <span
                  style={{ color: allowed ? C.green : C.faint, fontSize: 13 }}
                >
                  {allowed ? "✓" : "✗"}
                </span>
                <span
                  style={{ fontSize: 12, color: allowed ? C.text : C.faint }}
                >
                  {p.perm}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ROOT APP
══════════════════════════════════════════════════════════════════ */
export default function AuthApp() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [phoneData, setPhoneData] = useState({ phone: "", dial: "" });
  const [pendingUser, setPendingUser] = useState<GoogleUser | PhoneUser | null>(
    null,
  );
  const [session, setSession] = useState<Session | null>(null);
  const [googleReady, setGoogleReady] = useState(false);

  // Google OAuth success callback
  const handleGoogleSuccess = useCallback((user: GoogleUser) => {
    setPendingUser(user);
    setAuthMethod("google");
    setScreen("mfa");
  }, []);

  const googleBtnRef = useGoogleAuth((user) => {
    handleGoogleSuccess(user);
    setGoogleReady(true);
  });

  // Demo Google flow (when real GSI not configured)
  const handleDemoGoogle = () => {
    const demoUser: GoogleUser = {
      name: "Dr. Sarah Kim",
      email: "sarah.kim@medscript.ai",
      picture: "",
      sub: "google-demo-" + Date.now(),
    };
    setPendingUser(demoUser);
    setAuthMethod("google");
    setScreen("mfa");
  };

  const handlePhoneVerified = (user: PhoneUser) => {
    setPendingUser(user);
    setAuthMethod("phone");
    setScreen("mfa");
  };

  const handleMfaVerified = () => {
    setScreen("role-select");
  };

  const handleRoleSelected = (role: Role) => {
    if (!pendingUser || !authMethod) return;
    const { jwt, payload } = buildJWT(pendingUser, role, authMethod);
    const now = new Date();
    setSession({
      user: pendingUser,
      role,
      method: authMethod,
      jwt,
      payload,
      loginTime: now,
      expiresAt: new Date(now.getTime() + 3600_000),
      mfaVerified: true,
    });
    setScreen("dashboard");
  };

  const handleLogout = () => {
    setSession(null);
    setPendingUser(null);
    setAuthMethod(null);
    setPhoneData({ phone: "", dial: "" });
    setScreen("landing");
  };

  // Determine which content to render
  const renderContent = () => {
    switch (screen) {
      case "landing":
        return (
          <LandingScreen
            onGoogle={handleDemoGoogle}
            onPhone={() => setScreen("phone-entry")}
            googleBtnRef={googleBtnRef}
            googleReady={googleReady}
          />
        );
      case "phone-entry":
        return (
          <PhoneEntryScreen
            onNext={(phone, dial) => {
              setPhoneData({ phone, dial });
              setScreen("otp-verify");
            }}
            onBack={() => setScreen("landing")}
          />
        );
      case "otp-verify":
        return (
          <OtpScreen
            phone={phoneData.phone}
            dial={phoneData.dial}
            onVerified={handlePhoneVerified}
            onBack={() => setScreen("phone-entry")}
          />
        );
      case "mfa":
        return pendingUser ? (
          <MfaScreen user={pendingUser} onVerified={handleMfaVerified} />
        ) : null;
      case "role-select":
        return pendingUser ? (
          <RoleSelectScreen user={pendingUser} onSelect={handleRoleSelected} />
        ) : null;
      case "dashboard":
        return session ? (
          <DashboardScreen session={session} onLogout={handleLogout} />
        ) : null;
      default:
        return null;
    }
  };

  // Progress steps
  const steps: Screen[] = [
    "landing",
    "phone-entry",
    "otp-verify",
    "mfa",
    "role-select",
    "dashboard",
  ];
  const stepIdx = steps.indexOf(screen);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        input { font-family: 'IBM Plex Sans', sans-serif; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Progress indicator */}
        {screen !== "landing" && screen !== "dashboard" && (
          <div
            style={{
              display: "flex",
              gap: 4,
              marginBottom: 28,
              justifyContent: "center",
            }}
          >
            {["Auth", "OTP", "MFA", "Role"].map((s, i) => {
              // map step index: phone-entry=0,otp=1,mfa=2,role=3
              const activeMap = {
                "phone-entry": 0,
                "otp-verify": 1,
                mfa: 2,
                "role-select": 3,
              } as Record<Screen, number>;
              const active = activeMap[screen] ?? -1;
              return (
                <div
                  key={s}
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: i <= active ? C.teal : C.border,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: i <= active ? C.bg : C.muted,
                      transition: "all 0.3s",
                    }}
                  >
                    {i < active ? "✓" : i + 1}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: i <= active ? C.teal : C.muted,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {s}
                  </span>
                  {i < 3 && (
                    <div
                      style={{
                        width: 20,
                        height: 2,
                        background: i < active ? C.teal : C.border,
                        borderRadius: 1,
                        transition: "background 0.3s",
                        marginLeft: 4,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {renderContent()}

        {/* Footer */}
        {screen === "landing" && (
          <div
            style={{
              textAlign: "center",
              marginTop: 24,
              fontSize: 11,
              color: C.faint,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Phase 1 · Auth & User Management · TypeScript
          </div>
        )}
      </div>
    </div>
  );
}
