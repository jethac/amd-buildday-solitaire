const MAX_SEED_DIGITS = 40;

export function createGameNumber(): string {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return String((values[0] % 900_000_000) + 100_000_000);
  }
  // Used only to choose a fresh seed when Web Crypto is unavailable. The deal
  // itself always uses the deterministic engine PRNG.
  return String((Date.now() % 900_000_000) + 100_000_000);
}

export function normalizeGameNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!new RegExp(`^\\d{1,${MAX_SEED_DIGITS}}$`).test(trimmed)) return null;
  return trimmed.replace(/^0+(?=\d)/, '') || '0';
}

export async function copyText(value: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // The caller exposes the seed in a selected, editable dialog field when
    // clipboard permissions or browser support are unavailable.
    return false;
  }
}
