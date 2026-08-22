import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getEntityCard, getEntityRefs, type EntityRef } from '@/lib/api';
import { bookName } from '@/lib/names';
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

/** TIPNR text carries light markup: <ref="...">, <strong="...">, <br>, <BR>. */
function cleanTipnr(text: string): string {
  return text
    .replace(/<BR>/g, '\n\n')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Who or where card: one TIPNR entity (person, place, or other named thing)
 * with family, name forms, and every appearance in Scripture.
 */
export default function EntityScreen() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const { ustrong } = useLocalSearchParams<{ ustrong: string }>();
  const [showArticle, setShowArticle] = useState(false);

  const card = useQuery({
    queryKey: ['entity', ustrong],
    queryFn: () => getEntityCard(ustrong!),
    enabled: !!ustrong,
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
                  {e.short_desc ? (
                    <Text style={styles.shortDesc}>{cleanTipnr(e.short_desc)}</Text>
                  ) : null}
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

                {e.article ? (
                  <View style={styles.card}>
                    <Pressable onPress={() => setShowArticle((v) => !v)}>
                      <Text style={styles.sectionTitle}>
                        About {e.name} {showArticle ? '▾' : '▸'}
                      </Text>
                    </Pressable>
                    {showArticle && (
                      <>
                        <Text style={styles.article}>{cleanTipnr(e.article)}</Text>
                        <Text style={styles.aiNote}>
                          Background summary from the STEPBible dataset (AI-assisted, curated
                          by Tyndale House). Weigh it against the verses below.
                        </Text>
                      </>
                    )}
                  </View>
                ) : null}

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
  shortDesc: { fontSize: 13, color: colors.faint, marginTop: 8, lineHeight: 19 },
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
  article: { fontSize: 14, color: colors.ink, lineHeight: 21, marginTop: 2 },
  aiNote: { fontSize: 11, color: colors.faint, marginTop: 8, lineHeight: 16 },
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
