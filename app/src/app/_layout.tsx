import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { WelcomeSheet } from '@/components/welcome';
import { ThemeProvider, colors, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

function BrandSplash({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    SplashScreen.hideAsync();
    const fade = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 450, useNativeDriver: false }).start();
    }, 1500);
    // The animation completion callback does not fire on web; use a timer.
    const done = setTimeout(onDone, 2000);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [onDone, opacity]);
  return (
    <Animated.View pointerEvents="none" style={[styles.splash, { opacity }]}>
      <Text style={styles.splashHebrew}>חֵקֶר</Text>
      <Text style={styles.splashName}>Cheqer</Text>
      <View style={styles.splashRule} />
      <Text style={styles.splashVerse}>
        “It is the glory of God to conceal a matter, but the glory of kings is to search out a
        matter.”
      </Text>
      <Text style={styles.splashRef}>Proverbs 25:2</Text>
      <Text style={styles.splashByline}>powered by Ailura</Text>
    </Animated.View>
  );
}

function ThemedApp() {
  const [splashDone, setSplashDone] = useState(false);
  const { palette, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.ink,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: palette.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="study/[strongs]" options={{ title: 'Word Study' }} />
        <Stack.Screen name="study-note/[id]" options={{ title: 'Study' }} />
        <Stack.Screen name="about" options={{ title: 'About Cheqer', presentation: 'modal' }} />
        <Stack.Screen name="ask" options={{ title: 'Ask' }} />
      </Stack>
      {splashDone && <WelcomeSheet />}
      {!splashDone && <BrandSplash onDone={() => setSplashDone(true)} />}
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.splashBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    zIndex: 10,
  },
  splashHebrew: { color: colors.splashInk, fontSize: 56, marginBottom: 4 },
  splashName: { color: colors.splashInk, fontSize: 34, fontWeight: '700', letterSpacing: 1 },
  splashRule: { width: 56, height: 2, backgroundColor: colors.bar, marginVertical: 18 },
  splashVerse: {
    color: colors.splashInk,
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
  },
  splashRef: { color: colors.bar, fontSize: 13, marginTop: 8 },
  splashByline: { color: colors.splashInk, opacity: 0.7, fontSize: 13, marginTop: 40 },
});
