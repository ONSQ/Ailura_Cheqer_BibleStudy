/**
 * Cheqer theming. Light: parchment ground, ink text, gold accent.
 * Dark: deep navy ground (harmonizing with the Sod cards), warm gold.
 * Components build a sheet per palette with themedSheets() and pick the
 * active one with useSheet(); inline colors come from useTheme().palette.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform } from 'react-native';

export interface Palette {
  bg: string;
  card: string;
  ink: string;
  faint: string;
  accent: string;
  accentSoft: string;
  border: string;
  bar: string;
  highlight: string;
  danger: string;
  link: string;
  successSoft: string;
  splashBg: string;
  splashInk: string;
}

export const light: Palette = {
  bg: '#FBF8F1',
  card: '#FFFFFF',
  ink: '#26211A',
  faint: '#8A8073',
  accent: '#8A6D3B',
  accentSoft: '#F0E6D2',
  border: '#E7DFCF',
  bar: '#C9A96A',
  highlight: '#FFF3C9',
  danger: '#A33333',
  link: '#2A5D8F',
  successSoft: '#DCEEDB',
  splashBg: '#1E2A3A',
  splashInk: '#F3EDDF',
};

export const dark: Palette = {
  bg: '#151A26',
  card: '#1E2534',
  ink: '#E9E3D4',
  faint: '#8D95A8',
  accent: '#D4B476',
  accentSoft: '#2B3348',
  border: '#2C3447',
  bar: '#C9A96A',
  highlight: '#413A1F',
  danger: '#E08A8A',
  link: '#8FB4DC',
  successSoft: '#24402A',
  splashBg: '#1E2A3A',
  splashInk: '#F3EDDF',
};

/** Kept for splash and any theme-independent use. */
export const colors = light;

export const fonts = {
  hebrewSize: 26,
  greekSize: 21,
};

export type ThemeMode = 'auto' | 'light' | 'dark';
type Scheme = 'light' | 'dark';

const STORAGE_KEY = 'cheqer-theme-mode';

const ThemeContext = createContext<{
  scheme: Scheme;
  mode: ThemeMode;
  palette: Palette;
  setMode: (m: ThemeMode) => void;
}>({ scheme: 'light', mode: 'auto', palette: light, setMode: () => {} });

/**
 * On web the stored preference must be part of the very first render:
 * the static-export pages hydrate, and a mode applied by a later effect
 * loses to the hydrated markup. localStorage is synchronous there.
 * Native keeps the async load in the effect below.
 */
function initialMode(): ThemeMode {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'light' || v === 'dark' || v === 'auto') return v;
    } catch {
      // storage blocked (private browsing): fall through to auto
    }
  }
  return 'auto';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [system, setSystem] = useState<Scheme>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );
  // Static-export pages are pre-rendered light, and React ignores styling
  // mismatches while hydrating. Render the first frame to match, then flip
  // hydrated in an effect: that update is ordinary and always applied.
  const [hydrated, setHydrated] = useState(Platform.OS !== 'web');

  useEffect(() => {
    setHydrated(true);
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'auto') setModeState(v);
    });
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystem(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  };

  const scheme: Scheme = !hydrated ? 'light' : mode === 'auto' ? system : mode;

  // Keep the browser's own chrome (address bar, bottom toolbar, overscroll)
  // in step with the app: it tints from the document background and the
  // theme-color meta, not from anything React renders.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const bg = scheme === 'dark' ? dark.bg : light.bg;
    document.body.style.backgroundColor = bg;
    document.documentElement.style.colorScheme = scheme;
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.setAttribute('content', bg));
  }, [scheme]);
  const value = useMemo(
    () => ({ scheme, mode, palette: scheme === 'dark' ? dark : light, setMode }),
    [scheme, mode],
  );
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Build one sheet per palette at module load; pick with useSheet(). */
export function themedSheets<T>(factory: (c: Palette) => T): { light: T; dark: T } {
  return { light: factory(light), dark: factory(dark) };
}

export function useSheet<T>(sheets: { light: T; dark: T }): T {
  return sheets[useTheme().scheme];
}
