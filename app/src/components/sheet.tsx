import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Scrim + sheet layout for a transparent Modal. The tap-to-close surface is
 * a Pressable laid under the sheet, not around it: a Pressable that wraps
 * the sheet claims every touch on Android, so a ScrollView inside the sheet
 * never receives the drag and the sheet appears frozen. Web never showed
 * the bug, which is why the wrapping form survived until the native builds.
 *
 * The sheet also keeps its bottom edge above the phone's navigation bar:
 * a transparent Modal draws edge to edge, so without the inset the last row
 * of a picker sits under the system buttons.
 */
export function Sheet({
  onClose,
  scrimStyle,
  sheetStyle,
  children,
}: {
  onClose: () => void;
  scrimStyle: StyleProp<ViewStyle>;
  sheetStyle: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={scrimStyle}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={[sheetStyle, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>{children}</View>
    </View>
  );
}
