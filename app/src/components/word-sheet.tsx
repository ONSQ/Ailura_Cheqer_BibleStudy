import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Pronunciation } from '@/components/pronunciation';
import { displaySurface, getVerseEntities } from '@/lib/api';
import { matchEnglishToOriginal } from '@/lib/match';
import { bookName } from '@/lib/names';
import { themedSheets, useSheet, useTheme } from '@/lib/theme';
import type { Verse, Word } from '@/lib/types';

export interface WordSelection {
  query: string;
  verse: Verse;
  book: string;
  chapter: number;
  isRTL: boolean;
}

/**
 * Bottom sheet answering "what is behind this English word?": the original
 * word(s) whose gloss matches the selection, with root, meaning, and a path
 * to every occurrence (the Word Study screen).
 */
export function WordSheet({
  selection,
  onClose,
}: {
  selection: WordSelection | null;
  onClose: () => void;
}) {
  const styles = useSheet(sheets);
  // Who and where: TIPNR entities anchored to this exact verse. Declared
  // before the early return so the hook order never changes.
  const entities = useQuery({
    queryKey: [
      'verse-entities',
      selection?.book,
      selection?.chapter,
      selection?.verse.verse,
    ],
    queryFn: () => getVerseEntities(selection!.book, selection!.chapter, selection!.verse.verse),
    enabled: !!selection,
    staleTime: Infinity,
  });
  if (!selection) return null;
  const { query, verse, book, chapter, isRTL } = selection;
  // One row per lexeme: the same word repeated in a verse collapses.
  const matches = matchEnglishToOriginal(verse.words, query).filter(
    (m, i, all) => all.findIndex((x) => x.word.strongs === m.word.strongs) === i,
  );
  const matchedStrongs = new Set(matches.map((m) => m.word.strongs));
  const rest = verse.words.filter(
    (w, i, all) =>
      w.strongs &&
      !matchedStrongs.has(w.strongs) &&
      all.findIndex((x) => x.strongs === w.strongs) === i,
  );

  const open = (w: Word) => {
    onClose();
    if (w.strongs) router.push(`/study/${w.strongs}` as never);
  };

  const openEntity = (ustrong: string) => {
    onClose();
    router.push(`/entity/${ustrong}` as never);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>
            “{query.replace(/^[^A-Za-z'’-]+|[^A-Za-z'’-]+$/g, '')}” · {bookName(book)} {chapter}:
            {verse.verse}
          </Text>
          <Text style={styles.subtitle}>
            {matches.length
              ? 'Original word behind your selection. Tap for root, meaning, and every occurrence.'
              : 'No direct match on this word; here is every tagged word in the verse.'}
          </Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {!!entities.data?.length && (
              <View style={styles.entityRow}>
                {entities.data.map((e) => (
                  <Pressable key={e.ustrong} onPress={() => openEntity(e.ustrong)}>
                    <Text style={styles.entityChip}>
                      {e.kind === 'place' ? '◉ ' : e.kind === 'person' ? '◈ ' : '◆ '}
                      {e.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {matches.map(({ word }) => (
              <WordRow key={word.id} word={word} isRTL={isRTL} onPress={() => open(word)} />
            ))}
            {rest.length > 0 && (
              <>
                <Text style={styles.restLabel}>
                  {matches.length ? 'Other words in this verse' : ''}
                </Text>
                {rest.map((w) => (
                  <WordRow key={w.id} word={w} isRTL={isRTL} muted onPress={() => open(w)} />
                ))}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function WordRow({
  word,
  isRTL,
  muted,
  onPress,
}: {
  word: Word;
  isRTL: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  const styles = useSheet(sheets);
  return (
    <Pressable style={[styles.row, muted && styles.rowMuted]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.surface, isRTL && styles.surfaceHebrew]}>
          {displaySurface(word.surface)}
        </Text>
        <Pronunciation
          translit={word.translit}
          speak={displaySurface(word.surface)}
          strongs={word.strongs}
        />
        <Text style={styles.meta}>{word.gloss ?? ''}</Text>
        <Text style={styles.morph}>
          {word.strongs}
          {word.morph ? ` · ${word.morph}` : ''}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(20,16,10,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 13, color: colors.faint, marginTop: 4, marginBottom: 12, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rowMuted: { opacity: 0.65 },
  surface: { fontSize: 22, color: colors.ink },
  surfaceHebrew: { fontSize: 26 },
  meta: { fontSize: 13, color: colors.ink, marginTop: 2 },
  morph: { fontSize: 11, color: colors.faint, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.faint, marginLeft: 8 },
  restLabel: { fontSize: 12, color: colors.faint, marginTop: 6, marginBottom: 8 },
  entityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  entityChip: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
  },
}));
