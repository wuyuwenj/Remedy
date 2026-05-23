interface BeforeAfterProps {
  beforeScreenshot?: string;
  afterScreenshot?: string;
}

function toSrc(data?: string): string | undefined {
  if (!data) return undefined;
  if (data.startsWith('data:')) return data;
  if (data.startsWith('http')) return data;
  return `data:image/png;base64,${data}`;
}

const placeholderStyle: React.CSSProperties = {
  background: '#0f0f1a',
  border: '1px dashed #2a2a4a',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#64748b',
  fontSize: 13,
  minHeight: 180,
  flex: 1,
};

export default function BeforeAfter({ beforeScreenshot, afterScreenshot }: BeforeAfterProps) {
  if (!beforeScreenshot && !afterScreenshot) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          color: '#94a3b8',
          letterSpacing: '0.05em',
          marginBottom: 8,
        }}
      >
        Screenshots
      </div>
      <div
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Before */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#ef4444',
              marginBottom: 6,
              letterSpacing: '0.05em',
            }}
          >
            Before
          </div>
          {beforeScreenshot ? (
            <img
              src={toSrc(beforeScreenshot)}
              alt="Before optimization"
              style={{
                width: '100%',
                borderRadius: 8,
                border: '1px solid #2a2a4a',
              }}
            />
          ) : (
            <div style={placeholderStyle}>No screenshot</div>
          )}
        </div>

        {/* After */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#22c55e',
              marginBottom: 6,
              letterSpacing: '0.05em',
            }}
          >
            After
          </div>
          {afterScreenshot ? (
            <img
              src={toSrc(afterScreenshot)}
              alt="After optimization"
              style={{
                width: '100%',
                borderRadius: 8,
                border: '1px solid #2a2a4a',
              }}
            />
          ) : (
            <div style={placeholderStyle}>No screenshot</div>
          )}
        </div>
      </div>
    </div>
  );
}
