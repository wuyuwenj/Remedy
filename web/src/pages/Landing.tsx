import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

const features = [
  {
    icon: '✨',
    title: 'AI-Powered Analysis',
    desc: 'Gemini analyzes your performance traces to pinpoint exactly what slows your site down.',
  },
  {
    icon: '⚡',
    title: 'Real Fixes, Real Proof',
    desc: 'Tests each optimization with Chrome traces so you see measured before-and-after results.',
  },
  {
    icon: '📊',
    title: 'Share Results',
    desc: 'One-click shareable reports to show your team the improvements you made.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      navigate(`/analyze/${data.reportId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 24px 40px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: 'absolute',
            top: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div className="fade-in-up" style={{ position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#6366f115',
              border: '1px solid #6366f130',
              borderRadius: 20,
              padding: '6px 16px',
              fontSize: 13,
              color: '#a5b4fc',
              fontWeight: 500,
              marginBottom: 32,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1' }} />
            Autonomous Performance Agent
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              marginBottom: 20,
              background: 'linear-gradient(135deg, #e2e8f0 0%, #6366f1 50%, #a5b4fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Remedy
          </h1>

          {/* Tagline */}
          <p
            style={{
              fontSize: 20,
              color: '#94a3b8',
              maxWidth: 580,
              margin: '0 auto 48px',
              lineHeight: 1.6,
              fontWeight: 400,
            }}
          >
            Every tool tells you what's wrong with your site.{' '}
            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
              Remedy fixes it and proves it worked.
            </span>
          </p>

          {/* URL Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              gap: 0,
              maxWidth: 580,
              margin: '0 auto',
              animation: 'glow 3s ease-in-out infinite',
              borderRadius: 14,
              padding: 3,
              background: 'linear-gradient(135deg, #6366f130, #2a2a4a, #6366f130)',
            }}
          >
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste any URL..."
              required
              style={{
                flex: 1,
                padding: '16px 20px',
                fontSize: 16,
                background: '#0f0f1a',
                color: '#e2e8f0',
                borderRadius: '12px 0 0 12px',
                border: 'none',
                minWidth: 0,
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '16px 32px',
                fontSize: 16,
                fontWeight: 700,
                background: loading
                  ? 'linear-gradient(135deg, #4f46e5, #6366f1)'
                  : 'linear-gradient(135deg, #6366f1, #818cf8)',
                color: '#fff',
                borderRadius: '0 12px 12px 0',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {loading && (
                <span
                  style={{
                    width: 16,
                    height: 16,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                    flexShrink: 0,
                  }}
                />
              )}
              {loading ? 'Starting...' : 'Analyze'}
            </button>
          </form>

          {/* Error message */}
          {error && (
            <div
              style={{
                marginTop: 16,
                color: '#ef4444',
                fontSize: 14,
                background: '#ef444415',
                padding: '8px 16px',
                borderRadius: 8,
                display: 'inline-block',
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Features */}
      <div
        className="stagger"
        style={{
          display: 'flex',
          gap: 20,
          maxWidth: 900,
          margin: '0 auto',
          padding: '0 24px 60px',
          width: '100%',
        }}
      >
        {features.map((f) => (
          <div
            key={f.title}
            className="fade-in-up"
            style={{
              flex: 1,
              background: '#1a1a2e',
              border: '1px solid #2a2a4a',
              borderRadius: 16,
              padding: 28,
              transition: 'border-color 0.2s, transform 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#6366f150';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#2a2a4a';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#e2e8f0',
                marginBottom: 8,
              }}
            >
              {f.title}
            </h3>
            <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          textAlign: 'center',
          padding: '24px',
          borderTop: '1px solid #1a1a2e',
          color: '#64748b',
          fontSize: 13,
        }}
      >
        Built for Google I/O 2026
      </div>
    </div>
  );
}
