/**
 * Pronunciation help. STEPBible transliterations mark syllables with dots
 * and the stressed syllable with capitals ("ba.Ra'" = ba-RAH). We render
 * that visually and speak words aloud: native Hebrew/Greek TTS when the
 * device has a voice for it, otherwise an English respelling of the
 * transliteration through the default voice as an approximation.
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

function isGreek(strongs: string | null | undefined): boolean {
  return !!strongs?.startsWith('G');
}

function speechLang(strongs: string | null | undefined): string {
  return isGreek(strongs) ? 'el-GR' : 'he-IL';
}

// Voice language tags we accept for each speech language. Android reports
// Hebrew voices under the legacy "iw" code on many devices.
const langPrefixes: Record<string, string[]> = {
  'he-IL': ['he', 'iw'],
  'el-GR': ['el'],
};

function matchesLang(voiceLang: string | null | undefined, lang: string): boolean {
  const prefix = voiceLang?.toLowerCase().split(/[-_]/)[0];
  return !!prefix && (langPrefixes[lang] ?? [lang.split('-')[0]]).includes(prefix);
}

/**
 * What the voice should be given. The surface forms keep everything the
 * printed text carries: Hebrew cantillation accents, meteg, sof pasuq and
 * maqaf, morpheme dividers, Greek punctuation. Modern voices are trained on
 * plain text and stumble over the accents, so keep letters and vowel points
 * only. Combining marks are composed first so a vowel and its accent reach
 * the engine as one character where Unicode has one.
 */
export function speakableText(surface: string): string {
  return surface
    .normalize('NFC')
    .replace(/[\u0591-\u05AF\u05BD\u05BF\u05C0\u05C3-\u05C6]/g, '') // accents, meteg, paseq, sof pasuq
    .replace(/\u05BE/g, ' ') // maqaf joins words; let the voice pause there
    .replace(/[/\\]/g, '') // morpheme dividers: the prefix is part of the word
    .replace(/[\u0300-\u036F]/g, '') // stray combining marks NFC could not fold in
    .replace(/[^\p{L}\p{M}\s]+/gu, ' ') // brackets, punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Hebrew surface forms differ from the dictionary lemma by accents and the
 * odd pausal vowel; this is loose enough to find "the lemma's own form"
 * among a word's occurrences without being fooled by cantillation.
 */
export function lemmaKey(text: string): string {
  return speakableText(text).replace(/[\u05B0-\u05BC\u05C1\u05C2\u05C7]/g, '').toLowerCase();
}

const hebrewVowels: Record<string, string> = {
  ei: 'ay',
  ai: 'igh',
  a: 'ah',
  e: 'eh',
  i: 'ee',
  o: 'oh',
  u: 'oo',
};

const greekDiphthongs: Record<string, string> = {
  ai: 'igh',
  ei: 'ay',
  oi: 'oy',
  ui: 'wee',
  au: 'ow',
  eu: 'yoo',
  ou: 'oo',
  ēu: 'ayoo',
};

const greekVowels: Record<string, string> = {
  a: 'ah',
  e: 'eh',
  ē: 'ay',
  i: 'ee',
  o: 'oh',
  ō: 'oh',
  u: 'oo',
  y: 'ee',
};

/**
 * Respell one syllable so an English voice says it the way the guide reads.
 * STEPBible's translit vowels are continental ("i" = ee, "e" = eh); read
 * as English they come out wrong ("be.re.Shit" = bee-ree-shit). Map them
 * to English spellings that pin the sound ("beh-reh-sheet"), and turn the
 * consonants an English voice misreads into ones it does not.
 */
function respellSyllable(syll: string, greek: boolean): string {
  let s = syll.toLowerCase().replace(/[^a-zāēīōū]/g, '');
  if (!s) return '';
  if (greek) {
    s = s
      .replace(/ph/g, 'f')
      .replace(/rh/g, 'r')
      .replace(/ch/g, 'kh')
      .replace(/g(?=[eiyēī])/g, 'gh'); // keep gamma hard: "ghe", not "je"
    // one pass, so a diphthong's respelling is not itself respelled
    s = s.replace(/ēu|[aeou]i|[aeo]u|[aeēiīoōuūy]/g, (v) => greekDiphthongs[v] ?? greekVowels[v] ?? v);
  } else {
    s = s
      .replace(/ch/g, 'kh')
      .replace(/tz/g, 'ts')
      .replace(/q/g, 'k')
      .replace(/w/g, 'v');
    s = s.replace(/ei|ai|[aeiou]/g, (v) => hebrewVowels[v] ?? v);
  }
  return s.replace(/hh/g, 'h');
}

const greekVowel = /[aeēiīoōuūy]/;
const greekDigraph = /^(ch|th|ph|rh|ps)/;

/**
 * Greek translits carry no syllable dots. Split before each vowel group:
 * a lone consonant between vowels opens the next syllable, a cluster is
 * divided after its first unit, and digraphs count as one unit
 * ("logos" = lo-gos, "ekklēsia" = ek-klē-si-a, "anthrōpos" = an-thrō-pos).
 */
function greekSyllables(word: string): string[] {
  const units: { text: string; vowel: boolean }[] = [];
  for (let i = 0; i < word.length; ) {
    const rest = word.slice(i);
    const d = rest.match(greekDigraph);
    const text = d ? d[0] : rest[0];
    const vowel = greekVowel.test(text);
    const last = units[units.length - 1];
    if (vowel && last?.vowel && !(last.text + text).match(/^(ai|ei|oi|ui|au|eu|ou|ēu)$/)) {
      units.push({ text, vowel });
    } else if (vowel && last?.vowel) {
      last.text += text;
    } else {
      units.push({ text, vowel });
    }
    i += text.length;
  }
  const sylls: string[] = [];
  let current = '';
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.vowel) {
      current += u.text;
      // consonants up to the next vowel: one opens the next syllable, a
      // cluster leaves its first unit here and the rest open the next
      let j = i + 1;
      while (j < units.length && !units[j].vowel) j++;
      const cluster = units.slice(i + 1, j).map((c) => c.text);
      const nextHasVowel = j < units.length;
      const keep = !nextHasVowel ? cluster.length : cluster.length > 1 ? 1 : 0;
      current += cluster.slice(0, keep).join('');
      sylls.push(current);
      current = cluster.slice(keep).join('');
      i = j - 1;
    } else {
      current += u.text;
    }
  }
  if (current) sylls.push(current);
  return sylls;
}

