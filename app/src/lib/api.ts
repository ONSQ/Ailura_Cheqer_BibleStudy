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
  AskResult,
  Book,
  Chapter,
  Corpus,
  GlossCount,
  Lexeme,
  LxxRendering,
  OccurrencePage,
  PeriodUsagePage,
  SodBrief,
  TranslationChapter,
  Verse,
  VerseAnswer,
  VerseWitness,
  Word,
} from './types';

import Constants from 'expo-constants';

// Publishable client config: env vars first (local dev), app.json extra as
// the committed fallback (CI builds). The anon key is public by design;
// RLS is the security boundary.
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey;

export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Text data can stay on the local dev bridge while auth + shared studies
// already run on Supabase (EXPO_PUBLIC_TEXT_SOURCE=dev). Once the bulk
// load into Supabase is done, drop that env var.
export const usingSupabase = hasSupabase && process.env.EXPO_PUBLIC_TEXT_SOURCE !== 'dev';

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
  // RPC returns the whole chapter as one JSON value (PostgREST caps row
  // responses at 1,000; long chapters exceed that).
  const { data, error } = await supabase.rpc('chapter_words', {
    p_book: book,
    p_chapter: chapter,
  });
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
  const { data, error } = await supabase.rpc('occurrences_page', {
    p_strongs: strongs,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? { total: 0, rows: [] }) as OccurrencePage;
}

/** Version codes present in the translations table, BSB first. */
export async function getVersions(): Promise<string[]> {
  let versions: string[];
  if (!usingSupabase) {
    versions = await devGet<string[]>('/versions');
  } else {
    const supabase = await getSupabase();
    const { data, error } = await supabase.from('v_versions').select('version');
    if (error) throw error;
    versions = (data ?? []).map((r) => r.version);
  }
  return versions.sort((a, b) => (a === 'BSB' ? -1 : b === 'BSB' ? 1 : a.localeCompare(b)));
}

export async function getTranslation(
  book: string,
  chapter: number,
  version = 'BSB',
): Promise<TranslationChapter> {
  if (!usingSupabase) {
    return devGet<TranslationChapter>(
      `/translation?version=${version}&book=${encodeURIComponent(book)}&chapter=${chapter}`,
    );
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('translations')
    .select('verse, text')
    .eq('version', version)
    .eq('book', book)
    .eq('chapter', chapter)
    .order('verse');
  if (error) throw error;
  return { version, book, chapter, verses: data ?? [] };
}

/**
 * Period-witness usage (Sod panel): exact Strong's match against tagged
 * corpora in period_docs (LXX for now). Semantic search over untagged
 * corpora joins this in Phase 4 (hybrid retrieval).
 * Requires Supabase; the dev bridge has no period data.
 */
export async function getPeriodUsage(
  strongs: string,
  limit = 10,
  offset = 0,
): Promise<PeriodUsagePage> {
  if (!hasSupabase) return { total: 0, rows: [] };
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('period_usage', {
    p_strongs: strongs,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? { total: 0, rows: [] }) as PeriodUsagePage;
}

export interface SemanticWitness {
  corpus: string;
  work: string;
  ref: string;
  language: string;
  content: string | null;
  content_en: string | null;
  similarity: number;
}

/**
 * Semantic arm of hybrid retrieval (Phase 4): conceptually related passages
 * in the untagged period witnesses (Josephus, Philo, Second Temple
 * apocrypha), found by embedding the lexeme's semantic field server-side.
 */
export async function getSemanticWitnesses(strongs: string): Promise<SemanticWitness[]> {
  if (!hasSupabase) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke('sod-search', {
    body: { strongs },
  });
  if (error) throw error;
  if (data?.error) return []; // not configured: show nothing rather than fail
  return (data?.results ?? []) as SemanticWitness[];
}

export interface LibraryWork {
  corpus: string;
  work: string;
  passages: number;
  language: string;
}

export interface LibraryPassage {
  id: number;
  ref: string;
  language: string;
  content: string;
  content_en: string | null;
}

/** The period library: Josephus, Philo, and Second Temple works. */
export async function getLibraryWorks(): Promise<LibraryWork[]> {
  if (!hasSupabase) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('library_works');
  if (error) throw error;
  return (data ?? []) as LibraryWork[];
}

export async function getLibraryPassages(
  corpus: string,
  work: string,
  limit = 40,
  offset = 0,
): Promise<{ total: number; rows: LibraryPassage[] }> {
  if (!hasSupabase) return { total: 0, rows: [] };
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('library_passages', {
    p_corpus: corpus,
    p_work: work,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? { total: 0, rows: [] }) as { total: number; rows: LibraryPassage[] };
}

/**
 * How the Septuagint renders a Hebrew lemma: statistical translation
 * equivalents from verse-level co-occurrence (see schema.sql).
 */
export async function getLxxRenderings(strongs: string): Promise<LxxRendering[]> {
  if (!hasSupabase) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('lxx_renderings', { p_strongs: strongs });
  if (error) throw error;
  return (data ?? []) as LxxRendering[];
}

/** Period witnesses (LXX, Targum) for one MT verse, ref-aligned server-side. */
export async function getVerseWitnesses(
  book: string,
  chapter: number,
  verse: number,
): Promise<VerseWitness[]> {
  if (!hasSupabase) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('verse_witnesses', {
    p_book: book,
    p_chapter: chapter,
    p_verse: verse,
  });
  if (error) throw error;
  return (data ?? []) as VerseWitness[];
}

/**
 * Sod brief (Phase 4, layer 2): AI-written word-study synthesis, grounded in
 * retrieved passages with a citation per claim. Generated once per lexeme by
 * the sod-brief edge function, then cached in sod_briefs.
 */
export async function getCachedSodBrief(strongs: string): Promise<SodBrief | null> {
  if (!hasSupabase) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('sod_briefs')
    .select('brief')
    .eq('strongs', strongs)
    .maybeSingle();
  if (error) throw error;
  return (data?.brief as SodBrief) ?? null;
}

export async function generateSodBrief(strongs: string): Promise<SodBrief> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke('sod-brief', {
    body: { strongs },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.brief as SodBrief;
}

/**
 * Natural-language front door (Phase 4, layer 3): plain question in,
 * verified verses and lemmas out. The ask edge function searches the text
 * and lexicon with Claude; nothing is cited that wasn't retrieved.
 */
export async function askQuestion(question: string): Promise<AskResult> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke('ask', {
    body: { question },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.result as AskResult;
}

/** Direct questions on one verse, grounded in its words, context, and witnesses. */
export async function askVerse(input: {
  book: string;
  chapter: number;
  verse: number;
  verseEnd?: number;
  question: string;
  history?: { question: string; answer: string }[];
}): Promise<VerseAnswer> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke('ask-verse', { body: input });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.result as VerseAnswer;
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
