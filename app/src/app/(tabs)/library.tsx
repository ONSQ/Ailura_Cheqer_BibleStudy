import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { getLibraryWorks, type LibraryWork } from '@/lib/api';
import { workTitle } from '@/lib/names';
import { themedSheets, useSheet, useTheme } from '@/lib/theme';

const CORPUS_LABEL: Record<string, string> = {
  Josephus: 'Josephus',
  Philo: 'Philo of Alexandria',
  'Second Temple': 'Second Temple writings',
};

const CORPUS_BLURB: Record<string, string> = {
  Josephus: 'Jewish historian, first century AD. Greek with Whiston’s translation.',
  Philo: 'Jewish philosopher of Alexandria, first century. Greek with Yonge’s translation.',
  'Second Temple': '1 Enoch, Jubilees, the Testaments, Maccabees, and more.',
};

export default function Library() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const works = useQuery({ queryKey: ['library-works'], queryFn: getLibraryWorks });

  const sections = ['Josephus', 'Philo', 'Second Temple']
    .map((corpus) => ({
      title: CORPUS_LABEL[corpus],
      blurb: CORPUS_BLURB[corpus],
      data: (works.data ?? []).filter((w) => w.corpus === corpus),
    }))
    .filter((s) => s.data.length > 0);

  const open = (w: LibraryWork) =>
    router.push({
      pathname: '/library-work',
      params: { corpus: w.corpus, work: w.work },
    } as never);

  return (
    <View style={styles.screen}>
      {works.isLoading && <ActivityIndicator style={{ marginTop: 48 }} color={colors.accent} />}
      {works.isError && (
        <Text style={styles.error}>Could not load the library. Check your connection.</Text>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(w) => `${w.corpus}:${w.work}`}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <Text style={styles.lead}>
            Writings from the centuries around the New Testament. Not Scripture, but the world
            in which Scripture was read: witnesses to how its words were understood.
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBlurb}>{section.blurb}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => open(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.workTitle}>{workTitle(item.work)}</Text>
              <Text style={styles.workMeta}>{item.passages.toLocaleString()} passages</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  lead: { fontSize: 14, color: colors.faint, lineHeight: 20, marginBottom: 16 },
  error: { color: colors.danger, margin: 16 },
  sectionHead: { marginTop: 12, marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.accent },
  sectionBlurb: { fontSize: 12, color: colors.faint, marginTop: 2, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
  },
  workTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  workMeta: { fontSize: 12, color: colors.faint, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.faint, marginLeft: 8 },
}));
