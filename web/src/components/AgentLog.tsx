import { useEffect, useRef } from 'react';

interface AgentLogProps {
  messages: string[];
}

export default function AgentLog({ messages }: AgentLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="panel p-4 max-h-[200px] overflow-y-auto font-mono text-[13px] leading-relaxed mb-6">
      {messages.length === 0 ? (
        <div className="text-muted-foreground italic text-[13px]">Waiting for agent...</div>
      ) : (
        messages.map((msg, i) => {
          const isLatest = i === messages.length - 1;
          return (
            <div
              key={i}
              className={`flex items-center gap-2.5 ${isLatest ? 'text-[color:var(--color-improve)]' : 'text-[color:var(--color-improve)] opacity-50'}`}
            >
              <span
                className={`size-1.5 rounded-full bg-[color:var(--color-improve)] shrink-0 ${isLatest ? 'pulse-dot' : ''}`}
              />
              <span className="whitespace-pre-wrap break-words">{msg}</span>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}