/**
 * Turn "be./re.Shit" into "beh-reh-sheet" for a default English voice.
 * Syllable dots and morpheme dividers become hyphens, which English voices
 * read as one word in parts.
 */
export function respell(translit: string, strongs: string | null | undefined): string {
  const greek = isGreek(strongs);
  const t = translit.normalize('NFC'); // macron vowels as single characters
  const parts = greek ? greekSyllables(t.toLowerCase().replace(/[^a-zāēīōū]/g, '')) : t.split(/[./]/);
  return parts
    .map((p) => respellSyllable(p, greek))
    .filter(Boolean)
    .join('-');
}

function hasVoiceFor(lang: string): boolean {
  if (typeof speechSynthesis === 'undefined') return false;
  return speechSynthesis.getVoices().some((v) => matchesLang(v.lang, lang));
}

// Native TTS engines vary: many Android devices have no Hebrew or Greek
// voice, and expo-speech goes silent rather than erroring when asked for
// one. Ask the engine what it actually has, once.
let nativeVoices: Promise<Speech.Voice[] | null> | null = null;

function loadNativeVoices(): Promise<Speech.Voice[] | null> {
  nativeVoices ??= Speech.getAvailableVoicesAsync()
    // Some engines list nothing; treat that as unknown, not empty.
    .then((voices) => (voices.length ? voices : null))
    .catch(() => null);
  return nativeVoices;
}

/**
 * The voice to pass to expo-speech. On Android the `language` option does
 * nothing: expo-speech builds the locale with `Locale("he-IL")`, which Java
 * takes as a language code "he-il" with no country, the engine rejects it,
 * and the phone's default voice gets the Hebrew. Naming the voice by its
 * identifier is applied afterwards and does work. iOS honours `language`,
 * but the identifier is applied there too and lets us prefer the enhanced
 * voice when one is installed.
 */
async function nativeVoiceFor(lang: string): Promise<Speech.Voice | null> {
  const voices = await loadNativeVoices();
  if (!voices) return null;
  const candidates = voices.filter((v) => matchesLang(v.language, lang));
  if (!candidates.length) return null;
  const score = (v: Speech.Voice) => {
    let s = 0;
    if (v.quality === Speech.VoiceQuality.Enhanced) s += 4;
    if (v.language?.replace('_', '-').toLowerCase() === lang.toLowerCase()) s += 1;
    return s;
  };
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

/**
 * Desktop browsers default to their oldest local voice, which sounds
 * robotic. Rank what the browser actually offers and take the best:
 * Edge "Natural" and Chrome "Google" voices are neural and sound close
 * to phone quality.
 */
function bestWebVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const candidates = speechSynthesis.getVoices().filter((v) => matchesLang(v.lang, lang));
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

/**
 * Say `surface` (a Hebrew or Greek form, as printed) with a voice for its
 * language, or failing that an English respelling of `translit`. Pass the
 * same form the pronunciation guide shows so the two agree.
 */
export async function speakWord(
  surface: string,
  strongs: string | null | undefined,
  translit?: string | null,
) {
  const lang = speechLang(strongs);
  const text = speakableText(surface);
  const english = translit ? respell(translit, strongs) : '';
  if (Platform.OS === 'web') {
    if (typeof speechSynthesis === 'undefined') return;
    const fallback = english ? () => speakWeb(english, 'en-US') : undefined;
    if (text && hasVoiceFor(lang)) {
      speakWeb(text, lang, fallback);
    } else if (fallback) {
      fallback();
    }
    return;
  }
  Speech.stop();
  const sayEnglish = english ? () => Speech.speak(english, { rate: 0.75 }) : undefined;
  const voice = await nativeVoiceFor(lang);
  if (text && voice) {
    Speech.speak(text, { language: lang, voice: voice.identifier, rate: 0.75, onError: sayEnglish });
  } else if (text && Platform.OS === 'ios' && (await loadNativeVoices()) === null) {
    // iOS applies `language` on its own; without a voice list to consult,
    // let it try and fall back on error.
    Speech.speak(text, { language: lang, rate: 0.75, onError: sayEnglish });
  } else if (sayEnglish) {
    sayEnglish();
  }
}
