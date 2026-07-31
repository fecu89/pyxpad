type ProcessingGate = {
  active: number;
  waiting: Array<() => void>;
};

const globalForProcessing = globalThis as unknown as { pyxpadImageGate?: ProcessingGate };
const gate = globalForProcessing.pyxpadImageGate ?? { active: 0, waiting: [] };
globalForProcessing.pyxpadImageGate = gate;

function concurrency() {
  const configured = Number(process.env.IMAGE_PROCESSING_CONCURRENCY ?? "2");
  return Number.isFinite(configured) ? Math.min(4, Math.max(1, Math.floor(configured))) : 2;
}

async function acquire() {
  if (gate.active < concurrency()) {
    gate.active += 1;
    return;
  }
  await new Promise<void>((resolve) => gate.waiting.push(resolve));
}

function release() {
  const next = gate.waiting.shift();
  if (next) next();
  else gate.active = Math.max(0, gate.active - 1);
}

export async function withImageProcessingSlot<T>(task: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await task();
  } finally {
    release();
  }
}
