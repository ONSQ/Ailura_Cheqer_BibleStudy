import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import {
  deleteStudy,
  listStudies,
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
        <Text style={styles.title}>Shared studies</Text>
        <Text style={styles.body}>
          Sign in to save word studies and see what the group has shared. Notes stay private
          unless you mark them shared.
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

function jumpToStudyRef(ref: string) {
  const m = ref.match(/^([1-3]?[A-Za-z]{2,3})\s+(\d+):(\d+)/);
  if (m) {
    router.push({ pathname: '/', params: { book: m[1], chapter: m[2], verse: m[3] } });
  }
}

function EditStudyModal({
  study,
  onClose,
  onSaved,
}: {
  study: WordStudy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const [title, setTitle] = useState(study.title ?? '');
  const [notes, setNotes] = useState(study.notes ?? '');
  const save = useMutation({
    mutationFn: () => updateStudy(study.id, { title, notes }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalScrim} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <Text style={styles.title}>Edit note</Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={colors.faint}
            />
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes — build your study here"
              placeholderTextColor={colors.faint}
              multiline
            />
            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.button, save.isPending && styles.buttonDisabled]}
                disabled={save.isPending}
                onPress={() => save.mutate()}>
                <Text style={styles.buttonText}>{save.isPending ? 'Saving…' : 'Save'}</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.buttonGhost]} onPress={onClose}>
                <Text style={[styles.buttonText, styles.buttonGhostText]}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StudyList({ userId }: { userId: string }) {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const qc = useQueryClient();
  const studies = useQuery({ queryKey: ['studies'], queryFn: listStudies });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['studies'] });
  const toggleShare = useMutation({
    mutationFn: (s: WordStudy) => updateStudy(s.id, { is_shared: !s.is_shared }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteStudy, onSuccess: invalidate });
  const [editing, setEditing] = useState<WordStudy | null>(null);

  return (
    <View style={styles.screen}>
      <FlatList
        data={studies.data ?? []}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.hint}>
              Save studies from any word study screen. Shared notes are visible to the whole
              group.
            </Text>
            <Pressable onPress={() => signOut()} hitSlop={8}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          studies.isLoading ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
          ) : (
            <View style={styles.card}>
              <Text style={styles.body}>
                No studies yet. Open a word study from the Reader and tap “Save study”.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const mine = item.owner === userId;
          return (
            <Pressable
              style={styles.card}
              onPress={() =>
                item.strongs
                  ? router.push(`/study/${item.strongs}` as never)
                  : item.ref
                    ? jumpToStudyRef(item.ref)
                    : undefined
              }>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.title ?? item.strongs ?? 'Study'}</Text>
                <Text style={styles.badge}>
                  {item.is_shared ? 'shared' : 'private'}
                  {mine ? '' : ' · group'}
                </Text>
              </View>
              {item.notes ? (
                <Text style={styles.body} numberOfLines={6}>
                  {item.notes}
                </Text>
              ) : null}
              {item.strongs || item.ref ? (
                <Text style={styles.cardMeta}>{item.ref ?? item.strongs}</Text>
              ) : null}
              {mine && (
                <View style={styles.buttonRow}>
                  <Pressable onPress={() => setEditing(item)} hitSlop={6}>
                    <Text style={styles.link}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => toggleShare.mutate(item)} hitSlop={6}>
                    <Text style={styles.link}>
                      {item.is_shared ? 'Make private' : 'Share with group'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => remove.mutate(item.id)} hitSlop={6}>
                    <Text style={[styles.link, styles.danger]}>Delete</Text>
                  </Pressable>
                </View>
              )}
            </Pressable>
          );
        }}
      />
      {editing && (
        <EditStudyModal study={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
      )}
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, flex: 1 },
  badge: { fontSize: 12, color: colors.faint },
  cardMeta: { fontSize: 12, color: colors.faint, marginTop: 6 },
  link: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  danger: { color: colors.danger },
  byline: { textAlign: 'center', color: colors.faint, fontSize: 12, marginTop: 'auto', marginBottom: 12 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(20,16,10,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    padding: 16,
    paddingBottom: 28,
  },
  notesInput: { minHeight: 180, textAlignVertical: 'top' },
}));
