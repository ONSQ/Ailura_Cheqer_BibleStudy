import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EditStudyModal } from '@/components/edit-study';
import { displayRef } from '@/lib/names';
import { shareText } from '@/lib/share';
import {
  createStudy,
  deleteStudy,
  getStudy,
  getUserId,
  relativeDate,
  updateStudy,
} from '@/lib/studies';
import { themedSheets, useSheet, useTheme } from '@/lib/theme';

const BOOK_RE = /^([1-3]?[A-Za-z]{2,3})\s+(\d+):(\d+)/;

/** Full view of one study: read it, follow its anchors, work on it. */
export default function StudyNote() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getUserId().then(setUserId);
  }, []);

  const study = useQuery({
    queryKey: ['study-note', id],
    queryFn: () => getStudy(Number(id)),
    enabled: !!id,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['studies'] });
    qc.invalidateQueries({ queryKey: ['study-note', id] });
  };

  const publish = useMutation({
    mutationFn: () => updateStudy(Number(id), { is_shared: !study.data?.is_shared }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => deleteStudy(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studies'] });
      router.back();
    },
  });
  const saveCopy = useMutation({
    mutationFn: () =>
      createStudy({
        title: study.data?.title ?? 'Copied study',
        notes: study.data?.notes ?? '',
        strongs: study.data?.strongs ?? undefined,
        ref: study.data?.ref ?? undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studies'] });
      setStatus('Copied to your studies ✓');
    },
  });

  const s = study.data;
  const mine = !!s && !!userId && s.owner === userId;

  const jumpToRef = (ref: string) => {
    const m = ref.match(BOOK_RE);
    if (m) {
      router.push({ pathname: '/', params: { book: m[1], chapter: m[2], verse: m[3] } });
    }
  };

  const shareOut = async () => {
    if (!s) return;
    const outcome = await shareText(
      `${s.title ?? 'A Cheqer study'}\n\n${s.notes ?? ''}\n\n— Cheqer Bible Study`,
    );
    if (outcome === 'copied') setStatus('Copied to clipboard ✓');
    else if (outcome === 'failed') setStatus('Could not share');
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: s?.title ?? 'Study' }} />
      {study.isLoading && <ActivityIndicator style={{ marginTop: 48 }} color={colors.accent} />}
      {!study.isLoading && !s && (
        <Text style={styles.missing}>
          This study is not available. It may be private or deleted, or you may need to sign in
          on the Studies tab.
        </Text>
      )}
      {s && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{s.title ?? 'Untitled study'}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.badge, s.is_shared ? styles.badgeShared : null]}>
              {s.is_shared ? '🌍 published' : '🔒 private'}
            </Text>
            <Text style={styles.meta}>
              {mine ? 'yours' : 'from the community'} · {relativeDate(s.created_at)}
            </Text>
          </View>

          {(s.ref || s.strongs) && (
            <View style={styles.anchorRow}>
              {s.ref ? (
                <Pressable style={styles.anchor} onPress={() => jumpToRef(s.ref!)}>
                  <Text style={styles.anchorText}>📖 {displayRef(s.ref!)}</Text>
                </Pressable>
              ) : null}
              {s.strongs ? (
                <Pressable
                  style={styles.anchor}
                  onPress={() => router.push(`/study/${s.strongs}` as never)}>
                  <Text style={styles.anchorText}>🔤 Word study · {s.strongs}</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <View style={styles.notesCard}>
            {s.notes ? (
              <Text style={styles.notes} selectable>
                {s.notes}
              </Text>
            ) : (
              <Text style={styles.notesEmpty}>
                No notes yet. {mine ? 'Tap Edit and start writing.' : ''}
              </Text>
            )}
          </View>

          <View style={styles.actions}>
            {mine && (
              <Pressable style={styles.actionBtn} onPress={() => setEditing(true)}>
                <Text style={styles.actionText}>✏️ Edit</Text>
              </Pressable>
            )}
            {mine && (
              <Pressable
                style={styles.actionBtn}
                disabled={publish.isPending}
                onPress={() => publish.mutate()}>
                <Text style={styles.actionText}>
                  {s.is_shared ? '🔒 Make private' : '🌍 Publish to everyone'}
                </Text>
              </Pressable>
            )}
            <Pressable style={styles.actionBtn} onPress={shareOut}>
              <Text style={styles.actionText}>📤 Share</Text>
            </Pressable>
            {!mine && userId && (
              <Pressable
                style={styles.actionBtn}
                disabled={saveCopy.isPending}
                onPress={() => saveCopy.mutate()}>
                <Text style={styles.actionText}>💾 Save a copy</Text>
              </Pressable>
            )}
            {mine &&
              (confirmDelete ? (
                <Pressable
                  style={[styles.actionBtn, styles.actionDanger]}
                  disabled={remove.isPending}
                  onPress={() => remove.mutate()}>
                  <Text style={[styles.actionText, styles.actionDangerText]}>
                    Really delete?
                  </Text>
                </Pressable>
              ) : (
                <Pressable style={styles.actionBtn} onPress={() => setConfirmDelete(true)}>
                  <Text style={styles.actionText}>🗑️ Delete</Text>
                </Pressable>
              ))}
          </View>
          {status ? <Text style={styles.status}>{status}</Text> : null}
          {s.is_shared && mine && (
            <Text style={styles.publishNote}>
              Published studies are visible to everyone signed in to Cheqer.
            </Text>
          )}
        </ScrollView>
      )}
      {editing && s && (
        <EditStudyModal study={s} onClose={() => setEditing(false)} onSaved={invalidate} />
      )}
    </View>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  missing: { color: colors.faint, margin: 24, textAlign: 'center', lineHeight: 21 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  badge: {
    fontSize: 12,
    color: colors.faint,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  badgeShared: { color: colors.accent, borderColor: colors.accent },
  meta: { fontSize: 12, color: colors.faint },
  anchorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  anchor: {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  anchorText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  notesCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginTop: 14,
  },
  notes: { fontSize: 15, color: colors.ink, lineHeight: 23 },
  notesEmpty: { fontSize: 14, color: colors.faint, fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  actionBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  actionText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  actionDanger: { borderColor: colors.danger },
  actionDangerText: { color: colors.danger },
  status: { color: colors.faint, fontSize: 12, marginTop: 10 },
  publishNote: { color: colors.faint, fontSize: 12, marginTop: 12, lineHeight: 17 },
}));
