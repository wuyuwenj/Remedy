import { useEffect, useRef } from 'react';

interface AgentLogProps {
  messages: string[];
}

const styles = {
  container: {
    background: '#0f0f1a',
    border: '1px solid #1e1e3a',
    borderRadius: 12,
    padding: 16,
    maxHeight: 200,
    overflowY: 'auto' as const,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    lineHeight: 1.7,
    marginBottom: 24,
  },
  line: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    color: '#22c55e',
    opacity: 0.7,
    transition: 'opacity 0.3s',
  },
  latestLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    color: '#22c55e',
    opacity: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#22c55e',
    flexShrink: 0,
  },
  dotPulse: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#22c55e',
    flexShrink: 0,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  text: {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  empty: {
    color: '#64748b',
    fontStyle: 'italic' as const,
    fontSize: 13,
  },
};

export default function AgentLog({ messages }: AgentLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={styles.container}>
      {messages.length === 0 ? (
        <div style={styles.empty}>Waiting for agent...</div>
      ) : (
        messages.map((msg, i) => {
          const isLatest = i === messages.length - 1;
          return (
            <div key={i} style={isLatest ? styles.latestLine : styles.line}>
              <span style={isLatest ? styles.dotPulse : styles.dot} />
              <span style={styles.text}>{msg}</span>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}
