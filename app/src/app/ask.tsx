import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { askQuestion } from '@/lib/api';
import { formatQaShare, shareText } from '@/lib/share';
import { createStudy, getUserId } from '@/lib/studies';
import { colors } from '@/lib/theme';

const BOOK_CODES = new Set(
  ('Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro ' +
    'Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal ' +
    'Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas ' +
    '1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev').split(' '),
);

function jumpToRef(ref: string) {
  const m = ref.match(/^([1-3]?[A-Z][a-z]{1,2})\s+(\d+):(\d+)$/);
  if (m && BOOK_CODES.has(m[1])) {
    router.push({ pathname: '/', params: { book: m[1], chapter: m[2], verse: m[3] } });
  }
}

export default function Ask() {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const ask = useMutation({ mutationFn: askQuestion, onMutate: () => setStatus(null) });

  const submit = () => {
    const q = question.trim();
    if (q.length >= 3 && !ask.isPending) ask.mutate(q);
  };

  const saveResult = async () => {
    if (!ask.data) return;
    if (!(await getUserId())) {
      setStatus('Sign in on the Studies tab to save notes');
      return;
    }
    try {
      await createStudy({
        title: question.trim(),
        notes: `${ask.data.answer}${
          ask.data.verses.length
            ? `\n\nPassages: ${ask.data.verses.map((v) => v.ref).join(', ')}`
            : ''
        }`,
      });
      setStatus('Saved to Studies ✓');
    } catch {
      setStatus('Could not save');
    }
  };

  const shareResult = async () => {
    if (!ask.data) return;
    const outcome = await shareText(
      formatQaShare({
        heading: 'Asked in Cheqer',
        question: question.trim(),
        answer: ask.data.answer,
        refs: ask.data.verses.map((v) => v.ref),
      }),
    );
    if (outcome === 'copied') setStatus('Copied to clipboard ✓');
    else if (outcome === 'failed') setStatus('Could not share');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        Ask in plain English — where does Scripture talk about something, what word is behind a
        phrase. The answer is searched from the text, not from memory.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Where does Scripture talk about the sons of God?"
        placeholderTextColor={colors.faint}
        value={question}
        onChangeText={setQuestion}
        onSubmitEditing={submit}
        multiline
      />
      <Pressable
        style={[styles.button, ask.isPending && styles.buttonDisabled]}
        disabled={ask.isPending}
        onPress={submit}>
        <Text style={styles.buttonText}>{ask.isPending ? 'Searching…' : 'Ask'}</Text>
      </Pressable>

      {ask.isPending && (
        <View style={styles.pending}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.pendingText}>
            Searching the text and the lexicon… usually under a minute.
          </Text>
        </View>
      )}
      {ask.isError && (
        <Text style={styles.error}>Could not answer that. Try rephrasing the question.</Text>
      )}

      {ask.data && (
        <View style={styles.result}>
          <Text style={styles.answer}>{ask.data.answer}</Text>
          <View style={styles.resultActions}>
            <Pressable onPress={saveResult} hitSlop={6}>
              <Text style={styles.resultActionText}>Save note</Text>
            </Pressable>
            <Pressable onPress={shareResult} hitSlop={6}>
              <Text style={styles.resultActionText}>Share</Text>
            </Pressable>
            {status ? <Text style={styles.resultStatus}>{status}</Text> : null}
          </View>

          {ask.data.verses.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Passages</Text>
              {ask.data.verses.map((v) => (
                <Pressable key={v.ref} style={styles.verseRow} onPress={() => jumpToRef(v.ref)}>
                  <Text style={styles.verseRef}>{v.ref}</Text>
                  <Text style={styles.verseNote}>{v.note}</Text>
                </Pressable>
              ))}
            </>
          )}

          {ask.data.lemmas.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>The words behind it</Text>
              {ask.data.lemmas.map((l) => (
                <Pressable
                  key={l.strongs}
                  style={styles.lemmaRow}
                  onPress={() => router.push(`/study/${l.strongs}` as never)}>
                  <Text style={styles.lemmaText}>{l.lemma}</Text>
                  <Text style={styles.lemmaNote}>{l.note}</Text>
                </Pressable>
              ))}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  lead: { fontSize: 14, color: colors.faint, lineHeight: 20, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.card,
    padding: 12,
    fontSize: 16,
    color: colors.ink,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 10,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  pending: { alignItems: 'center', gap: 10, marginTop: 28 },
  pendingText: { color: colors.faint, fontSize: 13 },
  error: { color: '#A33', marginTop: 16 },
  result: { marginTop: 20 },
  answer: { fontSize: 15, color: colors.ink, lineHeight: 23 },
  resultActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  resultActionText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  resultStatus: { color: colors.faint, fontSize: 12 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 18,
    marginBottom: 8,
  },
  verseRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'baseline',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  verseRef: { width: 74, color: colors.accent, fontWeight: '700', fontSize: 13 },
  verseNote: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19 },
  lemmaRow: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 6,
  },
  lemmaText: { fontSize: 18, color: colors.ink },
  lemmaNote: { fontSize: 13, color: colors.faint, marginTop: 2, lineHeight: 18 },
});
