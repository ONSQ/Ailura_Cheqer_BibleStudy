import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { createStudy, getUserId } from '@/lib/studies';

import {
  displayGloss,
  displaySurface,
  getGlossDistribution,
  getLexeme,
  getOccurrences,
  getPeriodUsage,
} from '@/lib/api';
import { colors } from '@/lib/theme';
import type { Occurrence } from '@/lib/types';

const PAGE = 50;

export default function WordStudy() {
  const { strongs } = useLocalSearchParams<{ strongs: string }>();
  const qc = useQueryClient();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'signin'>('idle');

  const lexeme = useQuery({
    queryKey: ['lexeme', strongs],
    queryFn: () => getLexeme(strongs!),
    enabled: !!strongs,
  });
  const glosses = useQuery({
    queryKey: ['glosses', strongs],
    queryFn: () => getGlossDistribution(strongs!),
    enabled: !!strongs,
  });
  const sod = useQuery({
    queryKey: ['period', strongs],
    queryFn: () => getPeriodUsage(strongs!, 10),
    enabled: !!strongs?.startsWith('G'),
  });
  const occurrences = useInfiniteQuery({
    queryKey: ['occurrences', strongs],
    queryFn: ({ pageParam }) => getOccurrences(strongs!, PAGE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.rows.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: !!strongs,
  });

  const rows = occurrences.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = occurrences.data?.pages[0]?.total ?? 0;
  const isHebrew = strongs?.startsWith('H');
  const maxGloss = glosses.data?.[0]?.count ?? 1;

  const jumpTo = (o: Occurrence) =>
    router.push({
      pathname: '/',
      params: { book: o.book, chapter: String(o.chapter), verse: String(o.verse) },
    });

  const saveStudy = async () => {
    if (!strongs || saveState === 'saving') return;
    if (!(await getUserId())) {
      setSaveState('signin');
      return;
    }
    setSaveState('saving');
    try {
      await createStudy({
        strongs,
        title: `${lexeme.data?.lemma ?? strongs} (${strongs})`,
      });
      qc.invalidateQueries({ queryKey: ['studies'] });
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: strongs ?? 'Word Study' }} />
      <FlatList
        data={rows}
        keyExtractor={(o, i) => `${o.book}${o.chapter}:${o.verse}#${o.word_num}-${i}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.card}>
              {lexeme.isLoading && <ActivityIndicator color={colors.accent} />}
              {lexeme.data && (
                <>
                  <Text style={[styles.lemma, isHebrew && styles.lemmaHebrew]}>
                    {lexeme.data.lemma ?? '—'}
                  </Text>
                  <Text style={styles.lexMeta}>
                    {lexeme.data.strongs} · {languageName(lexeme.data.language)} ·{' '}
                    {lexeme.data.occurrences.toLocaleString()} occurrences
                  </Text>
                  {displayGloss(lexeme.data.gloss) ? (
                    <Text style={styles.lexGloss}>{displayGloss(lexeme.data.gloss)}</Text>
                  ) : null}
                  <Pressable
                    style={[styles.saveBtn, saveState === 'saved' && styles.saveBtnDone]}
                    onPress={saveState === 'signin' ? () => router.push('/studies' as never) : saveStudy}>
                    <Text style={styles.saveBtnText}>
                      {saveState === 'saved'
                        ? 'Saved to studies ✓'
                        : saveState === 'saving'
                          ? 'Saving…'
                          : saveState === 'signin'
                            ? 'Sign in to save (tap)'
                            : 'Save study'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>

            {!!glosses.data?.length && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>How translators render it</Text>
                {glosses.data.map((g) => (
                  <View key={g.gloss} style={styles.glossRow}>
                    <Text style={styles.glossLabel} numberOfLines={1}>
                      {g.gloss}
                    </Text>
                    <View style={styles.glossBarTrack}>
                      <View
                        style={[styles.glossBar, { width: `${(g.count / maxGloss) * 100}%` }]}
                      />
                    </View>
                    <Text style={styles.glossCount}>{g.count.toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            )}

            {!!sod.data?.total && (
              <View style={[styles.card, styles.sodCard]}>
                <Text style={styles.sodTitle}>
                  Sod · Septuagint usage ({sod.data.total.toLocaleString()} verses)
                </Text>
                <Text style={styles.sodSub}>
                  The same Greek word in the LXX, centuries before the NT. “The deeper counsel”
                  (Jer 23:18).
                </Text>
                {sod.data.rows.map((h) => (
                  <View key={h.id} style={styles.sodRow}>
                    <Text style={styles.sodRef}>
                      {h.work} {h.ref}
                    </Text>
                    <Text style={styles.sodText}>{h.content}</Text>
                  </View>
                ))}
                {sod.data.total > sod.data.rows.length && (
                  <Text style={styles.sodMore}>
                    + {(sod.data.total - sod.data.rows.length).toLocaleString()} more in the LXX
                  </Text>
                )}
              </View>
            )}

            <Text style={styles.sectionTitle}>
              Occurrences{total ? ` (${total.toLocaleString()})` : ''}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.occRow} onPress={() => jumpTo(item)}>
            <Text style={styles.occRef}>
              {item.book} {item.chapter}:{item.verse}
            </Text>
            <Text style={[styles.occSurface, isHebrew && styles.occSurfaceHebrew]}>
              {displaySurface(item.surface)}
            </Text>
            <Text style={styles.occGloss} numberOfLines={1}>
              {item.gloss ?? ''}
            </Text>
          </Pressable>
        )}
        onEndReached={() => {
          if (occurrences.hasNextPage && !occurrences.isFetchingNextPage) {
            occurrences.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          occurrences.isFetchingNextPage ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.accent} />
          ) : null
        }
        ListEmptyComponent={
          occurrences.isLoading ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} />
          ) : (
            <Text style={styles.empty}>No occurrences found.</Text>
          )
        }
      />
    </View>
  );
}

function languageName(code: string) {
  return code === 'heb' ? 'Hebrew' : code === 'grk' ? 'Greek' : 'Aramaic';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: 16, paddingBottom: 48 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
  },
  lemma: { fontSize: 34, color: colors.ink },
  lemmaHebrew: { textAlign: 'left', fontSize: 40 },
  lexMeta: { color: colors.faint, marginTop: 4, fontSize: 13 },
  lexGloss: { color: colors.ink, marginTop: 8, fontSize: 16 },
  saveBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
  },
  saveBtnDone: { backgroundColor: '#DCEEDB' },
  saveBtnText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  sodCard: { backgroundColor: '#22304A', borderColor: '#22304A' },
  sodTitle: { fontSize: 14, fontWeight: '700', color: '#E8DEC8', marginBottom: 4 },
  sodSub: { fontSize: 12, color: '#9FA9BE', marginBottom: 12, lineHeight: 17 },
  sodRow: { marginBottom: 10 },
  sodRef: { fontSize: 12, fontWeight: '700', color: '#C9A96A' },
  sodText: { fontSize: 15, color: '#F0EBDD', lineHeight: 22, marginTop: 1 },
  sodMore: { fontSize: 12, color: '#9FA9BE', marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.accent, marginBottom: 10 },
  glossRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  glossLabel: { width: 110, fontSize: 13, color: colors.ink },
  glossBarTrack: { flex: 1, height: 10, backgroundColor: colors.accentSoft, borderRadius: 5 },
  glossBar: { height: 10, backgroundColor: colors.bar, borderRadius: 5 },
  glossCount: { width: 52, textAlign: 'right', fontSize: 12, color: colors.faint },
  occRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 6,
  },
  occRef: { width: 86, color: colors.accent, fontWeight: '600', fontSize: 13 },
  occSurface: { fontSize: 17, color: colors.ink },
  occSurfaceHebrew: { fontSize: 20 },
  occGloss: { flex: 1, textAlign: 'right', color: colors.faint, fontSize: 13 },
  empty: { textAlign: 'center', color: colors.faint, marginTop: 24 },
});
