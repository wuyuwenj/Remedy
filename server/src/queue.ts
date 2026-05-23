const MAX_CONCURRENT = 1;
const MAX_QUEUE_SIZE = 10;
// Heavy pages can take ~25s to load + MCP startup + Gemini, so allow generous
// headroom while still bounding a truly hung job.
const JOB_TIMEOUT_MS = 180_000;

interface QueueItem {
  fn: () => Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
}

const queue: QueueItem[] = [];
let running = 0;

async function processNext(): Promise<void> {
  if (running >= MAX_CONCURRENT || queue.length === 0) return;

  const item = queue.shift()!;
  running++;

  try {
    await Promise.race([
      item.fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Job timed out after 180s')), JOB_TIMEOUT_MS)
      ),
    ]);
    item.resolve();
  } catch (err) {
    item.reject(err instanceof Error ? err : new Error(String(err)));
  } finally {
    running--;
    processNext();
  }
}

export function enqueue(fn: () => Promise<void>): Promise<void> {
  if (queue.length >= MAX_QUEUE_SIZE) {
    return Promise.reject(new Error('Queue is full. Try again later.'));
  }

  return new Promise<void>((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    processNext();
  });
}

export function getQueueLength(): number {
  return queue.length;
}
