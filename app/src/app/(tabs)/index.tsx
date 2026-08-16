import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WordSheet, type WordSelection } from '@/components/word-sheet';
import {
  displaySurface,
  getBooks,
  getChapter,
  getTranslation,
  getVersions,
  getVerseWitnesses,
} from '@/lib/api';
import { colors, fonts } from '@/lib/theme';
import type { Verse } from '@/lib/types';

export default function Reader() {
  const params = useLocalSearchParams<{ book?: string; chapter?: string; verse?: string }>();
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState({ book: 'Gen', chapter: 1 });
  const [targetVerse, setTargetVerse] = useState<number | null>(null);
  const [picker, setPicker] = useState<'book' | 'chapter' | null>(null);
  const [version, setVersion] = useState<string | null>('BSB');
  const [showOriginal, setShowOriginal] = useState(true);
  const [wordSel, setWordSel] = useState<WordSelection | null>(null);
  const [witnessVerse, setWitnessVerse] = useState<number | null>(null);
  const listRef = useRef<FlatList<Verse>>(null);

  // Jump-to-verse links from the Word Study screen arrive as URL params.
  useEffect(() => {
    if (params.book && params.chapter) {
      setSel({ book: params.book, chapter: Number(params.chapter) });
      setTargetVerse(params.verse ? Number(params.verse) : null);
    }
  }, [params.book, params.chapter, params.verse]);

  const books = useQuery({ queryKey: ['books'], queryFn: getBooks });
  const chapter = useQuery({
    queryKey: ['chapter', sel.book, sel.chapter],
    queryFn: () => getChapter(sel.book, sel.chapter),
  });
  const versions = useQuery({ queryKey: ['versions'], queryFn: getVersions });
  const translation = useQuery({
    queryKey: ['translation', version, sel.book, sel.chapter],
    queryFn: () => getTranslation(sel.book, sel.chapter, version!),
    enabled: version != null,
  });
  // Cycle BSB -> KJV -> WEB -> off -> BSB...
  const cycleVersion = () => {
    const list = versions.data?.length ? versions.data : ['BSB'];
    setVersion((v) => {
      if (v == null) return list[0];
      const i = list.indexOf(v);
      return i < 0 || i === list.length - 1 ? null : list[i + 1];
    });
  };
  const englishByVerse = useMemo(() => {
    const map = new Map<number, string>();
    for (const v of translation.data?.verses ?? []) map.set(v.verse, v.text);
    return map;
  }, [translation.data]);

  const isRTL = chapter.data?.corpus === 'OT';
  const chapterCount = useMemo(
    () => books.data?.find((b) => b.book === sel.book)?.chapters ?? 1,
    [books.data, sel.book],
  );

  // Scroll to the jumped-to verse once the chapter is in.
  useEffect(() => {
    if (targetVerse == null || !chapter.data) return;
    const index = chapter.data.verses.findIndex((v) => v.verse === targetVerse);
    if (index >= 0) {
      setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.2 }), 250);
    }
  }, [targetVerse, chapter.data]);

  const setBook = (book: string) => {
    setSel({ book, chapter: 1 });
    setTargetVerse(null);
    setPicker(null);
  };
  const setChapterNum = (n: number) => {
    setSel((s) => ({ ...s, chapter: n }));
    setTargetVerse(null);
    setPicker(null);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.pickerBtn} onPress={() => setPicker('book')}>
          <Text style={styles.pickerBtnText}>{sel.book}</Text>
        </Pressable>
        <Pressable style={styles.pickerBtn} onPress={() => setPicker('chapter')}>
          <Text style={styles.pickerBtnText}>{sel.chapter}</Text>
        </Pressable>
        <Pressable
          style={[styles.pickerBtn, version == null && styles.pickerBtnOff]}
          onPress={cycleVersion}>
          <Text style={[styles.pickerBtnText, version == null && styles.pickerBtnTextOff]}>
            {version ?? 'EN off'}
          </Text>
        </Pressable>
        {version != null && (
          <Pressable
            style={[styles.pickerBtn, !showOriginal && styles.pickerBtnOff]}
            onPress={() => setShowOriginal((v) => !v)}>
            <Text style={[styles.pickerBtnText, !showOriginal && styles.pickerBtnTextOff]}>
              {isRTL ? 'Heb' : 'Grk'}
            </Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.push('/ask' as never)} hitSlop={8}>
          <Text style={styles.askLink}>Ask ✨</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/about')} hitSlop={8}>
          <Text style={styles.aboutLink}>About</Text>
        </Pressable>
      </View>

      {chapter.isLoading && <ActivityIndicator style={{ marginTop: 48 }} color={colors.accent} />}
      {chapter.isError && (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            Could not load the text. Is the dev server running?{'\n'}python tools/dev_server.py
          </Text>
        </View>
      )}

      <WordSheet selection={wordSel} onClose={() => setWordSel(null)} />
      <WitnessSheet
        book={sel.book}
        chapter={sel.chapter}
        verse={witnessVerse}
        onClose={() => setWitnessVerse(null)}
      />

      {chapter.data && (
        <FlatList
          ref={listRef}
          data={chapter.data.verses}
          keyExtractor={(v) => String(v.verse)}
          contentContainerStyle={styles.listContent}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item }) => (
            <VerseRow
              verse={item}
              isRTL={isRTL}
              highlighted={item.verse === targetVerse}
              english={version != null ? englishByVerse.get(item.verse) : undefined}
              showOriginal={showOriginal}
              onEnglishWord={(query) =>
                setWordSel({ query, verse: item, book: sel.book, chapter: sel.chapter, isRTL })
              }
              onVersePress={isRTL ? () => setWitnessVerse(item.verse) : undefined}
            />
          )}
        />
      )}

      <Modal visible={picker === 'book'} animationType="slide" transparent>
        <Pressable style={styles.modalScrim} onPress={() => setPicker(null)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Book</Text>
            <ScrollView>
              {(['OT', 'NT'] as const).map((corpus) => (
                <View key={corpus}>
                  <Text style={styles.corpusLabel}>
                    {corpus === 'OT' ? 'Old Testament' : 'New Testament'}
                  </Text>
                  <View style={styles.grid}>
                    {books.data
                      ?.filter((b) => b.corpus === corpus)
                      .map((b) => (
                        <Pressable
                          key={b.book}
                          style={[styles.gridCell, b.book === sel.book && styles.gridCellActive]}
                          onPress={() => setBook(b.book)}>
                          <Text
                            style={[
                              styles.gridCellText,
                              b.book === sel.book && styles.gridCellTextActive,
                            ]}>
                            {b.book}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={picker === 'chapter'} animationType="slide" transparent>
        <Pressable style={styles.modalScrim} onPress={() => setPicker(null)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {sel.book}: chapter
            </Text>
            <ScrollView>
              <View style={styles.grid}>
                {Array.from({ length: chapterCount }, (_, i) => i + 1).map((n) => (
                  <Pressable
                    key={n}
                    style={[styles.gridCell, n === sel.chapter && styles.gridCellActive]}
                    onPress={() => setChapterNum(n)}>
                    <Text
                      style={[
                        styles.gridCellText,
                        n === sel.chapter && styles.gridCellTextActive,
                      ]}>
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function OriginalLine({
  verse,
  isRTL,
  primary,
}: {
  verse: Verse;
  isRTL: boolean;
  primary: boolean;
}) {
  const size = primary
    ? isRTL
      ? fonts.hebrewSize
      : fonts.greekSize
    : isRTL
      ? 20
      : 16;
  return (
    <Text
      style={[
        primary ? styles.verseText : styles.originalSecondary,
        isRTL && { writingDirection: 'rtl', textAlign: 'right' },
        { fontSize: size, lineHeight: size * 1.6 },
      ]}>
      {primary && <Text style={styles.verseNum}>{verse.verse} </Text>}
      {verse.words.map((w) => (
        <Text
          key={w.id}
          suppressHighlighting
          style={w.strongs ? undefined : styles.wordUntagged}
          onPress={w.strongs ? () => router.push(`/study/${w.strongs}` as never) : undefined}>
          {displaySurface(w.surface)}{' '}
        </Text>
      ))}
    </Text>
  );
}

function VerseRow({
  verse,
  isRTL,
  highlighted,
  english,
  showOriginal,
  onEnglishWord,
  onVersePress,
}: {
  verse: Verse;
  isRTL: boolean;
  highlighted: boolean;
  english?: string;
  showOriginal: boolean;
  onEnglishWord: (word: string) => void;
  onVersePress?: () => void;
}) {
  // English primary: tappable English words, original beneath (optional).
  if (english != null) {
    return (
      <View style={[styles.verseRow, highlighted && styles.verseHighlight]}>
        <Text style={styles.englishPrimary}>
          <Text
            suppressHighlighting
            style={[styles.verseNum, onVersePress && styles.verseNumTappable]}
            onPress={onVersePress}>
            {verse.verse}{' '}
          </Text>
          {english.split(/(\s+)/).map((token, i) =>
            /\S/.test(token) ? (
              <Text key={i} suppressHighlighting onPress={() => onEnglishWord(token)}>
                {token}
              </Text>
            ) : (
              token
            ),
          )}
        </Text>
        {showOriginal && <OriginalLine verse={verse} isRTL={isRTL} primary={false} />}
      </View>
    );
  }
  // No translation active: original text is primary, words tap to Word Study.
  return (
    <View style={[styles.verseRow, highlighted && styles.verseHighlight]}>
      <OriginalLine verse={verse} isRTL={isRTL} primary />
    </View>
  );
}

function WitnessSheet({
  book,
  chapter,
  verse,
  onClose,
}: {
  book: string;
  chapter: number;
  verse: number | null;
  onClose: () => void;
}) {
  const witnesses = useQuery({
    queryKey: ['witnesses', book, chapter, verse],
    queryFn: () => getVerseWitnesses(book, chapter, verse!),
    enabled: verse != null,
  });
  if (verse == null) return null;
  const labels: Record<string, string> = {
    LXX: 'Septuagint (Greek, ~3rd–2nd c. BC)',
    Targum: 'Targum Onkelos (Aramaic, ~1st–2nd c. AD)',
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalScrim} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <Text style={styles.modalTitle}>
            Witnesses · {book} {chapter}:{verse}
          </Text>
          <ScrollView>
            {witnesses.isLoading && (
              <ActivityIndicator style={{ marginVertical: 16 }} color={colors.accent} />
            )}
            {witnesses.data?.length === 0 && (
              <Text style={styles.witnessEmpty}>
                No period witnesses for this verse yet.
              </Text>
            )}
            {witnesses.data?.map((w) => (
              <View key={`${w.corpus}-${w.ref}`} style={styles.witnessCard}>
                <Text style={styles.witnessLabel}>
                  {labels[w.corpus] ?? w.corpus} · {w.work} {w.ref}
                </Text>
                <Text
                  style={[
                    styles.witnessText,
                    w.language === 'arc' && {
                      writingDirection: 'rtl',
                      textAlign: 'right',
                      fontSize: 20,
                      lineHeight: 32,
                    },
                  ]}>
                  {w.content}
                </Text>
                {w.content_en ? <Text style={styles.witnessEn}>{w.content_en}</Text> : null}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerBtn: {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pickerBtnText: { color: colors.accent, fontWeight: '700', fontSize: 16 },
  pickerBtnOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  pickerBtnTextOff: { color: colors.faint, fontWeight: '500' },
  aboutLink: { color: colors.faint, fontSize: 14 },
  askLink: { color: colors.accent, fontSize: 14, fontWeight: '600', marginRight: 12 },
  listContent: { padding: 16, paddingBottom: 48 },
  verseRow: { marginBottom: 12, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  englishPrimary: { color: colors.ink, fontSize: 17, lineHeight: 26 },
  originalSecondary: { color: colors.faint, marginTop: 3 },
  verseHighlight: { backgroundColor: colors.highlight },
  verseText: { color: colors.ink },
  verseNum: { fontSize: 12, color: colors.accent, fontWeight: '700' },
  verseNumTappable: { textDecorationLine: 'underline' },
  witnessCard: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  witnessLabel: { fontSize: 12, fontWeight: '700', color: colors.accent, marginBottom: 6 },
  witnessText: { fontSize: 16, color: colors.ink, lineHeight: 24 },
  witnessEmpty: { color: colors.faint, textAlign: 'center', marginVertical: 20 },
  witnessEn: { fontSize: 14, color: colors.faint, lineHeight: 20, marginTop: 6 },
  word: { color: colors.ink },
  wordUntagged: { color: colors.faint },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: colors.faint, textAlign: 'center', lineHeight: 22 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(20,16,10,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  corpusLabel: { fontSize: 12, color: colors.faint, marginTop: 10, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCell: {
    minWidth: 52,
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  gridCellActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  gridCellText: { color: colors.ink, fontSize: 14 },
  gridCellTextActive: { color: '#fff', fontWeight: '700' },
});
