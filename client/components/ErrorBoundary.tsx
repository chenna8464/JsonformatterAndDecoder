import React, { Component, ErrorInfo, ReactNode } from "react";
import { RefreshCw, Mail, Copy, Check, ShieldAlert, Bug, Sparkles, Send, ExternalLink } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

/* Modern High-Tech Vector Illustration for System Recovery & Alert State */
function ServerRecoveryIllustration() {
  return (
    <div className="relative flex items-center justify-center py-2">
      {/* Background ambient glow pulse */}
      <div className="absolute h-32 w-48 rounded-full bg-rose-500/15 blur-2xl animate-pulse" />
      <div className="absolute h-24 w-36 rounded-full bg-teal-500/10 blur-xl" />

      <svg
        width="220"
        height="120"
        viewBox="0 0 220 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 drop-shadow-[0_10px_25px_rgba(244,63,94,0.25)]"
      >
        <defs>
          <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="100%" stopColor="#be123c" />
          </linearGradient>
          <linearGradient id="tealGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>
          <linearGradient id="cardBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Outer orbital signal rings */}
        <circle cx="110" cy="60" r="54" stroke="#f43f5e" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="4 4" />
        <circle cx="110" cy="60" r="42" stroke="#14b8a6" strokeOpacity="0.25" strokeWidth="1.5" />

        {/* Server Layer 1 (Base) */}
        <rect x="55" y="76" width="110" height="24" rx="7" fill="url(#cardBg)" stroke="#334155" strokeWidth="1.5" />
        <circle cx="68" cy="88" r="3.5" fill="#f43f5e" />
        <circle cx="78" cy="88" r="3.5" fill="#38bdf8" />
        <rect x="94" y="86" width="56" height="4" rx="2" fill="#334155" />

        {/* Server Layer 2 (Middle) */}
        <rect x="62" y="48" width="96" height="24" rx="7" fill="url(#cardBg)" stroke="#334155" strokeWidth="1.5" />
        <circle cx="73" cy="60" r="3.5" fill="#34d399" />
        <circle cx="83" cy="60" r="3.5" fill="#f43f5e" />
        <rect x="98" y="58" width="46" height="4" rx="2" fill="#334155" />

        {/* Central Glowing Shield Icon */}
        <g transform="translate(93, 14)">
          <rect x="0" y="0" width="34" height="34" rx="10" fill="url(#shieldGrad)" />
          {/* Shield Emblem */}
          <path
            d="M17 7L9 11V17C9 22 12.5 25.5 17 27C21.5 25.5 25 22 25 17V11L17 7Z"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M17 12V17" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <circle cx="17" cy="20.5" r="1" fill="#ffffff" />
        </g>

        {/* Floating JSON Code Brackets */}
        <g opacity="0.8" fill="#38bdf8" fontSize="11" fontFamily="monospace" fontWeight="bold">
          <text x="32" y="40">&#123; ... &#125;</text>
          <text x="162" y="90">"err"</text>
        </g>
      </svg>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in JSONDesk React tree:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
    window.location.reload();
  };

  private handleCopyDetails = async () => {
    const details = `[JSONDesk Error Report]\nError: ${this.state.error?.message}\nTime: ${new Date().toISOString()}\nStack:\n${this.state.error?.stack}\nComponentStack:\n${this.state.errorInfo?.componentStack}`;
    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Fallback
    }
  };

  public render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || "An unexpected runtime exception occurred.";
      const errorStack = this.state.error?.stack || "No stack trace available.";
      const recipientEmail = "chennadvp7799@gmail.com";
      const emailSubject = encodeURIComponent(`[JSONDesk Crash Alert] System Exception Report`);
      const emailBody = encodeURIComponent(
        `Hi Developer Team,\n\nJSONDesk encountered a runtime issue on my device.\n\nError Message:\n${errorMessage}\n\nTimestamp:\n${new Date().toISOString()}\n\nUser Agent:\n${navigator.userAgent}\n\nStack Trace:\n${errorStack}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || "N/A"}`
      );
      const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${recipientEmail}&su=${emailSubject}&body=${emailBody}`;
      const mailtoUrl = `mailto:${recipientEmail}?subject=${emailSubject}&body=${emailBody}`;

      return (
        <div className="min-h-screen w-full bg-[#070a11] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
          {/* Glassmorphic Card Container */}
          <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-[0_25px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl relative overflow-hidden">
            {/* Top decorative gradient bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-sky-500 to-teal-500" />

            {/* Modern Vector Server/Shield Illustration */}
            <ServerRecoveryIllustration />

            {/* Title & Headline */}
            <div className="text-center mt-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-400">
                <Sparkles size={13} />
                <span>JSONDesk System Recovery</span>
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
                Workspace Exception Guard
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-slate-400 max-w-md mx-auto">
                An isolated runtime issue occurred. Don't worry — all your saved JSON documents and notes remain 100% safe in your browser storage.
              </p>
            </div>

            {/* Error Message Diagnostic Snippet */}
            <div className="mt-6 rounded-2xl border border-rose-500/20 bg-slate-950/80 p-4 text-xs">
              <div className="flex items-center gap-2 font-bold text-rose-400 mb-1.5">
                <Bug size={15} /> Error Diagnostic:
              </div>
              <p className="font-mono text-slate-200 leading-5 break-all">{errorMessage}</p>
            </div>

            {/* Collapsible Stack Trace Details */}
            <div className="mt-3">
              <details className="group rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                <summary className="cursor-pointer font-semibold text-slate-300 hover:text-white flex items-center justify-between">
                  <span>View Technical Stack Trace & Logs</span>
                  <span className="text-[10px] text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-3 max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-400 whitespace-pre-wrap select-all">
                  {errorStack}
                  {this.state.errorInfo?.componentStack}
                </div>
              </details>
            </div>

            {/* Primary & Secondary Action Row */}
            <div className="mt-6 space-y-2.5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {/* Reload Workspace Button */}
                <button
                  onClick={this.handleReset}
                  className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-teal-600/25 transition hover:bg-teal-500 active:scale-[0.99]"
                >
                  <RefreshCw size={15} /> Reload Workspace
                </button>

                {/* Send Alert Email Button */}
                <a
                  href={gmailWebUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 active:scale-[0.99]"
                >
                  <Send size={15} /> Send Alert Email
                </a>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={mailtoUrl}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  <Mail size={14} /> Mail App
                </a>

                <button
                  onClick={this.handleCopyDetails}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  {this.state.copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{this.state.copied ? "Copied Logs" : "Copy Diagnostic"}</span>
                </button>
              </div>
            </div>

            {/* Bottom Developer Recipient Indicator */}
            <div className="mt-5 flex items-center justify-between border-t border-slate-800/80 pt-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <ShieldAlert size={13} className="text-teal-400" /> Alert sent to: <span className="font-mono font-bold text-slate-300">chennadvp7799@gmail.com</span>
              </span>
              <span className="font-medium">JSONDesk Shield v2.4</span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
