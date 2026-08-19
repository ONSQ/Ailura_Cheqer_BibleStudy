import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { themedSheets, useSheet } from '@/lib/theme';
import type { CitationCheck, TrailStep } from '@/lib/types';

const LABELS: Record<string, (q: string, n: number) => string> = {
  search_verses: (q, n) => `Searched the Bible text for “${q}”: ${n} verses`,
  search_lexemes: (q, n) => `Searched the Hebrew/Greek lexicon for “${q}”: ${n} words`,
  verse_words: (q) => `Read the tagged original words of ${q}`,
  search_witnesses: (q, n) =>
    `Searched the Second Temple writings for “${q}”: ${n} passages`,
};

/**
 * "How this was found": the retrieval steps behind an AI answer and the
 * citation verification tally. Collapsed by default; the receipts are
 * there for anyone who wants them.
 */
export function TrailPanel({
  trail,
  citations,
}: {
  trail?: TrailStep[];
  citations?: CitationCheck;
}) {
  const styles = useSheet(sheets);
  const [open, setOpen] = useState(false);
  if (!trail && !citations) return null;
  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setOpen((v) => !v)} hitSlop={6}>
        <Text style={styles.toggle}>How this was found {open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <View style={styles.body}>
          {(trail ?? []).map((s, i) => (
            <Text key={i} style={styles.step}>
              {'· '}
              {(LABELS[s.tool] ?? ((q: string, n: number) => `${s.tool}: ${n} results`))(
                s.query,
                s.found,
              )}
            </Text>
          ))}
          {(trail ?? []).length === 0 && (
            <Text style={styles.step}>
              {'· '}Answered from the passage's own words, context, and witnesses; no extra
              searches were needed.
            </Text>
          )}
          {citations && (
            <Text style={styles.verified}>
              {citations.kept} reference{citations.kept === 1 ? '' : 's'} verified against what
              was actually retrieved
              {citations.dropped > 0
                ? `; ${citations.dropped} unverified reference${citations.dropped === 1 ? '' : 's'} removed`
                : ''}
              .
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  wrap: { marginTop: 10 },
  toggle: { color: colors.faint, fontSize: 12, fontWeight: '600' },
  body: {
    marginTop: 6,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 10,
    gap: 3,
  },
  step: { color: colors.faint, fontSize: 12, lineHeight: 17 },
  verified: { color: colors.accent, fontSize: 12, lineHeight: 17, marginTop: 4 },
}));
