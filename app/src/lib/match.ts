/**
 * Match a selected English word back to the original-language words of the
 * same verse via their STEPBible glosses. Deterministic and local: this is
 * the alignment layer the word-question sheet runs on. Phase 4's NL front
 * door will sit on top of the same primitives.
 */
import type { Word } from './types';

export function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z'’-]/g, '');
}

/** Gloss strings carry markers: "God/ your", "[the] God of", "<into> God". */
function glossTokens(gloss: string | null): string[] {
  if (!gloss) return [];
  return gloss
    .toLowerCase()
    .replace(/[[\]<>()]/g, ' ')
    .split(/[\s/|,;.!?:]+/)
    .map((t) => t.replace(/[^a-z'’-]/g, ''))
    .filter(Boolean);
}

export interface WordMatch {
  word: Word;
  score: number;
}

export function matchEnglishToOriginal(words: Word[], selected: string): WordMatch[] {
  const q = normalizeToken(selected);
  if (!q) return [];
  const out: WordMatch[] = [];
  for (const w of words) {
    let score = 0;
    for (const t of glossTokens(w.gloss)) {
      if (t === q) {
        score = Math.max(score, 3);
      } else if (
        Math.min(t.length, q.length) >= 4 &&
        (t.startsWith(q) || q.startsWith(t))
      ) {
        // "created" ~ "create", "heavens" ~ "heaven"
        score = Math.max(score, 1);
      }
    }
    if (score > 0) out.push({ word: w, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
