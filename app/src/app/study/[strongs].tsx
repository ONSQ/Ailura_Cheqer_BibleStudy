import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Pronunciation } from '@/components/pronunciation';
import { createStudy, getUserId } from '@/lib/studies';

import {
  displayGloss,
  displaySurface,
  generateSodBrief,
  getCachedSodBrief,
  getGlossDistribution,
  getLexeme,
  getLxxRenderings,
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
  const renderings = useQuery({
    queryKey: ['lxx-renderings', strongs],
    queryFn: () => getLxxRenderings(strongs!),
    enabled: !!strongs?.startsWith('H'),
  });
  const brief = useQuery({
    queryKey: ['sod-brief', strongs],
    queryFn: () => getCachedSodBrief(strongs!),
    enabled: !!strongs,
  });
  const makeBrief = useMutation({
    mutationFn: () => generateSodBrief(strongs!),
    onSuccess: (data) => qc.setQueryData(['sod-brief', strongs], data),
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

  // Pronunciation guide: the most common attested form of this lexeme.
  const commonForm = useMemo(() => {
    const counts = new Map<string, { n: number; surface: string }>();
    for (const r of rows) {
      if (!r.translit) continue;
      const e = counts.get(r.translit) ?? { n: 0, surface: r.surface };
      e.n += 1;
      counts.set(r.translit, e);
    }
    const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    return top ? { translit: top[0], surface: top[1].surface } : null;
  }, [rows]);
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
                  {commonForm && (
                    <Pronunciation
                      translit={commonForm.translit}
                      speak={lexeme.data.lemma ?? displaySurface(commonForm.surface)}
                      strongs={strongs}
                      size={16}
                    />
                  )}
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

            <View style={[styles.card, styles.sodCard]}>
              <Text style={styles.sodTitle}>Sod · Word-study brief</Text>
              {brief.data ? (
                <>
                  <Text style={styles.briefSummary}>{brief.data.summary}</Text>
                  {brief.data.sections.map((s, i) => (
                    <View key={i} style={styles.briefSection}>
                      <Text style={styles.briefTitle}>{s.title}</Text>
                      <Text style={styles.briefBody}>{s.body}</Text>
                      {s.citations.length > 0 && (
                        <View style={styles.citationRow}>
                          {s.citations.map((c) => (
                            <CitationChip key={c} citation={c} />
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                  <Text style={styles.briefNote}>
                    AI summary of the witnesses above, with a citation for every claim. Always
                    weigh it against the texts themselves.
                  </Text>
                </>
              ) : makeBrief.isPending ? (
                <View style={styles.briefPending}>
                  <ActivityIndicator color="#C9A96A" />
                  <Text style={styles.sodSub}>
                    Studying the witnesses… this takes up to a minute the first time. The brief
                    is kept for everyone afterward.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.sodSub}>
                    A short brief tracing this word from Torah to prophets to the Septuagint,
                    written from the evidence on this page with a citation for every claim.
                  </Text>
                  {makeBrief.isError && (
                    <Text style={styles.briefError}>
                      Could not write the brief. Try again in a moment.
                    </Text>
                  )}
                  <Pressable style={styles.briefBtn} onPress={() => makeBrief.mutate()}>
                    <Text style={styles.briefBtnText}>Write the brief</Text>
                  </Pressable>
                </>
              )}
            </View>

            {!!renderings.data?.length && (
              <View style={[styles.card, styles.sodCard]}>
                <Text style={styles.sodTitle}>Sod · How the Septuagint renders it</Text>
                <Text style={styles.sodSub}>
                  Greek words the LXX translators chose for this Hebrew word. Tap one to follow
                  it into the Greek scriptures. “The deeper counsel” (Jer 23:18).
                </Text>
                {renderings.data.map((r) => (
                  <Pressable
                    key={r.grk_strongs}
                    style={styles.renderingRow}
                    onPress={() => router.push(`/study/${r.grk_strongs}` as never)}>
                    <Text style={styles.renderingLemma}>{r.lemma ?? r.grk_strongs}</Text>
                    <Text style={styles.renderingMeta}>
                      {displayGloss(r.gloss) ?? ''} · {r.grk_strongs}
                    </Text>
                    <Text style={styles.renderingCount}>
                      {r.pair_count.toLocaleString()} shared verses ›
                    </Text>
                  </Pressable>
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
                    {h.content_en ? <Text style={styles.sodEn}>{h.content_en}</Text> : null}
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

const BOOK_CODES = new Set(
  ('Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro ' +
    'Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal ' +
    'Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas ' +
    '1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev').split(' '),
);

/** Citation chips: MT refs jump to the Reader; other witnesses render plain. */
function CitationChip({ citation }: { citation: string }) {
  const m = citation.match(/^([1-3]?[A-Z][a-z]{1,2})\s+(\d+):(\d+)$/);
  const tappable = !!m && BOOK_CODES.has(m[1]);
  const chip = (
    <Text style={[styles.citation, tappable && styles.citationLink]}>{citation}</Text>
  );
  if (!tappable) return chip;
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/',
          params: { book: m![1], chapter: m![2], verse: m![3] },
        })
      }
      hitSlop={4}>
      {chip}
    </Pressable>
  );
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
  sodEn: { fontSize: 13, color: '#AEB7CA', lineHeight: 19, marginTop: 2 },
  renderingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#31405E',
  },
  renderingLemma: { fontSize: 19, color: '#F0EBDD' },
  renderingMeta: { flex: 1, fontSize: 12, color: '#9FA9BE' },
  renderingCount: { fontSize: 12, color: '#C9A96A', fontWeight: '600' },
  briefSummary: { fontSize: 15, color: '#F0EBDD', lineHeight: 23, marginBottom: 12 },
  briefSection: { marginBottom: 12 },
  briefTitle: { fontSize: 14, fontWeight: '700', color: '#C9A96A', marginBottom: 3 },
  briefBody: { fontSize: 14, color: '#DDD6C6', lineHeight: 21 },
  citationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  citation: {
    fontSize: 11,
    color: '#9FA9BE',
    backgroundColor: '#31405E',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  citationLink: { color: '#E8DEC8', textDecorationLine: 'underline' },
  briefNote: { fontSize: 11, color: '#8A94AB', marginTop: 6, lineHeight: 16 },
  briefError: { fontSize: 13, color: '#E8A0A0', marginBottom: 8 },
  briefPending: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  briefBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#C9A96A',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 4,
  },
  briefBtnText: { color: '#22304A', fontWeight: '700', fontSize: 14 },
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
