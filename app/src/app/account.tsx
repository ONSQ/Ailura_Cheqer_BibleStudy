import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CONTACT_EMAIL } from '@/lib/links';
import { deleteAccount } from '@/lib/studies';
import { supabase } from '@/lib/supabase';
import { themedSheets, useSheet, useTheme } from '@/lib/theme';

/**
 * Account deletion. Reachable in the app from the Studies tab and on the
 * web at /account, which is the deletion link the app stores ask for.
 */
export default function Account() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      qc.clear();
      setDeleted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Nothing was deleted.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {deleted ? (
        <View style={styles.card}>
          <Text style={styles.title}>Your account has been deleted</Text>
          <Text style={styles.body}>
            Your sign-in, your studies, and any mailing-list entry under your email address are
            gone. You can keep reading and studying without an account.
          </Text>
          <Pressable style={styles.button} onPress={() => router.replace('/')}>
            <Text style={styles.buttonText}>Back to the Reader</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.title}>Delete your account</Text>
            <Text style={styles.body}>Deleting your account removes, at once and for good:</Text>
            <Text style={styles.bullet}>• your sign-in (email address and password)</Text>
            <Text style={styles.bullet}>
              • every study you saved, including ones you published
            </Text>
            <Text style={styles.bullet}>
              • any mailing-list entry under the same email address
            </Text>
            <Text style={[styles.body, { marginTop: 10 }]}>
              Copies other people saved of your published studies stay with them. Reading, word
              studies, the Library, and Ask keep working without an account.
            </Text>
          </View>

          {email ? (
            <View style={styles.card}>
              <Text style={styles.body}>
                Signed in as <Text style={styles.strong}>{email}</Text>
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {confirming ? (
                <>
                  <Text style={[styles.body, { marginTop: 12 }]}>
                    This cannot be undone. Delete everything?
                  </Text>
                  <View style={styles.buttonRow}>
                    <Pressable
                      style={[styles.button, styles.danger, busy && styles.buttonDisabled]}
                      disabled={busy}
                      onPress={remove}>
                      <Text style={styles.buttonText}>
                        {busy ? 'Deleting…' : 'Yes, delete my account'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.button, styles.ghost]}
                      disabled={busy}
                      onPress={() => setConfirming(false)}>
                      <Text style={[styles.buttonText, styles.ghostText]}>Keep it</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable
                  style={[styles.button, styles.danger]}
                  onPress={() => setConfirming(true)}>
                  <Text style={styles.buttonText}>Delete my account</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.body}>
                Sign in first, so the app knows which account to delete. Then come back here
                from the Account link on the Studies tab.
              </Text>
              <Pressable style={styles.button} onPress={() => router.push('/studies' as never)}>
                <Text style={styles.buttonText}>Sign in</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.footnote}>
            Cannot sign in, or only want off the mailing list? Ask and it will be done by hand:
          </Text>
          <Pressable onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>
            <Text style={styles.link}>{CONTACT_EMAIL}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/privacy' as never)}>
            <Text style={styles.link}>Privacy policy</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48, maxWidth: 560, width: '100%', alignSelf: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 21 },
  bullet: { fontSize: 14, color: colors.ink, lineHeight: 21, marginTop: 4, paddingLeft: 4 },
  strong: { fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, marginTop: 10 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700' },
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: colors.accentSoft },
  ghostText: { color: colors.accent },
  footnote: { fontSize: 13, color: colors.faint, lineHeight: 19, marginTop: 8 },
  link: { fontSize: 14, color: colors.link, marginTop: 8, textDecorationLine: 'underline' },
}));
