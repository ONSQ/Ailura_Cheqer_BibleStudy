import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { captureEmail } from '@/lib/api';
import { themedSheets, useSheet, useTheme } from '@/lib/theme';

const SEEN_KEY = 'cheqer-welcome-v1';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/**
 * First-run welcome: what Cheqer is, optional email signup with explicit
 * marketing consent, and a nudge toward creating a free account for notes.
 * Shows once; skippable; never gates the app.
 */
export function WelcomeSheet() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then((v) => {
      if (!v) setVisible(true);
    });
  }, []);

  const dismiss = () => {
    AsyncStorage.setItem(SEEN_KEY, 'seen').catch(() => {});
    setVisible(false);
  };

  const canSubmit = EMAIL_RE.test(email.trim()) && consent && status !== 'saving';

  const submit = async () => {
    if (!canSubmit) return;
    setStatus('saving');
    try {
      await captureEmail(email.trim(), true);
      setStatus('done');
      setTimeout(dismiss, 900);
    } catch {
      setStatus('error');
    }
  };

  const toStudies = () => {
    dismiss();
    router.push('/studies' as never);
  };

  if (!visible) return null;
  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.hebrew}>חֵקֶר</Text>
            <Text style={styles.title}>Welcome to Cheqer</Text>
            <Text style={styles.body}>
              A free word-study Bible. Tap any word to see the Hebrew or Greek behind it, ask
              questions of the text, and search out how Scripture uses its words.
            </Text>

            <Text style={styles.sectionLabel}>Stay in touch</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (status === 'error') setStatus('idle');
              }}
            />
            <Pressable style={styles.consentRow} onPress={() => setConsent((v) => !v)} hitSlop={6}>
              <View style={[styles.checkbox, consent && styles.checkboxOn]}>
                {consent ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.consentText}>
                Send me occasional email updates about Cheqer and Ailura. Unsubscribe anytime.
              </Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, !canSubmit && styles.btnDisabled]}
              disabled={!canSubmit}
              onPress={submit}>
              <Text style={styles.primaryBtnText}>
                {status === 'done' ? 'Thank you ✓' : status === 'saving' ? 'Saving…' : 'Count me in'}
              </Text>
            </Pressable>
            {status === 'error' ? (
              <Text style={styles.errorText}>Could not save that just now. You can skip and try later.</Text>
            ) : null}

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>Keep your studies</Text>
            <Text style={styles.smallBody}>
              Create a free account to save notes, build word studies, and share them with your
              group.
            </Text>
            <Pressable style={styles.secondaryBtn} onPress={toStudies}>
              <Text style={styles.secondaryBtnText}>Create a free account</Text>
            </Pressable>

            <Pressable onPress={dismiss} hitSlop={8}>
              <Text style={styles.skip}>Maybe later, take me to the text</Text>
            </Pressable>
          </ScrollView>
      </View>
    </View>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    backgroundColor: 'rgba(20,16,10,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
  },
  hebrew: { fontSize: 36, color: colors.ink, textAlign: 'center' },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    marginTop: 2,
  },
  body: {
    fontSize: 14,
    color: colors.ink,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 18,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bg,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  consentText: { flex: 1, fontSize: 12, color: colors.faint, lineHeight: 17 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  btnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginTop: 18 },
  smallBody: { fontSize: 13, color: colors.ink, lineHeight: 19 },
  secondaryBtn: {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryBtnText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  skip: { color: colors.faint, fontSize: 13, textAlign: 'center', marginTop: 14, padding: 4 },
}));
