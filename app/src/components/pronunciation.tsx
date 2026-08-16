import { Pressable, StyleSheet, Text, View } from 'react-native';

import { speakWord, translitSyllables } from '@/lib/speech';
import { colors } from '@/lib/theme';

/**
 * Syllable-by-syllable pronunciation line with a speak-aloud button.
 * Stressed syllables (capitalized in STEPBible translits) show in accent.
 */
export function Pronunciation({
  translit,
  speak,
  strongs,
  size = 14,
  onDark = false,
}: {
  translit: string | null | undefined;
  speak: string; // what the TTS should say (surface form or lemma)
  strongs: string | null | undefined;
  size?: number;
  onDark?: boolean;
}) {
  if (!translit) return null;
  const sylls = translitSyllables(translit);
  return (
    <View style={styles.row}>
      <Text style={{ fontSize: size }}>
        {sylls.map((s, i) => (
          <Text
            key={i}
            style={[
              { color: onDark ? '#9FA9BE' : colors.faint, fontSize: size },
              s.stressed && {
                color: onDark ? '#C9A96A' : colors.accent,
                fontWeight: '700',
              },
            ]}>
            {s.text}
            {i < sylls.length - 1 ? '·' : ''}
          </Text>
        ))}
      </Text>
      <Pressable
        onPress={(e) => {
          e?.stopPropagation?.(); // don't trigger the row underneath
          speakWord(speak, strongs, translit);
        }}
        hitSlop={10}
        accessibilityLabel="Pronounce">
        <Text style={{ fontSize: size + 2 }}>🔊</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
