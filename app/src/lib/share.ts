import { Platform, Share } from 'react-native';

import type { EntityCard, SemanticWitness, SenseDrift } from '@/lib/api';
import { bookName, displayRef } from '@/lib/names';
import type { GlossCount, Lexeme, LxxRendering, Occurrence, PeriodHit, SodBrief } from '@/lib/types';

export const APP_URL = 'https://cheqer.vercel.app';
const SIGNATURE = 'Cheqer Word Study Bible';

/**
 * Share text via the platform share sheet (Messages, WhatsApp, Mail, social
 * apps, and whatever else the phone offers); on web without navigator.share,
 * fall back to the clipboard so the text can be pasted anywhere.
 */
export async function shareText(
  text: string,
  title?: string,
): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (Platform.OS === 'web') {
      const nav = navigator as Navigator & {
        share?: (data: { text: string; title?: string }) => Promise<void>;
        canShare?: (data: { text: string; title?: string }) => boolean;
      };
      const data = { text, title };
      if (nav.share && (!nav.canShare || nav.canShare(data))) {
        try {
          await nav.share(data);
          return 'shared';
        } catch (e) {
          // The person closed the sheet: nothing to copy, nothing failed.
          if ((e as { name?: string })?.name === 'AbortError') return 'shared';
          // Any other refusal (desktop browsers without a share target) falls
          // through to the clipboard.
        }
      }
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
    await Share.share({ message: text, title });
    return 'shared';
  } catch {
    return 'failed';
  }
}

// ---------------------------------------------------------------------------
// Formatters. Each returns plain text that reads well in a text message, an
// email, or a social post: headings in caps, sections separated by blank
// lines, citations on their own line, the app link last.
// ---------------------------------------------------------------------------

const footer = (path = '') => `— ${SIGNATURE} · ${APP_URL}${path}`;

function section(title: string, body: string | null | undefined): string | null {
  const b = (body ?? '').trim();
  return b ? `${title.toUpperCase()}\n${b}` : null;
}

function join(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p && p.trim().length > 0).join('\n\n');
}

/** A Sod brief (word or entity) as text: summary, each section, its sources. */
export function formatBrief(brief: SodBrief): string {
  return join([
    brief.summary,
    ...brief.sections.map((s) =>
      join([
        `${s.title}\n${s.body}`,
        s.citations.length ? `Sources: ${s.citations.join(' · ')}` : null,
      ]),
    ),
    'AI summary of the cited witnesses, with a citation for every claim. Weigh it against the texts themselves.',
  ]);
}

export function formatQaShare(input: {
  heading: string;
  question: string;
  answer: string;
  refs?: string[];
}): string {
  const refLine = input.refs?.length ? `\n\n${input.refs.join(' · ')}` : '';
  return `${input.heading}\n\nQ: ${input.question}\n\n${input.answer}${refLine}\n\n${footer()}`;
}

/** A saved study: its title, what it is anchored to, and the notes. */
export function formatStudyNoteShare(input: {
  title: string | null;
  notes: string | null;
  strongs?: string | null;
  lemma?: string | null;
  ref?: string | null;
}): string {
  const anchor = [input.lemma, input.strongs, input.ref].filter(Boolean).join(' · ');
  return join([
    input.title ?? 'A Cheqer study',
    anchor || null,
    input.notes,
    footer(input.strongs ? `/study/${input.strongs}` : ''),
  ]);
}

const LANG: Record<string, string> = { heb: 'Hebrew', grk: 'Greek', arc: 'Aramaic' };

/**
 * The whole Word Study page as text: header, who & where, how translators
 * render it, sense drift, the Sod brief, Septuagint renderings and usage,
 * Second Temple witnesses, and the occurrences loaded so far. Sections that
 * have not loaded (or do not apply) are simply left out.
 */
