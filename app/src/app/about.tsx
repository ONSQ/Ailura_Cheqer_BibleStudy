import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SUPPORT_URL } from '@/lib/links';
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

      <Text style={styles.sectionTitle}>Keeping it free</Text>
      <Text style={styles.body}>
        Cheqer is free for personal study and always will be. If it blesses your study and you
        want to help cover the small costs of running it, a coffee goes a long way.
      </Text>
      {SUPPORT_URL ? (
        <Link label="Buy me a coffee ☕" url={SUPPORT_URL} />
      ) : (
        <Text style={[styles.body, { marginTop: 6, fontStyle: 'italic' }]}>
          Support link coming soon.
        </Text>
      )}

      <Text style={styles.sectionTitle}>Hearing the words</Text>
      <Text style={styles.body}>
        Every pronunciation guide has a speaker button that reads the Hebrew or Greek aloud. The
        app speaks with the voices your device provides, so quality varies: phones usually sound
        natural, while some desktop browsers fall back to older voices. On a computer, Microsoft
        Edge and Chrome come with the best voices built in, and the app automatically picks the
        most natural one it finds.
      </Text>
      <Text style={[styles.body, { marginTop: 12 }]}>
        For the clearest Hebrew and Greek on a computer, add those speech voices to your system:
      </Text>
      <Link
        label="Add voices on Windows"
        url="https://support.microsoft.com/en-us/topic/download-languages-and-voices-for-immersive-reader-read-mode-and-read-aloud-4c83a8d8-7486-42f7-8e46-2b0fdf753130"
      />
      <Link
        label="Add voices on macOS"
        url="https://support.apple.com/guide/mac-help/change-the-voice-your-mac-uses-to-speak-text-mchlp2290/mac"
      />

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
        Targum Onkelos and Second Temple apocrypha: public domain texts via Sefaria.
      </Text>
      <Link label="www.sefaria.org" url="https://www.sefaria.org" />
      <Text style={[styles.body, { marginTop: 12 }]}>
        Josephus: Greek text and Whiston translation via the Perseus Digital Library, CC BY-SA
        4.0.
      </Text>
      <Link label="www.perseus.tufts.edu" url="https://www.perseus.tufts.edu" />
      <Text style={[styles.body, { marginTop: 12 }]}>
        Philo: Greek text via OpenGreekAndLatin First1KGreek, CC BY-SA 4.0; Yonge translation
        public domain.
      </Text>
      <Link
        label="opengreekandlatin.org"
        url="https://opengreekandlatin.github.io/First1KGreek/"
      />
      <Text style={[styles.body, { marginTop: 12 }]}>
        1 Enoch: R. H. Charles translation (1917), public domain, via Wikisource.
      </Text>
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
