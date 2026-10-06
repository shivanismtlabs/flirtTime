const USERNAME_RE = /^[a-z0-9_.]+$/;

/** Normalize input into a username-safe base (3–15 chars, room for suffix). */
export function sanitizeUsernameBase(raw: string): string {
  let base = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/^[_.]+|[_.]+$/g, '');

  if (base.length < 3) {
    base = `${base}user`.replace(/[^a-z0-9_.]/g, '').slice(0, 15);
  }
  if (base.length > 15) {
    base = base.slice(0, 15).replace(/[_.]+$/g, '');
  }
  if (base.length < 3) base = 'user';
  return base;
}

function isValidUsername(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 20 &&
    USERNAME_RE.test(value) &&
    !/^[_.]/.test(value) &&
    !/[_.]$/.test(value)
  );
}

function pushCandidate(out: string[], seen: Set<string>, candidate: string): void {
  const v = candidate
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20)
    .replace(/^[_.]+|[_.]+$/g, '');
  if (!isValidUsername(v) || seen.has(v)) return;
  seen.add(v);
  out.push(v);
}

/** Build username variants derived from the requested name. */
export function buildUsernameCandidates(baseInput: string): string[] {
  const base = sanitizeUsernameBase(baseInput);
  const seen = new Set<string>();
  const out: string[] = [];

  const yearSuffix = String(new Date().getFullYear()).slice(-2);
  const rand3 = () => String(Math.floor(Math.random() * 900) + 100);
  const rand2 = () => String(Math.floor(Math.random() * 90) + 10);

  pushCandidate(out, seen, `${base}${rand3()}`);
  pushCandidate(out, seen, `${base}_${rand2()}`);
  pushCandidate(out, seen, `${base}.${rand2()}`);
  pushCandidate(out, seen, `${base}${yearSuffix}`);
  pushCandidate(out, seen, `${base}_${rand3()}`);

  for (let i = 1; i <= 99 && out.length < 24; i++) {
    pushCandidate(out, seen, `${base}${i}`);
    pushCandidate(out, seen, `${base}_${i}`);
  }

  return out;
}

/** First `count` candidates not in `taken`. */
export function pickAvailableSuggestions(
  baseInput: string,
  taken: Set<string>,
  count = 3,
): string[] {
  const suggestions: string[] = [];
  for (const candidate of buildUsernameCandidates(baseInput)) {
    if (taken.has(candidate)) continue;
    suggestions.push(candidate);
    if (suggestions.length >= count) break;
  }
  return suggestions;
}
