import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { updateStudy, type WordStudy } from '@/lib/studies';
import { themedSheets, useSheet, useTheme } from '@/lib/theme';

/** Title + notes editor for a study, shared by the list and detail screens. */
export function EditStudyModal({
  study,
  onClose,
  onSaved,
}: {
  study: WordStudy;
  onClose: () => void;
  onSaved: (updated: WordStudy) => void;
}) {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const [title, setTitle] = useState(study.title ?? '');
  const [notes, setNotes] = useState(study.notes ?? '');
  const save = useMutation({
    mutationFn: () => updateStudy(study.id, { title, notes }),
    onSuccess: (updated) => {
      onSaved(updated);
      onClose();
    },
  });
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalScrim} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <Text style={styles.title}>Edit study</Text>
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

const sheets = themedSheets((colors) => StyleSheet.create({
  modalScrim: { flex: 1, backgroundColor: 'rgba(20,16,10,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    padding: 16,
    paddingBottom: 28,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 6 },
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
  notesInput: { minHeight: 180, textAlignVertical: 'top' },
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
}));
