import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, ArrowRight, Camera, Share2, ShieldCheck, Sparkles,
  Gauge, CheckCircle2, FileBarChart, MousePointerClick, Cpu, Zap, Globe,
  TrendingDown, MonitorSmartphone,
} from "lucide-react";
import { useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: TraceBg
// ─────────────────────────────────────────────────────────────────────────────
function TraceBg() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none opacity-60"
      viewBox="0 0 1200 600"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="traceGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="oklch(0.82 0.16 215)" stopOpacity="0" />
          <stop offset="50%" stopColor="oklch(0.88 0.18 195)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="oklch(0.82 0.16 215)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        className="trace-path"
        d="M0,420 C150,420 200,180 360,180 C520,180 560,360 720,360 C880,360 920,140 1080,140 L1200,140"
        fill="none" stroke="url(#traceGrad)" strokeWidth="1.5"
      />
      <path
        className="trace-path"
        style={{ animationDelay: "-3s" }}
        d="M0,500 C200,500 260,300 420,300 C580,300 640,460 800,460 C960,460 1000,260 1200,260"
        fill="none" stroke="url(#traceGrad)" strokeWidth="1"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: Nav
// ─────────────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="relative z-20">
      <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2">
          <span
            className="grid place-items-center size-7 rounded-md"
            style={{ background: "var(--gradient-cyan)" }}
          >
            <Activity className="size-4 text-[color:var(--primary-foreground)]" />
          </span>
          <span className="font-semibold tracking-tight">Remedy</span>
          <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border border-white/10 rounded-full px-1.5 py-0.5">
            beta
          </span>
        </a>
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#product" className="hover:text-foreground transition-colors">Product</a>
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#demo" className="hover:text-foreground transition-colors">Demo</a>
        </nav>
        <div className="flex items-center gap-3">
          <a href="#cta" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors">
            Chrome Extension
          </a>
          <a
            href="#cta"
            className="text-sm font-medium rounded-md px-3.5 py-2 text-[color:var(--primary-foreground)]"
            style={{ background: "var(--gradient-cyan)" }}
          >
            Run Remedy
          </a>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: UrlForm
// ─────────────────────────────────────────────────────────────────────────────
function UrlForm({ cta = "Analyze a URL", size = "lg" }: { cta?: string; size?: "lg" | "md" }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padY = size === "lg" ? "py-3.5" : "py-2.5";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      navigate(`/analyze/${data.reportId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-2">
      <form
        onSubmit={handleSubmit}
        className="flex w-full items-center gap-2 panel p-1.5 pl-3 glow-cyan"
      >
        <Globe className="size-4 text-muted-foreground shrink-0" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-site.com"
          className={`flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60 text-sm font-mono ${padY}`}
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={loading}
          className="group inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2.5 text-sm font-medium text-[color:var(--primary-foreground)] transition-transform active:scale-[0.98] disabled:opacity-50"
          style={{ background: "var(--gradient-cyan)" }}
        >
          {loading ? "Starting..." : cta}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </form>
      {error && (
        <div className="text-sm text-[color:var(--color-bad)] bg-[color:var(--color-bad)]/10 px-3 py-1.5 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: MetricRow + useCountTo
// ─────────────────────────────────────────────────────────────────────────────
function useCountTo(target: number, { duration = 1400, start = 0, delay = 0 } = {}) {
  const [val, setVal] = useState(start);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    let t0: number | null = null;
    const startTime = performance.now() + delay;
    const step = (now: number) => {
      if (now < startTime) {
        raf.current = requestAnimationFrame(step);
        return;
      }
      if (t0 === null) t0 = now;
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(start + (target - start) * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration, start, delay]);
  return val;
}

type Tone = "bad" | "warn" | "improve";

function MetricRow({
  label, value, unit, tone, target, startFrom, decimals = 2, delay = 0,
}: {
  label: string;
  value: number;
  unit: string;
  tone: Tone;
  target?: number;
  startFrom?: number;
  decimals?: number;
  delay?: number;
}) {
  const animated = useCountTo(target ?? value, {
    start: startFrom ?? value,
    delay,
    duration: 1600,
  });
  const toneClass =
    tone === "bad" ? "text-[color:var(--color-bad)]"
    : tone === "warn" ? "text-[color:var(--color-warn)]"
    : "text-[color:var(--color-improve)]";

  const display = decimals === 0 ? Math.round(animated).toString() : animated.toFixed(decimals);

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm tabular-nums ${toneClass}`}>
        {display}<span className="text-muted-foreground ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: AgentLog
// ─────────────────────────────────────────────────────────────────────────────
const LINES = [
  { t: "trace", text: "Running baseline trace on /home..." },
  { t: "info", text: "Captured 1,284 events - 6 long tasks" },
  { t: "ai", text: "Gemini analyzing bottlenecks..." },
  { t: "fix", text: "Suggested: defer 3rd-party script (gtm.js)" },
  { t: "fix", text: "Suggested: preload hero image (LCP candidate)" },
  { t: "fix", text: "Suggested: reserve space for ad slot (CLS)" },
  { t: "run", text: "Applying selected fixes in sandbox..." },
  { t: "trace", text: "Re-running trace to verify delta..." },
  { t: "ok", text: "Verified: LCP -44% - CLS -76% - INP -47%" },
];

const tagColor: Record<string, string> = {
  trace: "text-[color:var(--color-cyan)]",
  info: "text-muted-foreground",
  ai: "text-[color:var(--color-cyan-glow)]",
  fix: "text-[color:var(--color-warn)]",
  run: "text-[color:var(--color-cyan)]",
  ok: "text-[color:var(--color-improve)]",
};

function AgentLog() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => {
      setCount((c) => (c >= LINES.length ? 1 : c + 1));
    }, 1100);
    return () => clearInterval(id);
  }, []);

  const visible = LINES.slice(0, count);
  const isDone = count === LINES.length;

  return (
    <div className="font-mono text-[12px] leading-relaxed">
      <div className="flex items-center gap-2 pb-3 border-b border-white/5 mb-3">
        <span className="size-2 rounded-full bg-[color:var(--color-improve)] pulse-dot" />
        <span className="text-muted-foreground">remedy://agent</span>
        <span className="ml-auto text-muted-foreground">{isDone ? "complete" : "live"}</span>
      </div>
      <div className="space-y-1.5 min-h-[220px]">
        {visible.map((l, i) => (
          <div key={`${count}-${i}`} className="log-line flex gap-3">
            <span className="text-muted-foreground/60 select-none">{String(i + 1).padStart(2, "0")}</span>
            <span className={`uppercase tracking-wider w-12 shrink-0 ${tagColor[l.t]}`}>{l.t}</span>
            <span className="text-foreground/90">
              {l.text}
              {i === visible.length - 1 && !isDone && <span className="caret ml-1">▍</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: HeroVisual
// ─────────────────────────────────────────────────────────────────────────────
function PanelTitle({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="size-2 rounded-full" style={{ background: dot }} />
      <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{children}</h4>
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative mt-16 fade-up" style={{ animationDelay: "200ms" }}>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr_1fr]">
        {/* Baseline */}
        <div className="panel p-5">
          <PanelTitle dot="oklch(0.68 0.22 25)">Baseline - before</PanelTitle>
          <MetricRow label="LCP" value={4.1} unit="s" tone="bad" decimals={1} />
          <MetricRow label="CLS" value={0.25} unit="" tone="bad" decimals={2} />
          <MetricRow label="INP" value={340} unit="ms" tone="bad" decimals={0} />
          <MetricRow label="TTFB" value={800} unit="ms" tone="warn" decimals={0} />
          <div className="mt-4 h-16 rounded-md bg-black/30 border border-white/5 overflow-hidden relative">
            <div className="absolute inset-0 shimmer" />
            <div className="absolute inset-0 flex items-end gap-0.5 p-2">
              {[8, 14, 6, 22, 18, 9, 30, 12, 26, 10, 24, 16, 28, 12, 8, 20, 14, 10, 24, 18].map((h, i) => (
                <div key={i} className="flex-1 rounded-sm" style={{ height: `${h * 2}%`, background: "oklch(0.68 0.22 25 / 0.6)" }} />
              ))}
            </div>
          </div>
        </div>

        {/* Agent */}
        <div className="panel p-5 relative overflow-hidden">
          <PanelTitle dot="oklch(0.82 0.16 215)">Remedy agent</PanelTitle>
          <AgentLog />
        </div>

        {/* Improved */}
        <div className="panel p-5 relative">
          <div className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full border border-[color:var(--color-improve)]/30 bg-[color:var(--color-improve)]/10 px-2.5 py-1 text-[11px] font-mono text-[color:var(--color-improve)]">
            <TrendingDown className="size-3" /> 44% LCP improvement
          </div>
          <PanelTitle dot="oklch(0.78 0.18 155)">Verified - after</PanelTitle>
          <MetricRow label="LCP" value={4.1} target={2.3} unit="s" tone="improve" decimals={1} delay={400} />
          <MetricRow label="CLS" value={0.25} target={0.06} unit="" tone="improve" decimals={2} delay={600} />
          <MetricRow label="INP" value={340} target={180} unit="ms" tone="improve" decimals={0} delay={800} />
          <MetricRow label="TTFB" value={800} target={420} unit="ms" tone="improve" decimals={0} delay={1000} />
          <div className="mt-4 h-16 rounded-md bg-black/30 border border-white/5 overflow-hidden relative">
            <div className="absolute inset-0 flex items-end gap-0.5 p-2">
              {[6, 8, 5, 10, 7, 6, 12, 8, 9, 6, 10, 8, 11, 7, 6, 9, 8, 6, 10, 7].map((h, i) => (
                <div key={i} className="flex-1 rounded-sm" style={{ height: `${h * 4}%`, background: "oklch(0.78 0.18 155 / 0.7)" }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: SectionLabel helper
// ─────────────────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
      <span className="size-1.5 rounded-full bg-[color:var(--color-cyan)] pulse-dot" />
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: Landing
// ─────────────────────────────────────────────────────────────────────────────
export default function Landing() {
  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 bg-hero" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[700px]">
        <TraceBg />
      </div>

      <Nav />

      {/* HERO */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-16 pb-10">
        <div className="flex flex-col items-center text-center">
          <div className="fade-up">
            <SectionLabel>Autonomous performance agent</SectionLabel>
          </div>

          <h1 className="fade-up mt-6 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-gradient max-w-4xl" style={{ animationDelay: "60ms" }}>
            Fix your site's performance.<br className="hidden sm:block" /> Prove it worked.
          </h1>

          <p className="fade-up mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground" style={{ animationDelay: "120ms" }}>
            Paste a URL. Remedy runs a real Chrome trace, suggests fixes,
            tests them safely, and shows measured Core Web Vitals improvements.
          </p>

          <div className="fade-up mt-8 w-full flex flex-col items-center gap-3" style={{ animationDelay: "180ms" }}>
            <UrlForm />
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
              <a
                href="#cta"
                className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3.5 py-2 text-foreground/90 hover:bg-white/[0.07] transition-colors"
              >
                <MonitorSmartphone className="size-4" />
                Install Chrome Extension
              </a>
              <span className="text-xs text-muted-foreground font-mono">
                Powered by Chrome DevTools MCP - Gemini - real browser traces
              </span>
            </div>
          </div>
        </div>

        <HeroVisual />
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="flex flex-col items-center text-center mb-12">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-gradient">
            Trace. Fix. Verify.
          </h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Three steps. One URL in, measured improvement out.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { n: "01", icon: Gauge, title: "Trace", desc: "Runs a real Chrome performance baseline with full trace events, long tasks, and Web Vitals." },
            { n: "02", icon: Sparkles, title: "Fix", desc: "Gemini ranks safe, client-side optimizations. You choose what to apply." },
            { n: "03", icon: CheckCircle2, title: "Verify", desc: "Re-runs the trace in a sandboxed session and proves the delta with before/after metrics." },
          ].map(({ n, icon: Icon, title, desc }) => (
            <div key={n} className="panel p-6 relative group">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">{n}</span>
                <Icon className="size-5 text-[color:var(--color-cyan)]" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRODUCT DEMO */}
      <section id="product" className="relative z-10 mx-auto max-w-7xl px-6 py-16">
        <div className="flex flex-col items-center text-center mb-12">
          <SectionLabel>Product</SectionLabel>
          <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-gradient">
            Two ways to fix. Same proof.
          </h2>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Website flow */}
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground mb-4">
              <Activity className="size-4 text-[color:var(--color-cyan)]" />
              Website flow
            </div>
            <h3 className="text-xl font-semibold">Paste - pick - share</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Drop a URL, review ranked fixes, generate a shareable report with before/after metrics and screenshots.
            </p>

            <div className="mt-5 rounded-lg border border-white/5 bg-black/30 overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5">
                <span className="size-2.5 rounded-full bg-[color:var(--color-bad)]/70" />
                <span className="size-2.5 rounded-full bg-[color:var(--color-warn)]/70" />
                <span className="size-2.5 rounded-full bg-[color:var(--color-improve)]/70" />
                <span className="ml-3 text-[11px] font-mono text-muted-foreground">remedy.app/report/8f3a</span>
              </div>
              <div className="p-4 space-y-3 font-mono text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Selected fixes</span>
                  <span className="text-[color:var(--color-improve)]">3 / 5 applied</span>
                </div>
                {[
                  ["Defer gtm.js until interaction", "+0.9s LCP"],
                  ["Preload hero image", "+0.6s LCP"],
                  ["Reserve ad slot dimensions", "-0.19 CLS"],
                ].map(([fix, gain]) => (
                  <div key={fix} className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
                    <span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-[color:var(--color-improve)]" />{fix}</span>
                    <span className="text-[color:var(--color-improve)]">{gain}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Extension flow */}
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground mb-4">
              <MonitorSmartphone className="size-4 text-[color:var(--color-cyan)]" />
              Chrome Extension flow
            </div>
            <h3 className="text-xl font-semibold">Analyze the current tab - live</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              One click to analyze any page you're on. Preview optimizations live in-page, then open the full report.
            </p>

            <div className="mt-5 rounded-lg border border-white/5 bg-black/30 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
                <MonitorSmartphone className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] font-mono text-muted-foreground">Remedy Extension</span>
                <span className="ml-auto text-[10px] font-mono text-[color:var(--color-improve)]">connected</span>
              </div>
              <div className="p-4 grid grid-cols-3 gap-2 font-mono text-[11px]">
                {[
                  { k: "LCP", v: "2.3s", d: "-44%" },
                  { k: "CLS", v: "0.06", d: "-76%" },
                  { k: "INP", v: "180ms", d: "-47%" },
                ].map((m) => (
                  <div key={m.k} className="rounded-md border border-white/5 bg-white/[0.02] p-3">
                    <div className="text-muted-foreground">{m.k}</div>
                    <div className="text-base text-foreground tabular-nums">{m.v}</div>
                    <div className="text-[color:var(--color-improve)]">{m.d}</div>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4 -mt-1 flex gap-2">
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] py-2 text-xs hover:bg-white/[0.07] transition-colors">
                  <MousePointerClick className="size-3.5" /> Preview live
                </button>
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-xs text-[color:var(--primary-foreground)]"
                  style={{ background: "var(--gradient-cyan)" }}>
                  <FileBarChart className="size-3.5" /> Open report
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="flex flex-col items-center text-center mb-12">
          <SectionLabel>Features</SectionLabel>
          <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-gradient">
            Built on real measurements, not vibes.
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Cpu, title: "Real Chrome traces", desc: "Full performance traces from real headless Chrome -- not synthetic Lighthouse guesses." },
            { icon: Sparkles, title: "Gemini-ranked fixes", desc: "Gemini 2.5 Flash ranks fixes by impact, safety, and effort. You see the reasoning." },
            { icon: ShieldCheck, title: "User-approved testing", desc: "Nothing ships without you. Pick fixes, run them in a sandboxed browser session." },
            { icon: Camera, title: "Before/after screenshots", desc: "Visual diffs at LCP, layout shift moments, and final paint -- side-by-side." },
            { icon: Share2, title: "Shareable reports", desc: "One link. Metrics, traces, screenshots, and the agent's reasoning -- ready for your team." },
            { icon: Zap, title: "Extension live preview", desc: "Apply optimizations to the page you're looking at and feel the difference instantly." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="panel p-5 hover:bg-white/[0.04] transition-colors">
              <Icon className="size-5 text-[color:var(--color-cyan)]" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HACKATHON / DEMO POSITIONING */}
      <section id="demo" className="relative z-10 mx-auto max-w-7xl px-6 py-16">
        <div className="panel p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute -inset-px rounded-[inherit] pointer-events-none" style={{
            background: "radial-gradient(600px 200px at 20% 0%, oklch(0.82 0.16 215 / 0.18), transparent 60%)"
          }} />
          <div className="relative grid gap-8 md:grid-cols-3 items-start">
            <div className="md:col-span-1">
              <SectionLabel>Demo ready</SectionLabel>
              <h2 className="mt-4 text-2xl sm:text-3xl font-semibold tracking-tight text-gradient">
                Built for live demos.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Designed for 2-3 minutes on stage. No setup, no caveats -- just measurable wins.
              </p>
            </div>
            <div className="md:col-span-2 grid gap-3 sm:grid-cols-3">
              {[
                { k: "1 URL in", v: "Measured improvement out" },
                { k: "Agent autonomy", v: "with human control" },
                { k: "Proof, not promises", v: "verified Core Web Vitals" },
              ].map((c) => (
                <div key={c.k} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-cyan)]">{c.k}</div>
                  <div className="mt-1.5 text-sm text-foreground/90">{c.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="cta" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="flex flex-col items-center text-center">
          <SectionLabel>Get started</SectionLabel>
          <h2 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-gradient max-w-3xl">
            Stop diagnosing. Start fixing.
          </h2>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Every tool tells you what's wrong with your site. Remedy fixes it and proves it worked.
          </p>
          <div className="mt-8 w-full flex justify-center">
            <UrlForm cta="Run Remedy" />
          </div>
          <div className="mt-4 text-xs font-mono text-muted-foreground">
            No signup required for first run - Free during beta
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-white/5">
        <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-5 rounded" style={{ background: "var(--gradient-cyan)" }}>
              <Activity className="size-3 text-[color:var(--primary-foreground)]" />
            </span>
            <span className="text-foreground/90 font-medium">Remedy</span>
            <span className="text-muted-foreground">-- autonomous web performance agent</span>
          </div>
          <div className="flex items-center gap-5 font-mono text-xs">
            <a href="#" className="hover:text-foreground transition-colors">Docs</a>
            <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
            <a href="#" className="hover:text-foreground transition-colors flex items-center gap-1">
              Get Extension <ArrowRight className="size-3" />
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
