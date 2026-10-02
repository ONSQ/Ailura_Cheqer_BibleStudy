import { Image } from 'expo-image';

import { useTheme } from '@/lib/theme';

// Derived from the masters in assets/brand by tools/make_brand_assets.py.
const HEADER = require('@/assets/images/cheqer-header.png');
const HEADER_ON_DARK = require('@/assets/images/cheqer-header-dark.png');
const EMBLEM = require('@/assets/images/cheqer-emblem.png');

const HEADER_ASPECT = 1000 / 368;

/**
 * The "Cheqer" wordmark. Its letters are navy, so dark grounds get the
 * reversed cut with cream letters; onDark forces that cut for surfaces
 * that are dark in both themes (the splash).
 */
export function BrandHeader({ width, onDark }: { width: number; onDark?: boolean }) {
  const { scheme } = useTheme();
  return (
    <Image
      source={onDark || scheme === 'dark' ? HEADER_ON_DARK : HEADER}
      style={{ width, height: width / HEADER_ASPECT }}
      contentFit="contain"
      accessibilityLabel="Cheqer"
    />
  );
}

/** The gold Q emblem on its own; reads on light and dark grounds alike. */
export function BrandEmblem({ size }: { size: number }) {
  return (
    <Image
      source={EMBLEM}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="Cheqer"
    />
  );
}
