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
