import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { themedSheets, useSheet, useTheme, type ThemeMode } from '@/lib/theme';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function ThemePicker() {
  const styles = useSheet(sheets);
  const { mode, setMode } = useTheme();
  return (
    <View style={styles.modeRow}>
      {MODES.map((m) => (
        <Pressable
          key={m.value}
          style={[styles.modeBtn, mode === m.value && styles.modeBtnOn]}
          onPress={() => setMode(m.value)}>
          <Text style={[styles.modeBtnText, mode === m.value && styles.modeBtnTextOn]}>
            {m.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Link({ label, url }: { label: string; url: string }) {
  const styles = useSheet(sheets);
  return (
    <Pressable onPress={() => Linking.openURL(url)}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

export default function About() {
  const styles = useSheet(sheets);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hebrew}>חֵקֶר</Text>
      <Text style={styles.name}>Cheqer Bible Study</Text>
      <Text style={styles.definition}>
        Cheqer (חֵקֶר, pronounced KHAY-ker) is Hebrew for a searching out, a deep inquiry into a
        matter.
      </Text>
      <Text style={styles.verse}>
        “It is the glory of God to conceal a matter, but the glory of kings is to search out a
        matter.” (Proverbs 25:2)
      </Text>
      <Text style={styles.byline}>powered by Ailura</Text>
      <Link label="ailura.net" url="https://ailura.net" />

      <Text style={styles.sectionTitle}>What this app does</Text>
      <Text style={styles.body}>
        Cheqer is a word-study Bible. Read in English with the Hebrew or Greek underneath, then
        tap any word to see the original word behind it: its root, meaning, pronunciation, and
        every place it appears in Scripture. Each word study shows how translators render the
        word, how the Septuagint carries it into Greek, and a written brief tracing its use from
        the Torah through the prophets, with a citation for every claim.
      </Text>
      <Text style={[styles.body, { marginTop: 12 }]}>
        You can also select a verse or passage and ask questions about it in plain English,
        explore themes and connections across chapters, and save what you find as notes, kept
        private or shared with your study group.
      </Text>

      <Text style={styles.sectionTitle}>Appearance</Text>
      <ThemePicker />

      <Text style={styles.sectionTitle}>Data credits</Text>
      <Text style={styles.body}>
        Original-language text and tagging: TAHOT and TAGNT by Tyndale House, Cambridge and STEP
        Bible, licensed CC BY 4.0.
      </Text>
      <Link label="www.TyndaleHouse.com" url="https://www.TyndaleHouse.com" />
      <Link label="www.STEPBible.org" url="https://www.STEPBible.org" />
      <Text style={[styles.body, { marginTop: 12 }]}>
        Septuagint text and tagging: CenterBLC LXX (Rahlfs 1935), MIT license.
      </Text>
      <Link label="github.com/CenterBLC/LXX" url="https://github.com/CenterBLC/LXX" />
      <Text style={[styles.body, { marginTop: 12 }]}>
        Targum Onkelos: Public Domain text via Sefaria.
      </Text>
      <Link label="www.sefaria.org" url="https://www.sefaria.org" />
    </ScrollView>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, alignItems: 'center' },
  hebrew: { fontSize: 44, color: colors.ink, marginTop: 12 },
  name: { fontSize: 24, fontWeight: '700', color: colors.ink, marginTop: 4 },
  definition: {
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 10,
  },
  verse: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.faint,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 14,
  },
  byline: { fontSize: 13, color: colors.accent, marginTop: 18 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 32,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  body: { fontSize: 14, color: colors.ink, lineHeight: 21, alignSelf: 'flex-start' },
  link: { fontSize: 14, color: colors.link, marginTop: 6, textDecorationLine: 'underline' },
  modeRow: { flexDirection: 'row', gap: 8, alignSelf: 'flex-start' },
  modeBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modeBtnOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  modeBtnText: { fontSize: 14, color: colors.faint, fontWeight: '600' },
  modeBtnTextOn: { color: colors.accent },
}));
