import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { shareText } from '@/lib/share';
import { themedSheets, useSheet } from '@/lib/theme';

/**
 * Share button with its own feedback. `build` composes the text at tap time
 * so it carries whatever has loaded by then. Phones open the system share
 * sheet (Messages, WhatsApp, Mail, social apps); the web uses the browser's
 * share sheet where one exists and otherwise copies to the clipboard.
 */
export function ShareButton({
  build,
  title,
  label = 'Share',
  onDark = false,
}: {
  build: () => string;
  title?: string;
  label?: string;
  onDark?: boolean;
}) {
  const styles = useSheet(sheets);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(t);
  }, [status]);

  const run = async () => {
    const outcome = await shareText(build(), title);
    if (outcome === 'copied') setStatus('Copied, paste it anywhere ✓');
    else if (outcome === 'failed') setStatus('Could not share');
  };

  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.btn, onDark && styles.btnDark]}
        onPress={run}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <Text style={[styles.text, onDark && styles.textDark]}>📤 {label}</Text>
      </Pressable>
      {status ? <Text style={[styles.status, onDark && styles.statusDark]}>{status}</Text> : null}
    </View>
  );
}

const sheets = themedSheets((colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    btn: {
      alignSelf: 'flex-start',
      backgroundColor: colors.accentSoft,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    btnDark: { backgroundColor: 'rgba(201,169,106,0.18)' },
    text: { color: colors.accent, fontWeight: '700', fontSize: 13 },
    textDark: { color: '#C9A96A' },
    status: { color: colors.faint, fontSize: 12 },
    statusDark: { color: '#9FA9BE' },
  }),
);
