import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Scrim + sheet layout for a transparent Modal. The tap-to-close surface is
 * a Pressable laid under the sheet, not around it: a Pressable that wraps
 * the sheet claims every touch on Android, so a ScrollView inside the sheet
 * never receives the drag and the sheet appears frozen. Web never showed
 * the bug, which is why the wrapping form survived until the native builds.
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
  return (
    <View style={scrimStyle}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={sheetStyle}>{children}</View>
    </View>
  );
}
