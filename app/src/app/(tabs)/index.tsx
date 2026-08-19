import { useMutation, useQuery } from '@tanstack/react-query';
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
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrailPanel } from '@/components/trail';
import { WordSheet, type WordSelection } from '@/components/word-sheet';
import { formatQaShare, shareText } from '@/lib/share';
import { createStudy, getUserId } from '@/lib/studies';
import {
  askVerse,
  displaySurface,
  getBooks,
  getChapter,
  getTranslation,
  getVersions,
  getVerseWitnesses,
} from '@/lib/api';
import { parseRef } from '@/lib/refs';
import { fonts, themedSheets, useSheet, useTheme } from '@/lib/theme';
import type { Verse, VerseAnswer } from '@/lib/types';

export default function Reader() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const params = useLocalSearchParams<{ book?: string; chapter?: string; verse?: string }>();
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState({ book: 'Gen', chapter: 1 });
  const [targetVerse, setTargetVerse] = useState<number | null>(null);
  const [picker, setPicker] = useState<'book' | 'chapter' | 'verse' | null>(null);
  const [version, setVersion] = useState<string | null>('BSB');
  const [showOriginal, setShowOriginal] = useState(true);
  const [wordSel, setWordSel] = useState<WordSelection | null>(null);
  const [sheetRange, setSheetRange] = useState<{ start: number; end: number } | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
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

  // Prev/next chapter, crossing book boundaries (Gen 50 -> Exo 1).
  const nav = useMemo(() => {
    const list = books.data;
    if (!list) return { prev: null, next: null };
    const idx = list.findIndex((b) => b.book === sel.book);
    if (idx < 0) return { prev: null, next: null };
    const prev =
      sel.chapter > 1
        ? { book: sel.book, chapter: sel.chapter - 1 }
        : idx > 0
          ? { book: list[idx - 1].book, chapter: list[idx - 1].chapters }
          : null;
    const next =
      sel.chapter < list[idx].chapters
        ? { book: sel.book, chapter: sel.chapter + 1 }
        : idx < list.length - 1
          ? { book: list[idx + 1].book, chapter: 1 }
          : null;
    return { prev, next };
  }, [books.data, sel]);

  const goTo = (target: { book: string; chapter: number }) => {
    setSel(target);
    setTargetVerse(null);
    setSelection(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  // Scroll to the jumped-to verse once the chapter is in.
  useEffect(() => {
    if (targetVerse == null || !chapter.data) return;
    const index = chapter.data.verses.findIndex((v) => v.verse === targetVerse);
    if (index >= 0) {
      setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.2 }), 250);
    }
  }, [targetVerse, chapter.data]);

  // Direct navigation from a typed reference like "John 3:16".
  const goToRef = (t: { book: string; chapter: number; verse?: number }) => {
    setPicker(null);
    setSelection(null);
    setSel({ book: t.book, chapter: t.chapter });
    setTargetVerse(t.verse ?? null);
  };

  // Picker flow: book -> chapter -> verse, each a grid of buttons.
  const setBook = (book: string) => {
    setSel({ book, chapter: 1 });
    setTargetVerse(null);
    setSelection(null);
    setPicker('chapter');
  };
  const setChapterNum = (n: number) => {
    setSel((s) => ({ ...s, chapter: n }));
    setTargetVerse(null);
    setSelection(null);
    setPicker('verse');
  };

  // Tap: open the verse sheet (or extend an active selection).
  const onVersePress = (v: number) => {
    if (selection) {
      setSelection({ start: Math.min(selection.start, v), end: Math.max(selection.end, v) });
    } else {
      setSheetRange({ start: v, end: v });
    }
  };
  // Long-press: start (or extend) a multi-verse selection.
  const onVerseLongPress = (v: number) => {
    setSelection((s) =>
      s ? { start: Math.min(s.start, v), end: Math.max(s.end, v) } : { start: v, end: v },
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={[styles.navArrow, !nav.prev && styles.navArrowOff]}
          disabled={!nav.prev}
          onPress={() => goTo(nav.prev!)}
          hitSlop={6}>
          <Text style={styles.navArrowText}>‹</Text>
        </Pressable>
        <Pressable style={styles.pickerBtn} onPress={() => setPicker('book')}>
          <Text style={styles.pickerBtnText}>{sel.book}</Text>
        </Pressable>
        <Pressable style={styles.pickerBtn} onPress={() => setPicker('chapter')}>
          <Text style={styles.pickerBtnText}>{sel.chapter}</Text>
        </Pressable>
        <Pressable
          style={[styles.navArrow, !nav.next && styles.navArrowOff]}
          disabled={!nav.next}
          onPress={() => goTo(nav.next!)}
          hitSlop={6}>
          <Text style={styles.navArrowText}>›</Text>
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
      <VerseSheet
        book={sel.book}
        chapter={sel.chapter}
        range={sheetRange}
        onClose={() => setSheetRange(null)}
        onStartSelection={() => {
          if (sheetRange) setSelection(sheetRange);
          setSheetRange(null);
        }}
      />

      {selection && (
        <View style={styles.selectionBar}>
          <Pressable
            style={styles.selectionAsk}
            onPress={() => {
              setSheetRange(selection);
              setSelection(null);
            }}>
            <Text style={styles.selectionAskText}>
              Ask about {sel.book} {sel.chapter}:{selection.start}
              {selection.end > selection.start ? `–${selection.end}` : ''}
            </Text>
          </Pressable>
          <Pressable onPress={() => setSelection(null)} hitSlop={10}>
            <Text style={styles.selectionCancel}>✕</Text>
          </Pressable>
        </View>
      )}

      {chapter.data && (
        <FlatList
          ref={listRef}
          data={chapter.data.verses}
          keyExtractor={(v) => String(v.verse)}
          contentContainerStyle={styles.listContent}
          onScrollToIndexFailed={() => {}}
          ListFooterComponent={
            <View style={styles.chapterNavRow}>
              {nav.prev ? (
                <Pressable style={styles.chapterNavBtn} onPress={() => goTo(nav.prev!)}>
                  <Text style={styles.chapterNavText}>
                    ‹ {nav.prev.book} {nav.prev.chapter}
                  </Text>
                </Pressable>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              {nav.next ? (
                <Pressable
                  style={[styles.chapterNavBtn, styles.chapterNavNext]}
                  onPress={() => goTo(nav.next!)}>
                  <Text style={[styles.chapterNavText, styles.chapterNavNextText]}>
                    {nav.next.book} {nav.next.chapter} ›
                  </Text>
                </Pressable>
              ) : (
                <View style={{ flex: 1 }} />
              )}
            </View>
          }
          renderItem={({ item }) => (
            <VerseRow
              verse={item}
              isRTL={isRTL}
              highlighted={item.verse === targetVerse}
              selected={
                !!selection && item.verse >= selection.start && item.verse <= selection.end
              }
              english={version != null ? englishByVerse.get(item.verse) : undefined}
              showOriginal={showOriginal}
              onEnglishWord={(query) =>
                setWordSel({ query, verse: item, book: sel.book, chapter: sel.chapter, isRTL })
              }
              onVersePress={() => onVersePress(item.verse)}
              onVerseLongPress={() => onVerseLongPress(item.verse)}
            />
          )}
        />
      )}

      <Modal visible={picker === 'book'} animationType="slide" transparent>
        <Pressable style={styles.modalScrim} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>Book</Text>
            <GoToRef onGo={goToRef} />
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
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={picker === 'chapter'} animationType="slide" transparent>
        <Pressable style={styles.modalScrim} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {sel.book}: chapter
            </Text>
            <GoToRef onGo={goToRef} />
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
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={picker === 'verse'} animationType="slide" transparent>
        <Pressable style={styles.modalScrim} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {sel.book} {sel.chapter}: verse
            </Text>
            <Pressable style={styles.wholeChapterBtn} onPress={() => setPicker(null)}>
              <Text style={styles.wholeChapterText}>Whole chapter, start at the top</Text>
            </Pressable>
            {chapter.isLoading ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={colors.accent} />
            ) : (
              <ScrollView>
                <View style={styles.grid}>
                  {(chapter.data?.verses ?? []).map((v) => (
                    <Pressable
                      key={v.verse}
                      style={styles.gridCell}
                      onPress={() => {
                        setTargetVerse(v.verse);
                        setPicker(null);
                      }}>
                      <Text style={styles.gridCellText}>{v.verse}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Type-in reference box shown at the top of the book/chapter pickers. */
function GoToRef({
  onGo,
}: {
  onGo: (t: { book: string; chapter: number; verse?: number }) => void;
}) {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const submit = () => {
    const target = parseRef(text);
    if (target) {
      setText('');
      setBad(false);
      onGo(target);
    } else {
      setBad(true);
    }
  };
  return (
    <View style={styles.goRow}>
      <TextInput
        style={[styles.goInput, bad && styles.goInputBad]}
        placeholder="Go to reference, e.g. John 3:16"
        placeholderTextColor={colors.faint}
        value={text}
        onChangeText={(t) => {
          setText(t);
          setBad(false);
        }}
        onSubmitEditing={submit}
        onKeyPress={(e) => {
          if (e.nativeEvent.key === 'Enter') submit();
        }}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
      />
      <Pressable style={styles.goBtn} onPress={submit} hitSlop={4}>
        <Text style={styles.goBtnText}>Go</Text>
      </Pressable>
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
  const styles = useSheet(sheets);
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
  selected,
  english,
  showOriginal,
  onEnglishWord,
  onVersePress,
  onVerseLongPress,
}: {
  verse: Verse;
  isRTL: boolean;
  highlighted: boolean;
  selected?: boolean;
  english?: string;
  showOriginal: boolean;
  onEnglishWord: (word: string) => void;
  onVersePress?: () => void;
  onVerseLongPress?: () => void;
}) {
  const styles = useSheet(sheets);
  // English primary: tappable English words, original beneath (optional).
  if (english != null) {
    return (
      <View
        style={[
          styles.verseRow,
          highlighted && styles.verseHighlight,
          selected && styles.verseSelected,
        ]}>
        <Text style={styles.englishPrimary} onLongPress={onVerseLongPress} suppressHighlighting>
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
    <View
      style={[
        styles.verseRow,
        highlighted && styles.verseHighlight,
        selected && styles.verseSelected,
      ]}>
      <OriginalLine verse={verse} isRTL={isRTL} primary />
    </View>
  );
}

const PRESET_QUESTIONS = [
  'What is it really saying here?',
  'What are the themes and big idea here?',
  'How does this connect with the rest of Scripture?',
  'Are there other ways to read this?',
  'How might this apply to me?',
];

const BOOK_CODES = new Set(
  ('Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro ' +
    'Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal ' +
    'Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas ' +
    '1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev').split(' '),
);

function AnswerRefChip({ refStr, onJump }: { refStr: string; onJump: () => void }) {
  const styles = useSheet(sheets);
  const m = refStr.match(/^([1-3]?[A-Z][a-z]{1,2})\s+(\d+):(\d+)/);
  const tappable = !!m && BOOK_CODES.has(m[1]);
  if (!tappable) return <Text style={styles.answerRef}>{refStr}</Text>;
  return (
    <Pressable
      onPress={() => {
        onJump();
        router.push({
          pathname: '/',
          params: { book: m![1], chapter: m![2], verse: m![3] },
        });
      }}
      hitSlop={4}>
      <Text style={[styles.answerRef, styles.answerRefLink]}>{refStr}</Text>
    </Pressable>
  );
}

function AskVerseSection({
  book,
  chapter,
  verseStart,
  verseEnd,
  onClose,
}: {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  onClose: () => void;
}) {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const [thread, setThread] = useState<({ question: string } & VerseAnswer)[]>([]);
  const [custom, setCustom] = useState('');
  const [turnStatus, setTurnStatus] = useState<Record<number, string>>({});
  const passageRef = `${book} ${chapter}:${verseStart}${verseEnd > verseStart ? `-${verseEnd}` : ''}`;

  const saveTurn = async (i: number) => {
    const t = thread[i];
    if (!t) return;
    if (!(await getUserId())) {
      setTurnStatus((s) => ({ ...s, [i]: 'Sign in on the Studies tab to save notes' }));
      return;
    }
    try {
      await createStudy({
        ref: passageRef,
        title: `${passageRef} — ${t.question}`,
        notes: `${t.answer}${t.refs.length ? `\n\nReferences: ${t.refs.map((r) => r.ref).join(', ')}` : ''}`,
      });
      setTurnStatus((s) => ({ ...s, [i]: 'Saved to Studies ✓' }));
    } catch {
      setTurnStatus((s) => ({ ...s, [i]: 'Could not save' }));
    }
  };

  const shareTurn = async (i: number) => {
    const t = thread[i];
    if (!t) return;
    const outcome = await shareText(
      formatQaShare({
        heading: passageRef,
        question: t.question,
        answer: t.answer,
        refs: t.refs.map((r) => r.ref),
      }),
    );
    if (outcome === 'copied') setTurnStatus((s) => ({ ...s, [i]: 'Copied to clipboard ✓' }));
    else if (outcome === 'failed') setTurnStatus((s) => ({ ...s, [i]: 'Could not share' }));
  };
  const ask = useMutation({
    mutationFn: (question: string) =>
      askVerse({
        book,
        chapter,
        verse: verseStart,
        verseEnd: verseEnd > verseStart ? verseEnd : undefined,
        question,
        history: thread.map(({ question: q, answer }) => ({ question: q, answer })),
      }),
    onSuccess: (res, question) => {
      setThread((t) => [...t, { question, ...res }]);
      setCustom('');
    },
  });
  const submit = (q: string) => {
    const question = q.trim();
    if (question.length >= 3 && !ask.isPending) ask.mutate(question);
  };

  return (
    <View style={styles.askSection}>
      {thread.map((t, i) => (
        <View key={i} style={styles.askTurn}>
          <Text style={styles.askQuestion}>{t.question}</Text>
          <Text style={styles.askAnswer}>{t.answer}</Text>
          {t.refs.length > 0 && (
            <View style={styles.answerRefRow}>
              {t.refs.map((r) => (
                <AnswerRefChip key={r.ref} refStr={r.ref} onJump={onClose} />
              ))}
            </View>
          )}
          <TrailPanel trail={t.trail} citations={t.citations} />
          <View style={styles.turnActions}>
            <Pressable onPress={() => saveTurn(i)} hitSlop={6}>
              <Text style={styles.turnActionText}>Save note</Text>
            </Pressable>
            <Pressable onPress={() => shareTurn(i)} hitSlop={6}>
              <Text style={styles.turnActionText}>Share</Text>
            </Pressable>
            {turnStatus[i] ? <Text style={styles.turnStatus}>{turnStatus[i]}</Text> : null}
          </View>
        </View>
      ))}
      {ask.isPending ? (
        <View style={styles.askPending}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.askPendingText}>Reading the verse and its witnesses…</Text>
        </View>
      ) : (
        <>
          {ask.isError && (
            <Text style={styles.askError}>Could not answer that — try again.</Text>
          )}
          <View style={styles.presetRow}>
            {PRESET_QUESTIONS.map((q) => (
              <Pressable key={q} style={styles.presetChip} onPress={() => submit(q)}>
                <Text style={styles.presetChipText}>{q}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.askInputRow}>
            <TextInput
              style={styles.askInput}
              placeholder="Or ask your own question about this verse…"
              placeholderTextColor={colors.faint}
              value={custom}
              onChangeText={setCustom}
              onSubmitEditing={() => submit(custom)}
            />
            <Pressable style={styles.askSend} onPress={() => submit(custom)} hitSlop={6}>
              <Text style={styles.askSendText}>Ask</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function VerseSheet({
  book,
  chapter,
  range,
  onClose,
  onStartSelection,
}: {
  book: string;
  chapter: number;
  range: { start: number; end: number } | null;
  onClose: () => void;
  onStartSelection: () => void;
}) {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const single = range != null && range.start === range.end;
  const witnesses = useQuery({
    queryKey: ['witnesses', book, chapter, range?.start],
    queryFn: () => getVerseWitnesses(book, chapter, range!.start),
    enabled: single,
  });
  if (range == null) return null;
  const labels: Record<string, string> = {
    LXX: 'Septuagint (Greek, ~3rd–2nd c. BC)',
    Targum: 'Targum Onkelos (Aramaic, ~1st–2nd c. AD)',
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalScrim} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.sheetHeader}>
            <Text style={styles.modalTitle}>
              {book} {chapter}:{range.start}
              {range.end > range.start ? `–${range.end}` : ''}
            </Text>
            <Pressable onPress={onStartSelection} hitSlop={8}>
              <Text style={styles.selectMoreLink}>+ more verses</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <AskVerseSection
              key={`${book}-${chapter}-${range.start}-${range.end}`}
              book={book}
              chapter={chapter}
              verseStart={range.start}
              verseEnd={range.end}
              onClose={onClose}
            />
            {single && !!witnesses.data?.length && (
              <Text style={styles.witnessHeading}>Ancient witnesses</Text>
            )}
            {single && witnesses.data?.map((w) => (
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

const sheets = themedSheets((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerBtn: {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pickerBtnText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  pickerBtnOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  navArrow: {
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  navArrowOff: { opacity: 0.25 },
  navArrowText: { color: colors.accent, fontSize: 22, fontWeight: '700', lineHeight: 24 },
  chapterNavRow: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 8 },
  chapterNavBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
  },
  chapterNavNext: { backgroundColor: colors.accent, borderColor: colors.accent },
  chapterNavText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  chapterNavNextText: { color: '#fff' },
  pickerBtnTextOff: { color: colors.faint, fontWeight: '500' },
  aboutLink: { color: colors.faint, fontSize: 14 },
  askLink: { color: colors.accent, fontSize: 14, fontWeight: '600', marginRight: 8 },
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
  witnessHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 14,
    marginBottom: 8,
  },
  askSection: { marginBottom: 4 },
  askTurn: { marginBottom: 12 },
  askQuestion: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  askAnswer: { fontSize: 14, color: colors.ink, lineHeight: 21 },
  askPending: { alignItems: 'center', gap: 8, paddingVertical: 14 },
  askPendingText: { color: colors.faint, fontSize: 13 },
  askError: { color: colors.danger, fontSize: 13, marginBottom: 6 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  presetChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  presetChipText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  askInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 },
  askInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.ink,
  },
  askSend: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  askSendText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  answerRefRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  answerRef: {
    fontSize: 11,
    color: colors.faint,
    backgroundColor: colors.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  answerRefLink: { color: colors.accent, fontWeight: '600' },
  turnActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  turnActionText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  turnStatus: { color: colors.faint, fontSize: 12 },
  verseSelected: { backgroundColor: colors.accentSoft },
  selectionBar: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  selectionAsk: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  selectionAskText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  selectionCancel: { color: colors.faint, fontSize: 16, fontWeight: '700' },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  selectMoreLink: { color: colors.accent, fontSize: 13, fontWeight: '600' },
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
  goRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  goInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bg,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  goInputBad: { borderColor: colors.danger },
  wholeChapterBtn: {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  wholeChapterText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  goBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  goBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
}));
