import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  generateEntityBrief,
  getCachedEntityBrief,
  getEntityCard,
  getEntityRefs,
  type EntityRef,
} from '@/lib/api';
import { bookName, displayRef } from '@/lib/names';
import { themedSheets, useSheet, useTheme } from '@/lib/theme';

const PAGE = 50;

const KIND_LABEL: Record<string, string> = {
  person: 'Person',
  place: 'Place',
  other: 'Name',
};

const ROLE_LABEL: Record<string, string> = {
  parent: 'Parents',
  sibling: 'Siblings',
  partner: 'Married to',
  offspring: 'Children',
  founder: 'Founded by',
  inhabitant: 'People here',
};

/**
 * Who or where card: one TIPNR entity (person, place, or other named thing)
 * with family, name forms, and every appearance in Scripture. Curated
 * structure only; the dataset's AI-written blurbs are not ingested (see
 * docs/historical-context.md ground rule).
 */
export default function EntityScreen() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const { ustrong } = useLocalSearchParams<{ ustrong: string }>();
  const qc = useQueryClient();

  const card = useQuery({
    queryKey: ['entity', ustrong],
    queryFn: () => getEntityCard(ustrong!),
    enabled: !!ustrong,
  });
  const brief = useQuery({
    queryKey: ['entity-brief', ustrong],
    queryFn: () => getCachedEntityBrief(ustrong!),
    enabled: !!ustrong,
  });
  const makeBrief = useMutation({
    mutationFn: () => generateEntityBrief(ustrong!),
    onSuccess: (data) => qc.setQueryData(['entity-brief', ustrong], data),
  });
  const refs = useInfiniteQuery({
    queryKey: ['entity-refs', ustrong],
    queryFn: ({ pageParam }) => getEntityRefs(ustrong!, PAGE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.rows.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: !!ustrong,
  });

  const e = card.data?.entity;
  const rows = refs.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = refs.data?.pages[0]?.total ?? 0;

  // One row per role, resolved relatives as tappable chips.
  const linkRows = Object.entries(ROLE_LABEL)
    .map(([role, label]) => ({
      label,
      people: (card.data?.links ?? [])
        .filter((l) => l.role === role)
        .filter((l, i, all) => all.findIndex((x) => x.name === l.name) === i),
    }))
    .filter((r) => r.people.length > 0);

  // Distinct original-script forms with their translations.
  const nameForms = (card.data?.names ?? []).filter(
    (n, i, all) => all.findIndex((x) => x.dstrong === n.dstrong && x.form === n.form) === i,
  );

  const jumpTo = (r: EntityRef) =>
    router.push({
      pathname: '/',
      params: { book: r.book, chapter: String(r.chapter), verse: String(r.verse) },
    });

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: e?.name ?? 'Who & where' }} />
      <FlatList
        data={rows}
        keyExtractor={(r, i) => `${r.book}${r.chapter}:${r.verse}-${i}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {card.isLoading && <ActivityIndicator color={colors.accent} />}
            {e && (
              <>
                <View style={styles.card}>
                  <View style={styles.headRow}>
                    <Text style={styles.name}>{e.name}</Text>
                    <Text style={styles.kindChip}>{e.etype ?? KIND_LABEL[e.kind]}</Text>
                  </View>
                  {e.description ? <Text style={styles.desc}>{e.description}</Text> : null}
                  {e.tribe ? <Text style={styles.meta}>{e.tribe}</Text> : null}
                  {e.kind === 'place' && e.lat != null && e.lng != null && (
                    <Pressable
                      style={styles.mapBtn}
                      onPress={() =>
                        Linking.openURL(`https://www.google.com/maps/@${e.lat},${e.lng},11z`)
                      }>
                      <Text style={styles.mapBtnText}>
                        View on map · {e.lat.toFixed(3)}, {e.lng.toFixed(3)}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <View style={[styles.card, styles.sodCard]}>
                  <Text style={styles.sodTitle}>Sod · Who {e.kind === 'place' ? 'is here' : 'they are'}</Text>
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
                        AI summary written only from the verses and witnesses cited. Always
                        weigh it against the texts themselves.
                      </Text>
                    </>
                  ) : makeBrief.isPending ? (
                    <View style={styles.briefPending}>
                      <ActivityIndicator color="#C9A96A" />
                      <Text style={styles.sodSub}>
                        Reading the appearances… this takes up to a minute the first time.
                        The brief is kept for everyone afterward.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.sodSub}>
                        Who {e.name} is and why {e.kind === 'place' ? 'it' : 'they'} matter
                        in the text — written from the appearances below, with a citation
                        for every claim.
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

                {linkRows.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Family & relations</Text>
                    {linkRows.map((r) => (
                      <View key={r.label} style={styles.linkRow}>
                        <Text style={styles.linkLabel}>{r.label}</Text>
                        <View style={styles.linkChips}>
                          {r.people.map((p) => (
                            <Pressable
                              key={`${p.name}-${p.target ?? 'x'}`}
                              disabled={!p.target}
                              onPress={() =>
                                p.target && router.push(`/entity/${p.target}` as never)
                              }>
                              <Text style={[styles.chip, p.target && styles.chipLink]}>
                                {p.name.replace(/_/g, ' ')}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {nameForms.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Names & forms</Text>
                    {nameForms.map((n, i) => (
                      <Pressable
                        key={`${n.dstrong}-${i}`}
                        style={styles.formRow}
                        onPress={() =>
                          router.push(`/study/${n.dstrong.slice(0, 5)}` as never)
                        }>
                        <Text style={styles.formScript}>{n.form ?? ''}</Text>
                        <Text style={styles.formMeta} numberOfLines={1}>
                          {n.translated ?? ''}
                        </Text>
                        <Text style={styles.formStrongs}>{n.dstrong.slice(0, 5)} ›</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <Text style={styles.sectionTitle}>
                  Appearances{total ? ` (${total.toLocaleString()})` : ''}
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.refRow} onPress={() => jumpTo(item)}>
            <Text style={styles.refRef}>
              {bookName(item.book)} {item.chapter}:{item.verse}
            </Text>
            <Text style={styles.refText} numberOfLines={2}>
              {item.text ?? ''}
            </Text>
          </Pressable>
        )}
        onEndReached={() => {
          if (refs.hasNextPage && !refs.isFetchingNextPage) refs.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          refs.isFetchingNextPage ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.accent} />
          ) : null
        }
        ListEmptyComponent={
          refs.isLoading || card.isLoading ? null : (
            <Text style={styles.empty}>No appearances found.</Text>
          )
        }
      />
    </View>
  );
}

const BOOK_CODES = new Set(
  ('Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro ' +
    'Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal ' +
    'Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas ' +
    '1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev').split(' '),
);

/** Citation chips: MT refs jump to the Reader; other witnesses render plain. */
function CitationChip({ citation }: { citation: string }) {
  const styles = useSheet(sheets);
  const m = citation.match(/^([1-3]?[A-Z][a-z]{1,2})\s+(\d+):(\d+)$/);
  const tappable = !!m && BOOK_CODES.has(m[1]);
  const chip = (
    <Text style={[styles.citation, tappable && styles.citationLink]}>
      {displayRef(citation)}
    </Text>
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

const sheets = themedSheets((colors) => StyleSheet.create({
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
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  name: { fontSize: 28, fontWeight: '700', color: colors.ink },
  kindChip: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.faint,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  desc: { fontSize: 14, color: colors.ink, marginTop: 6, lineHeight: 20 },
  meta: { fontSize: 12, color: colors.faint, marginTop: 3 },
  mapBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 10,
  },
  mapBtnText: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.accent, marginBottom: 10 },
  sodCard: { backgroundColor: '#22304A', borderColor: '#22304A' },
  sodTitle: { fontSize: 14, fontWeight: '700', color: '#E8DEC8', marginBottom: 4 },
  sodSub: { fontSize: 12, color: '#9FA9BE', marginBottom: 12, lineHeight: 17 },
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
  linkRow: { marginBottom: 8 },
  linkLabel: { fontSize: 11, fontWeight: '700', color: colors.faint, marginBottom: 4 },
  linkChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontSize: 13,
    color: colors.faint,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  chipLink: { color: colors.accent, fontWeight: '600' },
  formRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  formScript: { fontSize: 18, color: colors.ink },
  formMeta: { flex: 1, fontSize: 12, color: colors.faint },
  formStrongs: { fontSize: 12, color: colors.accent, fontWeight: '600' },
  refRow: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 6,
  },
  refRef: { color: colors.accent, fontWeight: '600', fontSize: 12 },
  refText: { color: colors.ink, fontSize: 13, lineHeight: 18, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.faint, marginTop: 24 },
}));
