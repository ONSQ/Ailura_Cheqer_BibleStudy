/**
 * Data layer for Cheqer.
 *
 * Two backends behind one interface:
 *  - Supabase (production): set EXPO_PUBLIC_SUPABASE_URL and
 *    EXPO_PUBLIC_SUPABASE_ANON_KEY. Uses PostgREST plus the v_books view
 *    and gloss_distribution() function from schema.sql.
 *  - Dev bridge (local): `python tools/dev_server.py` serving wordstudy.db.
 *    Used automatically when the Supabase env vars are absent.
 *
 * Phase 3 note: hybrid retrieval (exact lemma match + semantic search over
 * period_docs embeddings) plugs in here as new functions with the same
 * pattern; nothing in the screens assumes lookup is lemma-only.
 */
import { Platform } from 'react-native';

import type {
  Book,
  Chapter,
  Corpus,
  GlossCount,
  Lexeme,
  OccurrencePage,
  Verse,
  Word,
} from './types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Android emulators reach the host machine at 10.0.2.2, not localhost.
const DEV_API =
  process.env.EXPO_PUBLIC_DEV_API ??
  Platform.select({ android: 'http://10.0.2.2:8787', default: 'http://localhost:8787' });

async function devGet<T>(path: string): Promise<T> {
  const res = await fetch(`${DEV_API}${path}`);
  if (!res.ok) throw new Error(`Dev API ${res.status} on ${path}`);
  return res.json();
}

async function getSupabase() {
  const { supabase } = await import('./supabase');
  return supabase;
}

/** Pick one row per word slot: Leningrad main text, then Qere, then rest. */
function tagPriority(corpus: Corpus, tag: string | null): number {
  if (corpus !== 'OT') return 0;
  if (tag?.startsWith('L')) return 0;
  if (tag?.startsWith('Q')) return 1;
  return 2;
}

interface RawWordRow extends Word {
  verse: number;
  source_tag: string | null;
}

function shapeChapter(book: string, chapter: number, rows: RawWordRow[]): Chapter {
  const tagged = rows.find((r) => r.strongs);
  const corpus: Corpus = tagged?.strongs?.startsWith('H') ? 'OT' : 'NT';
  const best = new Map<string, RawWordRow>();
  for (const row of rows) {
    const key = `${row.verse}:${row.word_num}`;
    const prev = best.get(key);
    if (!prev || tagPriority(corpus, row.source_tag) < tagPriority(corpus, prev.source_tag)) {
      best.set(key, row);
    }
  }
  const byVerse = new Map<number, Word[]>();
  for (const row of [...best.values()].sort(
    (a, b) => a.verse - b.verse || a.word_num - b.word_num,
  )) {
    const { verse, source_tag: _tag, ...word } = row;
    if (!byVerse.has(verse)) byVerse.set(verse, []);
    byVerse.get(verse)!.push(word);
  }
  const verses: Verse[] = [...byVerse.entries()].map(([verse, words]) => ({ verse, words }));
  return { book, chapter, corpus, verses };
}

// Canonical order (STEPBible 3-letter codes); source rows arrive in file order.
const BOOK_ORDER = (
  'Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro ' +
  'Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal ' +
  'Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas ' +
  '1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev'
).split(' ');

function canonicalSort(books: Book[]): Book[] {
  return [...books].sort((a, b) => BOOK_ORDER.indexOf(a.book) - BOOK_ORDER.indexOf(b.book));
}

export async function getBooks(): Promise<Book[]> {
  if (!usingSupabase) return canonicalSort(await devGet<Book[]>('/books'));
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('v_books').select('book, corpus, chapters');
  if (error) throw error;
  return canonicalSort(
    (data ?? []).map(({ book, corpus, chapters }) => ({ book, corpus, chapters })),
  );
}

export async function getChapter(book: string, chapter: number): Promise<Chapter> {
  if (!usingSupabase) {
    return devGet<Chapter>(`/chapter?book=${encodeURIComponent(book)}&chapter=${chapter}`);
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('ol_words')
    .select('id, verse, word_num, source_tag, surface, translit, gloss, strongs, morph')
    .eq('book', book)
    .eq('chapter', chapter)
    .order('verse')
    .order('word_num')
    .limit(3000);
  if (error) throw error;
  return shapeChapter(book, chapter, (data ?? []) as RawWordRow[]);
}

export async function getLexeme(strongs: string): Promise<Lexeme | null> {
  if (!usingSupabase) return devGet<Lexeme | null>(`/lexeme?strongs=${strongs}`);
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('lexemes')
    .select('*')
    .eq('strongs', strongs)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getGlossDistribution(strongs: string): Promise<GlossCount[]> {
  if (!usingSupabase) return devGet<GlossCount[]>(`/glosses?strongs=${strongs}`);
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('gloss_distribution', { p_strongs: strongs });
  if (error) throw error;
  return data ?? [];
}

export async function getOccurrences(
  strongs: string,
  limit = 50,
  offset = 0,
): Promise<OccurrencePage> {
  if (!usingSupabase) {
    return devGet<OccurrencePage>(`/occurrences?strongs=${strongs}&limit=${limit}&offset=${offset}`);
  }
  const supabase = await getSupabase();
  const { data, error, count } = await supabase
    .from('ol_words')
    .select('book, chapter, verse, word_num, surface, translit, gloss', { count: 'exact' })
    .eq('strongs', strongs)
    .order('id')
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { total: count ?? 0, rows: data ?? [] };
}

/** Hebrew surfaces carry morpheme dividers (בְּ/רֵאשִׁית) and escapes; strip for display. */
export function displaySurface(surface: string): string {
  return surface.replace(/[/\\]/g, '');
}

/** Lexeme glosses from ingestion carry markers like "God»LORD@Gen.1.1-Heb"; keep the head. */
export function displayGloss(gloss: string | null): string | null {
  if (!gloss) return null;
  const head = gloss.split('@')[0].split('»')[0].trim();
  return head || null;
}
