import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { themedSheets, useSheet } from '@/lib/theme';

const SEEN_KEY = 'cheqer-app-banner-v1';

/**
 * Web only: a one-line notice under the Reader header that the phone apps
 * exist, pointing at /get-the-app. Dismissed once, it stays gone on that
 * browser. Never shown inside the phone apps themselves.
 */
export function GetAppBanner() {
  const styles = useSheet(sheets);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    AsyncStorage.getItem(SEEN_KEY).then((v) => {
      if (!v) setVisible(true);
    });
  }, []);

  if (!visible) return null;
  const dismiss = () => {
    AsyncStorage.setItem(SEEN_KEY, 'seen').catch(() => {});
    setVisible(false);
  };
  return (
    <View style={styles.bar}>
      <Pressable style={styles.main} onPress={() => router.push('/get-the-app' as never)}>
        <Text style={styles.text}>
          📱 Cheqer is now an app for iPhone and Android.{' '}
          <Text style={styles.cta}>Get the app →</Text>
        </Text>
      </Pressable>
      <Pressable onPress={dismiss} hitSlop={10} accessibilityLabel="Dismiss">
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.accentSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  main: { flex: 1 },
  text: { fontSize: 13, color: colors.ink, lineHeight: 18 },
  cta: { color: colors.accent, fontWeight: '700' },
  close: { color: colors.faint, fontSize: 14, paddingHorizontal: 4 },
}));
