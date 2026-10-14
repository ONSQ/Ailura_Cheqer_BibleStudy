import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getLexiconEntry, getWordForms } from '@/lib/api';
import { themedSheets, useSheet } from '@/lib/theme';
import type { LexiconEntry, WordForm } from '@/lib/types';

/**
 * Word anatomy: the word taken apart from the lexicon (BDB for Hebrew,
 * Abbott-Smith for Greek) and the tagging. Root or derivation, the family
 * of words on the same root, the lexicon's sense layout, and which stems
 * or forms the text attests. Evidence only: nothing here is generated.
 */
export function useWordAnatomy(strongs: string | undefined) {
  const entry = useQuery({
    queryKey: ['lexicon', strongs],
    queryFn: () => getLexiconEntry(strongs!),
    enabled: !!strongs,
    staleTime: Infinity,
  });
  const forms = useQuery({
    queryKey: ['word-forms', strongs],
    queryFn: () => getWordForms(strongs!),
    enabled: !!strongs,
    staleTime: Infinity,
  });
  return { entry: entry.data ?? null, forms: forms.data ?? [] };
}

const TYPE: Record<string, string> = {
  A: 'adjective', Adv: 'adverb', Art: 'article', Cond: 'conditional', Conj: 'conjunction',
  Cor: 'correlative', DemP: 'demonstrative pronoun', ImpP: 'impersonal pronoun',
  Intg: 'interrogative', Intj: 'interjection', N: 'noun', Neg: 'negative', Part: 'particle',
  Prep: 'preposition', PerP: 'personal pronoun', PosP: 'possessive pronoun',
  RefP: 'reflexive pronoun', RelP: 'relative pronoun', V: 'verb',
};
const GENDER: Record<string, string> = { M: 'masculine', F: 'feminine', N: 'neuter', C: 'common' };

/** "H:N-M" -> "noun, masculine"; unknown codes come back as given. */
export function describePos(pos: string | null): string | null {
  if (!pos) return null;
  const [, rest] = pos.includes(':') ? pos.split(':') : ['', pos];
  const [type, gender] = rest.split('-');
  const t = TYPE[type];
  if (!t) return pos;
  const g = gender ? GENDER[gender.replace(/[PS]$/, '')] : undefined;
  return g ? `${t}, ${g}` : t;
}

const sourceName = (source: string) =>
  source === 'BDB'
    ? 'Brown-Driver-Briggs (1906), via OpenScriptures'
    : source === 'Abbott-Smith'
      ? "Abbott-Smith's Manual Greek Lexicon (1922), via STEPBible"
      : source;

/** The anatomy as plain text, for sharing. */
export function formatWordAnatomy(entry: LexiconEntry | null, forms: WordForm[]): string | null {
  if (!entry && !forms.length) return null;
  const lines: string[] = [];
  if (entry) {
    const pos = describePos(entry.pos);
    if (pos) lines.push(`Part of speech: ${pos}`);
    if (entry.derivation) lines.push(entry.root && entry.derivation !== 'a root' ? `Derivation: ${entry.derivation}` : entry.derivation === 'a root' ? `Root word: ${entry.root ?? entry.lemma}` : `Derivation: ${entry.derivation}`);
    else if (entry.root) lines.push(`Root: ${entry.root}`);
    if (entry.family.length) {
      lines.push(
        `Same root: ${entry.family.map((f) => `${f.lemma ?? f.strongs}${f.gloss ? ` (${f.gloss})` : ''}`).join(', ')}`,
      );
    }
    if (entry.lxx_for) lines.push(`In the Septuagint ${entry.lxx_for}`);
    if (entry.relations.length) lines.push(`Also: ${entry.relations.join('; ')}`);
  }
  if (forms.length) {
    lines.push(`Forms in the text: ${forms.map((f) => `${f.form} ${f.count}`).join(' · ')}`);
  }
  if (entry?.definition) lines.push(`Senses (${entry.source}):\n${entry.definition}`);
  if (entry) lines.push(`Source: ${sourceName(entry.source)}`);
  return lines.join('\n');
}

