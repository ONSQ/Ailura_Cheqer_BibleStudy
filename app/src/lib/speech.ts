/**
 * Pronunciation help. STEPBible transliterations mark syllables with dots
 * and the stressed syllable with capitals ("ba.Ra'" = ba-RAH). We render
 * that visually and speak words aloud: native Hebrew/Greek TTS when the
 * device has a voice for it, otherwise the transliteration through the
 * default voice as an approximation.
 */
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

// Browsers populate the voice list asynchronously; poking it at module load
// means it is ready by the time someone taps a speaker button.
if (Platform.OS === 'web' && typeof speechSynthesis !== 'undefined') {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

export interface TranslitSyllable {
  text: string;
  stressed: boolean;
}

/** "ba.Ra'" -> [{ba}, {Ra' stressed}]; Greek translits have no dots. */
export function translitSyllables(translit: string): TranslitSyllable[] {
  return translit
    .split('.')
    .filter(Boolean)
    .map((s) => ({ text: s, stressed: /[A-Z]/.test(s) }));
}

function speechLang(strongs: string | null | undefined): string {
  return strongs?.startsWith('G') ? 'el-GR' : 'he-IL';
}

/**
 * Turn "ba.Ra'" into something a default English voice says acceptably.
 * Translits of prefixed words carry morpheme dividers ("be./re.Shit");
 * anything that is not a letter makes the voice spell the word out, so
 * keep letters only.
 */
function romanized(translit: string): string {
  return translit
    .replace(/[^\p{L}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasVoiceFor(lang: string): boolean {
  if (typeof speechSynthesis === 'undefined') return false;
  const prefix = lang.split('-')[0];
  return speechSynthesis.getVoices().some((v) => v.lang?.toLowerCase().startsWith(prefix));
}

// Native TTS engines vary: many Android devices have no Hebrew or Greek
// voice, and expo-speech goes silent rather than erroring when asked for
// one. Ask the engine what it actually has, once.
let nativeLangPrefixes: Promise<Set<string> | null> | null = null;

function nativeHasVoiceFor(lang: string): Promise<boolean> {
  nativeLangPrefixes ??= Speech.getAvailableVoicesAsync()
    .then((voices) => {
      const prefixes = new Set(
        voices
          .map((v) => v.language?.toLowerCase().split(/[-_]/)[0])
          .filter((p): p is string => !!p),
      );
      // Some engines list nothing; treat that as unknown, not empty.
      return prefixes.size ? prefixes : null;
    })
    .catch(() => null);
  return nativeLangPrefixes.then(
    (prefixes) => prefixes === null || prefixes.has(lang.split('-')[0]),
  );
}

/**
 * Desktop browsers default to their oldest local voice, which sounds
 * robotic. Rank what the browser actually offers and take the best:
 * Edge "Natural" and Chrome "Google" voices are neural and sound close
 * to phone quality.
 */
function bestWebVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const prefix = lang.split('-')[0].toLowerCase();
  const candidates = speechSynthesis
    .getVoices()
    .filter((v) => v.lang?.toLowerCase().startsWith(prefix));
  if (!candidates.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (n.includes('natural') || n.includes('neural')) s += 8;
    if (n.includes('premium') || n.includes('enhanced')) s += 6;
    if (n.includes('google')) s += 5;
    if (!v.localService) s += 2; // cloud voices beat bundled desktop ones
    if (v.lang.toLowerCase() === lang.toLowerCase()) s += 1;
    return s;
  };
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

// Chrome quirks, all of which end in silence: speak() right after cancel()
// is dropped some of the time, a paused engine swallows everything queued,
// and an utterance with no live JS reference can be garbage-collected
// mid-speech. Keep a module reference and queue the utterance on a short
// delay so the cancel settles first.
let currentUtterance: SpeechSynthesisUtterance | null = null;
let speakTimer: ReturnType<typeof setTimeout> | null = null;

function speakWeb(text: string, lang: string, onFail?: () => void) {
  speechSynthesis.resume();
  speechSynthesis.cancel();
  if (speakTimer) clearTimeout(speakTimer);
  const u = new SpeechSynthesisUtterance(text);
  const voice = bestWebVoice(lang);
  if (voice) u.voice = voice;
  u.lang = lang;
  u.rate = 0.75;
  if (onFail) {
    u.onerror = (e) => {
      // interrupted/canceled just means another word started; not a failure
      if (e.error !== 'interrupted' && e.error !== 'canceled') onFail();
    };
  }
  currentUtterance = u;
  speakTimer = setTimeout(() => speechSynthesis.speak(u), 60);
}

export async function speakWord(
  surface: string,
  strongs: string | null | undefined,
  translit?: string | null,
) {
  const lang = speechLang(strongs);
  if (Platform.OS === 'web') {
    if (typeof speechSynthesis === 'undefined') return;
    const fallback = translit
      ? () => speakWeb(romanized(translit), 'en-US')
      : undefined;
    if (hasVoiceFor(lang)) {
      speakWeb(surface, lang, fallback);
    } else if (translit) {
      speakWeb(romanized(translit), 'en-US');
    }
    return;
  }
  Speech.stop();
  const sayTranslit = translit
    ? () => Speech.speak(romanized(translit), { rate: 0.75 })
    : undefined;
  if (await nativeHasVoiceFor(lang)) {
    Speech.speak(surface, { language: lang, rate: 0.75, onError: sayTranslit });
  } else if (sayTranslit) {
    sayTranslit();
  }
}
