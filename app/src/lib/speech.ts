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

/** Turn "ba.Ra'" into something a default English voice says acceptably. */
function romanized(translit: string): string {
  return translit.replace(/[.'’]/g, ' ').trim();
}

function hasVoiceFor(lang: string): boolean {
  if (Platform.OS !== 'web') return true; // native TTS resolves per-language itself
  if (typeof speechSynthesis === 'undefined') return false;
  const prefix = lang.split('-')[0];
  return speechSynthesis.getVoices().some((v) => v.lang?.toLowerCase().startsWith(prefix));
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

function speakWeb(text: string, lang: string) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = bestWebVoice(lang);
  if (voice) u.voice = voice;
  u.lang = lang;
  u.rate = 0.75;
  speechSynthesis.speak(u);
}

export function speakWord(
  surface: string,
  strongs: string | null | undefined,
  translit?: string | null,
) {
  const lang = speechLang(strongs);
  if (Platform.OS === 'web') {
    if (typeof speechSynthesis === 'undefined') return;
    if (hasVoiceFor(lang)) {
      speakWeb(surface, lang);
    } else if (translit) {
      speakWeb(romanized(translit), 'en-US');
    }
    return;
  }
  Speech.stop();
  if (hasVoiceFor(lang)) {
    Speech.speak(surface, { language: lang, rate: 0.75 });
  } else if (translit) {
    Speech.speak(romanized(translit), { rate: 0.75 });
  }
}
