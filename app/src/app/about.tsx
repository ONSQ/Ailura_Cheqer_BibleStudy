import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors } from '@/lib/theme';

function Link({ label, url }: { label: string; url: string }) {
  return (
    <Pressable onPress={() => Linking.openURL(url)}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

export default function About() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hebrew}>חֵקֶר</Text>
      <Text style={styles.name}>Cheqer Bible Study</Text>
      <Text style={styles.verse}>
        “It is the glory of God to conceal a matter, but the glory of kings is to search out a
        matter.” (Proverbs 25:2)
      </Text>
      <Text style={styles.byline}>powered by Ailura</Text>
      <Link label="getailura.com" url="https://getailura.com" />

      <Text style={styles.sectionTitle}>Data credits</Text>
      <Text style={styles.body}>
        Original-language text and tagging: TAHOT and TAGNT by Tyndale House, Cambridge and STEP
        Bible, licensed CC BY 4.0.
      </Text>
      <Link label="www.TyndaleHouse.com" url="https://www.TyndaleHouse.com" />
      <Link label="www.STEPBible.org" url="https://www.STEPBible.org" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, alignItems: 'center' },
  hebrew: { fontSize: 44, color: colors.ink, marginTop: 12 },
  name: { fontSize: 24, fontWeight: '700', color: colors.ink, marginTop: 4 },
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
  link: { fontSize: 14, color: '#2A5D8F', marginTop: 6, textDecorationLine: 'underline' },
});
