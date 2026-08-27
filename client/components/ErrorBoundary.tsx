import React, { Component, ErrorInfo, ReactNode } from "react";
import { RefreshCw, Mail, Copy, Check, AlertTriangle } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

/**
 * Crash screen.
 *
 * Rewritten to drop the "Workspace Exception Guard" treatment, which had
 * three problems worth naming:
 *
 *  1. It claimed something untrue. A footer read "Alert sent to:
 *     chennadvp7799@gmail.com" beside a shield icon, but nothing is ever
 *     sent — there is no telemetry in this app, by design. The buttons only
 *     open a pre-filled draft *if the user clicks them*. Telling someone
 *     their crash was reported when it wasn't is the kind of detail that
 *     costs trust when they find out.
 *  2. It invented product surface that doesn't exist — "JSONField Shield
 *     v2.4", a security-product name and a version number for a feature
 *     that is one React class component.
 *  3. It was louder than the news it delivered: a rainbow gradient bar, an
 *     orbital-ring server illustration, a pulsing glow, glassmorphism, and
 *     two competing full-colour primary buttons. A crash screen should be
 *     calm and legible — the person reading it is already annoyed.
 *
 * It is also now theme-aware. The old one hardcoded a near-black slate
 * palette, so a light-mode user hit a black wall.
 */
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
    console.error("Uncaught error in JSONField React tree:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  /** Recover in place, without a reload — the document may survive. */
  private handleDismiss = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  private buildReport = () =>
    [
      "[JSONField error report]",
      `Message: ${this.state.error?.message ?? "unknown"}`,
      `Time:    ${new Date().toISOString()}`,
      `Agent:   ${navigator.userAgent}`,
      "",
      "Stack:",
      this.state.error?.stack ?? "unavailable",
      "",
      "Component stack:",
      this.state.errorInfo?.componentStack ?? "unavailable",
    ].join("\n");

  private handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(this.buildReport());
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      /* clipboard unavailable — the textarea below is still selectable */
    }
  };

  public render() {
    if (!this.state.hasError) return this.props.children;

    const message = this.state.error?.message || "An unexpected runtime error occurred.";
    const stack = this.state.error?.stack || "No stack trace available.";
    const mailto = `mailto:chennadvp7799@gmail.com?subject=${encodeURIComponent(
      "[JSONField] Error report"
    )}&body=${encodeURIComponent(this.buildReport())}`;

    return (
      <div className="blueprint-ground flex min-h-screen w-full items-center justify-center p-6 text-[var(--ink)]">
        <div className="panel w-full max-w-xl">
          {/* The single signal in the whole screen: one 2px rose edge. */}
          <div className="h-[2px] w-full bg-rose-500" />

          <div className="p-7">
            <p className="eyebrow flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle size={12} strokeWidth={2.5} /> Unhandled error
            </p>
            <h1 className="mt-3 text-[26px] font-extrabold leading-tight tracking-[-0.045em]">
              JSONField stopped unexpectedly
            </h1>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              Your documents and notes are held in this browser and were not
              touched by this error. Reloading is safe.
            </p>

            {/* Diagnostic, set in mono because it is machine output. */}
            <div className="mt-6">
              <p className="eyebrow">What went wrong</p>
              <p className="mt-2 break-words border-l-2 border-rose-500 bg-[var(--surface-soft)] py-2.5 pl-3 pr-3 font-mono text-[12px] leading-relaxed">
                {message}
              </p>
            </div>

            <details className="group mt-3">
              <summary className="chrome cursor-pointer list-none py-2 text-[var(--chrome-ink)] transition-colors hover:text-[var(--brand)]">
                Stack trace
                <span className="ml-2 inline-block transition-transform group-open:rotate-90">›</span>
              </summary>
              <pre className="mt-1 max-h-52 select-all overflow-auto border border-[var(--rule)] bg-[var(--surface-soft)] p-3 font-mono text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {stack}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>

            {/* One primary. The rest recede — same rule as the tool rack. */}
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <button
                onClick={this.handleReload}
                className="app-focus chrome flex h-9 items-center gap-2 bg-[var(--brand)] px-4 text-white transition-colors hover:bg-[var(--brand-hover)] dark:text-[#06201d]"
                style={{ borderRadius: "var(--r-edge)" }}
              >
                <RefreshCw size={14} /> Reload
              </button>
              <button
                onClick={this.handleDismiss}
                className="app-focus chrome flex h-9 items-center gap-2 px-3 text-[var(--chrome-ink)] transition-colors hover:text-[var(--brand)]"
                style={{ borderRadius: "var(--r-edge)" }}
              >
                Try to continue
              </button>
              <span className="mx-1 h-4 w-px bg-[var(--rule)]" />
              <button
                onClick={this.handleCopy}
                className="app-focus chrome flex h-9 items-center gap-2 px-3 text-[var(--chrome-ink)] transition-colors hover:text-[var(--brand)]"
                style={{ borderRadius: "var(--r-edge)" }}
              >
                {this.state.copied ? <Check size={14} /> : <Copy size={14} />}
                {this.state.copied ? "Copied" : "Copy report"}
              </button>
              <a
                href={mailto}
                className="app-focus chrome flex h-9 items-center gap-2 px-3 text-[var(--chrome-ink)] transition-colors hover:text-[var(--brand)]"
                style={{ borderRadius: "var(--r-edge)" }}
              >
                <Mail size={14} /> Email report
              </a>
            </div>

            {/* Honest footer. Replaces "Alert sent to: …", which was false. */}
            <p className="mt-6 border-t border-[var(--rule)] pt-4 text-[11px] leading-relaxed text-slate-400">
              Nothing was sent anywhere. JSONField has no crash reporting — if
              you want this looked at, use <span className="font-medium">Copy report</span> or{" "}
              <span className="font-medium">Email report</span> above.
            </p>
          </div>
        </div>
      </div>
    );
  }
}
