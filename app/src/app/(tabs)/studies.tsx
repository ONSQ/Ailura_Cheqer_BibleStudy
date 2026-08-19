import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import {
  listStudies,
  relativeDate,
  signIn,
  signOut,
  signUp,
  updateStudy,
  type WordStudy,
} from '@/lib/studies';
import { themedSheets, useSheet, useTheme } from '@/lib/theme';

export default function SharedStudies() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!authReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return userId ? <StudyList userId={userId} /> : <SignIn />;
}

function SignIn() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (mode: 'in' | 'up') => {
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'in') {
        await signIn(email.trim(), password);
      } else {
        const { needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation) setMessage('Check your email to confirm your account, then sign in.');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Studies</Text>
        <Text style={styles.body}>
          Sign in to build word studies, keep notes, and publish the good ones for everyone
          using Cheqer. Notes stay private unless you publish them.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="email"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="password"
          placeholderTextColor={colors.faint}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={() => submit('in')}>
            <Text style={styles.buttonText}>Sign in</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.buttonGhost, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={() => submit('up')}>
            <Text style={[styles.buttonText, styles.buttonGhostText]}>Create account</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.byline}>powered by Ailura</Text>
    </View>
  );
}

function studyIcon(s: WordStudy): string {
  if (s.strongs) return '🔤';
  if (s.ref) return '📖';
  return '✍️';
}

function StudyList({ userId }: { userId: string }) {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const qc = useQueryClient();
  const studies = useQuery({ queryKey: ['studies'], queryFn: listStudies });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['studies'] });
  const togglePublish = useMutation({
    mutationFn: (s: WordStudy) => updateStudy(s.id, { is_shared: !s.is_shared }),
    onSuccess: invalidate,
  });

  const mine = (studies.data ?? []).filter((s) => s.owner === userId);
  const community = (studies.data ?? []).filter((s) => s.owner !== userId);
  const sections = [
    { title: `My studies · ${mine.length}`, data: mine },
    ...(community.length
      ? [{ title: `From the community · ${community.length}`, data: community }]
      : []),
  ];

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.hint}>
              Tap a study to read and work on it. Publish your best ones for everyone using
              Cheqer.
            </Text>
            <Pressable onPress={() => signOut()} hitSlop={8}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        ListEmptyComponent={
          studies.isLoading ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
          ) : null
        }
        renderItem={({ item }) => {
          const isMine = item.owner === userId;
          return (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/study-note/${item.id}` as never)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {studyIcon(item)} {item.title ?? item.strongs ?? 'Study'}
                </Text>
                <Text style={[styles.badge, item.is_shared && styles.badgePublished]}>
                  {item.is_shared ? '🌍' : '🔒'}
                </Text>
              </View>
              {item.notes ? (
                <Text style={styles.body} numberOfLines={3}>
                  {item.notes}
                </Text>
              ) : null}
              <View style={styles.cardMetaRow}>
                <Text style={styles.cardMeta}>
                  {item.ref ?? item.strongs ?? ''}
                  {item.ref || item.strongs ? ' · ' : ''}
                  {relativeDate(item.created_at)}
                </Text>
                {isMine && (
                  <Pressable
                    hitSlop={6}
                    disabled={togglePublish.isPending}
                    onPress={() => togglePublish.mutate(item)}>
                    <Text style={styles.link}>
                      {item.is_shared ? 'Make private' : 'Publish'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        }}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListFooterComponent={
          !studies.isLoading && mine.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.body}>
                No studies of your own yet. Open a word study from the Reader and tap “Save
                study”, or save an answer from Ask as a note.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 21 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: colors.ink,
    marginTop: 10,
    backgroundColor: colors.bg,
  },
  message: { color: colors.accent, fontSize: 13, marginTop: 10 },
  buttonRow: { flexDirection: 'row', gap: 16, marginTop: 14, alignItems: 'center' },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700' },
  buttonGhost: { backgroundColor: colors.accentSoft },
  buttonGhostText: { color: colors.accent },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  hint: { flex: 1, fontSize: 12, color: colors.faint, lineHeight: 17 },
  signOut: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 10,
    marginBottom: 8,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, flex: 1 },
  badge: { fontSize: 13, color: colors.faint },
  badgePublished: { color: colors.accent },
  cardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  cardMeta: { fontSize: 12, color: colors.faint, flex: 1 },
  link: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  byline: { textAlign: 'center', color: colors.faint, fontSize: 12, marginTop: 'auto', marginBottom: 12 },
}));
