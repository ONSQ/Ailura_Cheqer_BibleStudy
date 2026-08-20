import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { themedSheets, useSheet } from '@/lib/theme';

/** How to Cheqer: the app's features as a guided tour, in reading order. */
export default function Guide() {
  const styles = useSheet(sheets);

  const Section = ({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {emoji} {title}
      </Text>
      {children}
    </View>
  );
  const P = ({ children }: { children: React.ReactNode }) => (
    <Text style={styles.body}>{children}</Text>
  );
  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <View style={styles.stepRow}>
      <Text style={styles.stepNum}>{n}</Text>
      <Text style={[styles.body, { flex: 1 }]}>{children}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        Cheqer is built around one move: see a word, search it out. Everything else grows from
        there.
      </Text>

      <Section emoji="📖" title="Read">
        <P>
          The Reader shows the English text with the Hebrew or Greek underneath. Use the chips
          in the header: the book and chapter open pickers that go all the way down to a verse,
          the version chip cycles BSB, KJV, and WEB, and the Heb/Grk chip hides the original
          line. You can also type a reference like John 3:16 straight into any picker.
        </P>
      </Section>

      <Section emoji="🔍" title="Search out a word">
        <Step n={1}>Tap any English word in a verse.</Step>
        <Step n={2}>
          A sheet shows the original word behind it: its root, meaning, and a 🔊 button that
          says it aloud, syllable by syllable.
        </Step>
        <Step n={3}>
          Tap that original word to open the full Word Study: how translators render it, how
          its meaning moves across the eras of the canon, how the Septuagint carried it into
          Greek, where Second Temple writers use the idea, and every occurrence in Scripture.
        </Step>
        <P>
          The panels marked Sod are the deeper counsel: ancient witnesses gathered around the
          word, each labeled with how strong its evidence is.
        </P>
      </Section>

      <Section emoji="💬" title="Ask questions">
        <P>
          Tap a verse and ask anything in plain English: what is it really saying, what are the
          themes, how does it connect with the rest of Scripture. Tap “+ more verses” to grow
          the selection into a passage first. Every answer is searched from the text, and each
          one carries a “How this was found” receipt showing the searches behind it.
        </P>
        <P>
          The Ask ✨ button in the header takes broader questions: “where does Scripture talk
          about the sons of God?” Answers come back with the verses found and the original
          words behind them.
        </P>
      </Section>

      <Section emoji="🏛️" title="Walk the Library">
        <P>
          The Library tab holds the writings from the centuries around the New Testament:
          Josephus, Philo, 1 Enoch, Jubilees, and more, readable in English. Not Scripture, but
          the world in which Scripture was read.
        </P>
      </Section>

      <Section emoji="✍️" title="Keep and publish studies">
        <Step n={1}>Save word studies and Ask answers as notes (free account needed).</Step>
        <Step n={2}>Open any study from the Studies tab to read it and build on it.</Step>
        <Step n={3}>
          Publish your best ones for everyone using Cheqer, and save a copy of any community
          study to make it your own.
        </Step>
      </Section>

      <Section emoji="🌗" title="Make it yours">
        <P>
          The About screen has the appearance switch (Auto follows your device), pronunciation
          voice tips for computers, and the data credits behind every panel.
        </P>
      </Section>

      <Pressable style={styles.cta} onPress={() => router.push('/')}>
        <Text style={styles.ctaText}>Open the Reader and tap a word →</Text>
      </Pressable>
    </ScrollView>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  lead: { fontSize: 15, color: colors.ink, lineHeight: 23, fontStyle: 'italic' },
  section: { marginTop: 22 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 22, marginBottom: 8 },
  stepRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentSoft,
    color: colors.accent,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 28,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
}));