export function WordAnatomy({ strongs }: { strongs: string }) {
  const styles = useSheet(sheets);
  const { entry, forms } = useWordAnatomy(strongs);
  const [open, setOpen] = useState(false);
  if (!entry && !forms.length) return null;

  const definition = entry?.definition ?? '';
  const long = definition.length > 420;
  const shown = open || !long ? definition : definition.slice(0, 420).replace(/\s+\S*$/, '') + '…';
  const pos = describePos(entry?.pos ?? null);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Word anatomy</Text>
      <Text style={styles.sub}>
        The word taken apart: where it comes from, its relatives, how the lexicon lays out its
        senses, and the forms the text uses.
      </Text>

      {pos ? <Row label="Part of speech" value={pos} styles={styles} /> : null}
      {entry?.derivation === 'a root' ? (
        <Row label="Root word" value={`itself a root: ${entry.root ?? entry.lemma ?? ''}`} styles={styles} />
      ) : entry?.derivation ? (
        <Row label="Derivation" value={entry.derivation} styles={styles} />
      ) : entry?.root ? (
        <Row label="Root" value={entry.root} styles={styles} />
      ) : null}
      {entry?.lxx_for ? <Row label="In the Septuagint" value={entry.lxx_for} styles={styles} /> : null}
      {entry?.relations.length ? (
        <Row label="Also" value={entry.relations.join('; ')} styles={styles} />
      ) : null}

      {!!entry?.family.length && (
        <View style={styles.block}>
          <Text style={styles.label}>Same root</Text>
          <View style={styles.chips}>
            {entry.family.map((f) => (
              <Pressable
                key={f.strongs}
                style={styles.chip}
                onPress={() => router.push(`/study/${f.strongs}` as never)}>
                <Text style={styles.chipLemma}>{f.lemma ?? f.strongs}</Text>
                {f.gloss ? <Text style={styles.chipGloss}>{f.gloss}</Text> : null}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {forms.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.label}>Forms in the text</Text>
          <View style={styles.chips}>
            {forms.map((f) => (
              <View key={f.form} style={styles.formChip}>
                <Text style={styles.formText}>
                  {f.form} <Text style={styles.formCount}>{f.count}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {definition ? (
        <View style={styles.block}>
          <Text style={styles.label}>Senses ({entry!.source})</Text>
          <Text style={styles.definition} selectable>
            {shown}
          </Text>
          {long && (
            <Pressable onPress={() => setOpen((o) => !o)} hitSlop={8}>
              <Text style={styles.more}>{open ? 'Show less' : 'Show the whole entry'}</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {entry ? <Text style={styles.source}>{sourceName(entry.source)}</Text> : null}
    </View>
  );
}

function Row({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof useSheet<typeof sheets.light>> }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>
        {value}
      </Text>
    </View>
  );
}

const sheets = themedSheets((colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
    },
    title: { fontSize: 15, fontWeight: '700', color: colors.accent, marginBottom: 4 },
    sub: { fontSize: 12, color: colors.faint, lineHeight: 17, marginBottom: 10 },
    row: { marginBottom: 8 },
    block: { marginTop: 4, marginBottom: 8 },
    label: { fontSize: 11, fontWeight: '700', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
    value: { fontSize: 14, color: colors.ink, lineHeight: 20, writingDirection: 'ltr', textAlign: 'left' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { backgroundColor: colors.accentSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    chipLemma: { fontSize: 15, color: colors.ink },
    chipGloss: { fontSize: 11, color: colors.faint },
    formChip: { backgroundColor: colors.accentSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    formText: { fontSize: 13, color: colors.ink },
    formCount: { color: colors.accent, fontWeight: '700' },
    definition: { fontSize: 14, color: colors.ink, lineHeight: 21, writingDirection: 'ltr', textAlign: 'left' },
    more: { color: colors.accent, fontWeight: '700', fontSize: 13, marginTop: 6 },
    source: { fontSize: 11, color: colors.faint, marginTop: 6 },
  }),
);
