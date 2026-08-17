import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getLibraryPassages } from '@/lib/api';
import { themedSheets, useSheet, useTheme } from '@/lib/theme';

const PAGE = 40;

export default function LibraryWork() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const { corpus, work } = useLocalSearchParams<{ corpus: string; work: string }>();
  const [showOriginal, setShowOriginal] = useState(false);

  const passages = useInfiniteQuery({
    queryKey: ['library', corpus, work],
    queryFn: ({ pageParam }) => getLibraryPassages(corpus!, work!, PAGE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.rows.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: !!corpus && !!work,
  });

  const rows = passages.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = passages.data?.pages[0]?.total ?? 0;
  const hasOriginal = rows.some((r) => r.content_en && r.content !== r.content_en);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: work ?? 'Library' }} />
      <FlatList
        data={rows}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.meta}>
              {total.toLocaleString()} passages · not Scripture, a period witness
            </Text>
            {hasOriginal && (
              <Pressable
                style={[styles.toggle, showOriginal && styles.toggleOn]}
                onPress={() => setShowOriginal((v) => !v)}>
                <Text style={[styles.toggleText, showOriginal && styles.toggleTextOn]}>
                  {showOriginal ? 'Original shown' : 'Show original'}
                </Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.passage}>
            <Text style={styles.ref}>{item.ref}</Text>
            {showOriginal && item.content_en && item.content !== item.content_en ? (
              <Text style={[styles.original, item.language === 'he' && styles.hebrew]}>
                {item.content}
              </Text>
            ) : null}
            <Text style={styles.body}>{item.content_en ?? item.content}</Text>
          </View>
        )}
        onEndReached={() => {
          if (passages.hasNextPage && !passages.isFetchingNextPage) {
            passages.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          passages.isFetchingNextPage ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.accent} />
          ) : null
        }
        ListEmptyComponent={
          passages.isLoading ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
          ) : (
            <Text style={styles.empty}>Nothing here yet.</Text>
          )
        }
      />
    </View>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  meta: { flex: 1, fontSize: 12, color: colors.faint, lineHeight: 17 },
  toggle: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  toggleOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  toggleText: { fontSize: 12, color: colors.faint, fontWeight: '600' },
  toggleTextOn: { color: colors.accent },
  passage: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  ref: { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 6 },
  original: { fontSize: 15, color: colors.faint, lineHeight: 23, marginBottom: 8 },
  hebrew: { fontSize: 18, textAlign: 'right', writingDirection: 'rtl' },
  body: { fontSize: 15, color: colors.ink, lineHeight: 23 },
  empty: { color: colors.faint, textAlign: 'center', marginTop: 32 },
}));
