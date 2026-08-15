import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

/**
 * Shared Studies stub. Auth wiring comes next: Supabase Auth + RLS on
 * word_studies (owner CRUDs own rows, group members read is_shared = true).
 */
export default function SharedStudies() {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Shared studies</Text>
        <Text style={styles.body}>
          Word studies you and the group save will show up here. Each man sees the studies shared
          with the group plus his own.
        </Text>
      </View>
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.mutedTitle}>Sign-in coming soon</Text>
        <Text style={styles.body}>
          This screen gets wired to Supabase Auth in the next step. Notes stay private unless you
          mark them shared.
        </Text>
      </View>
      <Text style={styles.byline}>powered by Ailura</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
  },
  cardMuted: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  mutedTitle: { fontSize: 15, fontWeight: '700', color: colors.accent, marginBottom: 6 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 21 },
  byline: { textAlign: 'center', color: colors.faint, fontSize: 12, marginTop: 'auto', marginBottom: 12 },
});
