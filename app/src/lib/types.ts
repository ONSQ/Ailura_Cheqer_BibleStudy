export type Corpus = 'OT' | 'NT';

export interface Book {
  book: string;
  corpus: Corpus;
  chapters: number;
}

export interface Word {
  id: number;
  word_num: number;
  surface: string;
  translit: string | null;
  gloss: string | null;
  strongs: string | null;
  morph: string | null;
}

export interface Verse {
  verse: number;
  words: Word[];
}

export interface Chapter {
  book: string;
  chapter: number;
  corpus: Corpus;
  verses: Verse[];
}

export interface TranslationVerse {
  verse: number;
  text: string;
}

export interface TranslationChapter {
  version: string;
  book: string;
  chapter: number;
  verses: TranslationVerse[];
}

export interface Lexeme {
  strongs: string;
  language: 'heb' | 'grk' | 'arc';
  lemma: string | null;
  gloss: string | null;
  occurrences: number;
}

export interface GlossCount {
  gloss: string;
  count: number;
}

export interface Occurrence {
  book: string;
  chapter: number;
  verse: number;
  word_num: number;
  surface: string;
  translit: string | null;
  gloss: string | null;
}

export interface OccurrencePage {
  total: number;
  rows: Occurrence[];
}

export interface PeriodHit {
  id: number;
  corpus: string;
  work: string;
  ref: string;
  language: string | null;
  content: string;
  content_en: string | null;
}

export interface PeriodUsagePage {
  total: number;
  rows: PeriodHit[];
}

export interface VerseWitness {
  corpus: string;
  work: string;
  ref: string;
  language: string | null;
  content: string;
  content_en: string | null;
}

export interface VerseAnswer {
  answer: string;
  refs: { ref: string; note: string }[];
}

export interface AskResult {
  answer: string;
  lemmas: { strongs: string; lemma: string; note: string }[];
  verses: { ref: string; note: string }[];
}

export interface SodBriefSection {
  title: string;
  body: string;
  citations: string[];
}

export interface SodBrief {
  summary: string;
  sections: SodBriefSection[];
}

export interface LxxRendering {
  grk_strongs: string;
  lemma: string | null;
  gloss: string | null;
  pair_count: number;
  share: number;
  lift: number;
}
