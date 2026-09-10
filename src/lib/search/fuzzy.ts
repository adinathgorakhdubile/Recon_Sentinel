/**
 * Lightweight fuzzy matcher. Returns a score in [0,1] plus match positions
 * suitable for highlighting. No external dependency so the search service
 * stays swappable (adapter can layer BM25 / embeddings on top later).
 */
export interface FuzzyMatch {
  score: number;
  positions: number[];
}

/**
 * Score `pattern` against `text`:
 *   - Exact substring: highest.
 *   - Prefix / word-start subsequence: high.
 *   - Any subsequence: lower, penalised by gaps.
 */
export function fuzzyScore(pattern: string, text: string): FuzzyMatch | null {
  if (!pattern) return { score: 0, positions: [] };
  if (!text) return null;
  const p = pattern.toLowerCase();
  const t = text.toLowerCase();

  const exact = t.indexOf(p);
  if (exact >= 0) {
    const positions: number[] = [];
    for (let i = 0; i < p.length; i++) positions.push(exact + i);
    // exact match at position 0 scores 1.0, decays with offset
    return { score: 1 - Math.min(0.4, exact / Math.max(20, t.length)), positions };
  }

  // Subsequence match with word-boundary bonuses.
  const positions: number[] = [];
  let ti = 0;
  let gapPenalty = 0;
  let boundaryBonus = 0;
  for (let pi = 0; pi < p.length; pi++) {
    const ch = p[pi];
    let found = -1;
    while (ti < t.length) {
      if (t[ti] === ch) { found = ti; ti++; break; }
      ti++;
    }
    if (found < 0) return null;
    positions.push(found);
    if (positions.length >= 2) {
      gapPenalty += Math.max(0, found - positions[positions.length - 2] - 1) * 0.02;
    }
    const prev = found === 0 ? " " : t[found - 1];
    if (/[\s./_\-]/.test(prev)) boundaryBonus += 0.05;
  }
  const base = 0.55 + boundaryBonus - gapPenalty;
  return { score: Math.max(0.15, Math.min(0.95, base)), positions };
}
