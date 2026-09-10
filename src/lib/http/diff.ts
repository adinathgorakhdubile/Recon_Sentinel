/** Minimal line-based diff for request/response comparison. Not LCS-optimal
 *  but stable and dependency-free. */

export type DiffOp = "same" | "add" | "del";
export interface DiffLine {
  op: DiffOp;
  left?: string;
  right?: string;
}

export function diffLines(a: string, b: string): DiffLine[] {
  const A = (a ?? "").split("\n");
  const B = (b ?? "").split("\n");
  const N = A.length, M = B.length;
  // Greedy walker: consume matching prefixes, then scan ahead for the next sync point.
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < N && j < M) {
    if (A[i] === B[j]) {
      out.push({ op: "same", left: A[i], right: B[j] });
      i++; j++;
      continue;
    }
    // Look ahead up to 40 lines for a re-sync.
    const window = 40;
    let found = false;
    for (let k = 1; k < window && (i + k < N || j + k < M); k++) {
      if (j + k < M && A[i] === B[j + k]) {
        for (let x = 0; x < k; x++) out.push({ op: "add", right: B[j + x] });
        j += k;
        found = true;
        break;
      }
      if (i + k < N && A[i + k] === B[j]) {
        for (let x = 0; x < k; x++) out.push({ op: "del", left: A[i + x] });
        i += k;
        found = true;
        break;
      }
    }
    if (!found) {
      out.push({ op: "del", left: A[i] });
      out.push({ op: "add", right: B[j] });
      i++; j++;
    }
  }
  while (i < N) out.push({ op: "del", left: A[i++] });
  while (j < M) out.push({ op: "add", right: B[j++] });
  return out;
}