export function formatWordStudyShare(input: {
  strongs: string;
  lexeme: Lexeme | null | undefined;
  translit?: string | null;
  gloss?: string | null;
  baseTotal?: number | null;
  baseText?: string;
  entities?: { name: string; description: string | null }[] | null;
  glosses?: GlossCount[] | null;
  drift?: { data: SenseDrift | null | undefined; eras: SenseDrift['eras'] } | null;
  brief?: SodBrief | null;
  renderings?: LxxRendering[] | null;
  lxx?: { total: number; rows: PeriodHit[] } | null;
  witnesses?: SemanticWitness[] | null;
  occurrences?: { rows: Occurrence[]; total: number } | null;
}): string {
  const lx = input.lexeme;
  const headerLines = [
    `${lx?.lemma ?? input.strongs}${input.translit ? ` (${input.translit})` : ''}`,
    lx
      ? `${lx.strongs} · ${LANG[lx.language] ?? lx.language} · ${lx.occurrences.toLocaleString()} occurrences` +
        (input.baseTotal != null && input.baseTotal < lx.occurrences
          ? ` (${input.baseTotal.toLocaleString()} in ${input.baseText ?? 'the base text'})`
          : '')
      : null,
    input.gloss,
  ];

  const glossText = input.glosses?.length
    ? input.glosses.map((g) => `${g.gloss}: ${g.count.toLocaleString()}`).join('\n')
    : null;

  const driftText =
    input.drift?.data && input.drift.eras.length
      ? input.drift.eras
          .map((e) => {
            const parts = [...input.drift!.data!.senses, 'other']
              .map((s) => [s, Math.round(((e.counts[s] ?? 0) / e.total) * 100)] as const)
              .filter(([, pct]) => pct > 0)
              .map(([s, pct]) => `${s} ${pct}%`);
            return `${e.era}: ${parts.join(', ')}`;
          })
          .join('\n')
      : null;

  const occText = input.occurrences?.rows.length
    ? join([
        input.occurrences.rows
          .slice(0, 40)
          .map((o) => `${bookName(o.book)} ${o.chapter}:${o.verse} · ${o.gloss ?? ''}`.trim())
          .join('\n'),
        input.occurrences.total > Math.min(40, input.occurrences.rows.length)
          ? `+ ${(input.occurrences.total - Math.min(40, input.occurrences.rows.length)).toLocaleString()} more in the app`
          : null,
      ])
    : null;

  return join([
    headerLines.filter(Boolean).join('\n'),
    section(
      'Who & where',
      input.entities?.map((e) => `${e.name}${e.description ? `: ${e.description}` : ''}`).join('\n'),
    ),
    section('How translators render it', glossText),
    section('How the meaning moves', driftText),
    input.brief ? section('Sod · Word-study brief', formatBrief(input.brief)) : null,
    section(
      'Sod · How the Septuagint renders it',
      input.renderings
        ?.map((r) => `${r.lemma ?? r.grk_strongs} (${r.grk_strongs}) ${r.gloss ?? ''} · ${r.pair_count.toLocaleString()} shared verses`.trim())
        .join('\n'),
    ),
    input.lxx?.total
      ? section(
          `Sod · Septuagint usage (${input.lxx.total.toLocaleString()} verses)`,
          input.lxx.rows
            .map((h) => `${bookName(h.work)} ${h.ref}\n${h.content}${h.content_en ? `\n${h.content_en}` : ''}`)
            .join('\n\n'),
        )
      : null,
    section(
      'Sod · Second Temple usage',
      input.witnesses
        ?.map((w) => `${displayRef(w.ref)} (${w.similarity >= 0.4 ? 'close parallel' : 'thematic echo'})\n${w.content_en ?? w.content ?? ''}`)
        .join('\n\n'),
    ),
    section(`Occurrences${input.occurrences?.total ? ` (${input.occurrences.total.toLocaleString()})` : ''}`, occText),
    footer(`/study/${input.strongs}`),
  ]);
}

/** The who-and-where page as text: card, the Sod brief, relations, names. */
export function formatEntityShare(input: {
  ustrong: string;
  card: EntityCard | null | undefined;
  brief?: SodBrief | null;
  linkRows?: { label: string; people: { name: string }[] }[];
  nameForms?: { form: string | null; translated: string | null; dstrong: string }[];
  appearances?: { total: number; rows: { book: string; chapter: number; verse: number; text: string | null }[] } | null;
}): string {
  const e = input.card?.entity;
  if (!e) return footer();
  return join([
    [
      `${e.name}${e.etype ? ` · ${e.etype}` : ''}`,
      e.description,
      e.tribe,
      e.kind === 'place' && e.lat != null && e.lng != null
        ? `Map: https://www.google.com/maps/@${e.lat},${e.lng},11z`
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
    input.brief ? section(`Sod · Who ${e.kind === 'place' ? 'is here' : 'they are'}`, formatBrief(input.brief)) : null,
    section(
      'Family & relations',
      input.linkRows
        ?.map((r) => `${r.label}: ${r.people.map((p) => p.name.replace(/_/g, ' ')).join(', ')}`)
        .join('\n'),
    ),
    section(
      'Names & forms',
      input.nameForms
        ?.map((n) => [n.form, n.translated, n.dstrong.slice(0, 5)].filter(Boolean).join(' · '))
        .join('\n'),
    ),
    input.appearances?.rows.length
      ? section(
          `Appearances (${input.appearances.total.toLocaleString()})`,
          join([
            input.appearances.rows
              .slice(0, 30)
              .map((r) => `${bookName(r.book)} ${r.chapter}:${r.verse}${r.text ? ` · ${r.text}` : ''}`)
              .join('\n'),
            input.appearances.total > Math.min(30, input.appearances.rows.length)
              ? `+ ${(input.appearances.total - Math.min(30, input.appearances.rows.length)).toLocaleString()} more in the app`
              : null,
          ]),
        )
      : null,
    footer(`/entity/${input.ustrong}`),
  ]);
}
