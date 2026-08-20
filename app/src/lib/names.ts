/**
 * Human-readable names for the compact codes the data layer uses.
 * Readers should meet "Genesis" and "Philo, On the Creation", not
 * "Gen" and "Opif." — scholars' abbreviations stay in the database.
 */

export const BOOK_NAMES: Record<string, string> = {
  Gen: 'Genesis', Exo: 'Exodus', Lev: 'Leviticus', Num: 'Numbers', Deu: 'Deuteronomy',
  Jos: 'Joshua', Jdg: 'Judges', Rut: 'Ruth',
  '1Sa': '1 Samuel', '2Sa': '2 Samuel', '1Ki': '1 Kings', '2Ki': '2 Kings',
  '1Ch': '1 Chronicles', '2Ch': '2 Chronicles', Ezr: 'Ezra', Neh: 'Nehemiah', Est: 'Esther',
  Job: 'Job', Psa: 'Psalms', Pro: 'Proverbs', Ecc: 'Ecclesiastes', Sng: 'Song of Songs',
  Isa: 'Isaiah', Jer: 'Jeremiah', Lam: 'Lamentations', Ezk: 'Ezekiel', Dan: 'Daniel',
  Hos: 'Hosea', Jol: 'Joel', Amo: 'Amos', Oba: 'Obadiah', Jon: 'Jonah', Mic: 'Micah',
  Nam: 'Nahum', Hab: 'Habakkuk', Zep: 'Zephaniah', Hag: 'Haggai', Zec: 'Zechariah',
  Mal: 'Malachi',
  Mat: 'Matthew', Mrk: 'Mark', Luk: 'Luke', Jhn: 'John', Act: 'Acts', Rom: 'Romans',
  '1Co': '1 Corinthians', '2Co': '2 Corinthians', Gal: 'Galatians', Eph: 'Ephesians',
  Php: 'Philippians', Col: 'Colossians', '1Th': '1 Thessalonians', '2Th': '2 Thessalonians',
  '1Ti': '1 Timothy', '2Ti': '2 Timothy', Tit: 'Titus', Phm: 'Philemon', Heb: 'Hebrews',
  Jas: 'James', '1Pe': '1 Peter', '2Pe': '2 Peter', '1Jn': '1 John', '2Jn': '2 John',
  '3Jn': '3 John', Jud: 'Jude', Rev: 'Revelation',
};

export function bookName(code: string): string {
  return BOOK_NAMES[code] ?? code;
}

/** Scholarly witness abbreviations -> reader-friendly names, longest first. */
const WITNESS_ABBREVS: [string, string][] = [
  ['Contempl.', 'Philo, On the Contemplative Life'],
  ['Praem.', 'Philo, On Rewards and Punishments'],
  ['Congr.', 'Philo, On the Preliminary Studies'],
  ['Decal.', 'Philo, On the Decalogue'],
  ['Flacc.', 'Philo, Against Flaccus'],
  ['Legat.', 'Philo, Embassy to Gaius'],
  ['Plant.', 'Philo, On Noah as a Planter'],
  ['Migr.', 'Philo, On the Migration of Abraham'],
  ['Somn.', 'Philo, On Dreams'],
  ['Sacr.', 'Philo, On the Sacrifices of Abel and Cain'],
  ['Sobr.', 'Philo, On Sobriety'],
  ['Conf.', 'Philo, On the Confusion of Tongues'],
  ['Opif.', 'Philo, On the Creation'],
  ['Cher.', 'Philo, On the Cherubim'],
  ['Post.', 'Philo, On the Posterity of Cain'],
  ['Spec.', 'Philo, On the Special Laws'],
  ['Virt.', 'Philo, On the Virtues'],
  ['Prob.', 'Philo, Every Good Man Is Free'],
  ['Apion', 'Josephus, Against Apion'],
  ['Hypoth.', 'Philo, Hypothetica'],
  ['Prov.', 'Philo, On Providence'],
  ['Det.', 'Philo, The Worse Attacks the Better'],
  ['Deus', 'Philo, On the Unchangeableness of God'],
  ['Ebr.', 'Philo, On Drunkenness'],
  ['Fug.', 'Philo, On Flight and Finding'],
  ['Gig.', 'Philo, On the Giants'],
  ['Mut.', 'Philo, On the Change of Names'],
  ['Agr.', 'Philo, On Husbandry'],
  ['Abr.', 'Philo, On Abraham'],
  ['Her.', 'Philo, Who Is the Heir'],
  ['Ios.', 'Philo, On Joseph'],
  ['Leg.', 'Philo, Allegorical Interpretation'],
  ['Mos.', 'Philo, On the Life of Moses'],
  ['Aet.', 'Philo, On the Eternity of the World'],
  ['Ant.', 'Josephus, Antiquities'],
  ['War', 'Josephus, Jewish War'],
  ['Life', 'Josephus, Life'],
];

/** Philo's Latin work titles (Library listings) -> English. */
export const LATIN_TITLES: Record<string, string> = {
  'De Opificio Mundi': 'On the Creation',
  'Legum Allegoriarum Libri I-III': 'Allegorical Interpretation (3 books)',
  'De Cherubim': 'On the Cherubim',
  'De Sacrificiis Abelis Et Caini': 'On the Sacrifices of Abel and Cain',
  'Quod Deterius Potiori Insidiari Soleat': 'The Worse Attacks the Better',
  'De Posteritate Caini': 'On the Posterity of Cain',
  'De Gigantibus': 'On the Giants',
  'Quod Deus Sit Immutabilis': 'On the Unchangeableness of God',
  'De Agricultura': 'On Husbandry',
  'De Plantatione': 'On Noah as a Planter',
  'De Ebrietate': 'On Drunkenness',
  'De Sobrietate': 'On Sobriety',
  'De Confusione Linguarum': 'On the Confusion of Tongues',
  'De Migratione Abrahami': 'On the Migration of Abraham',
  'Quis Rerum Divinarum Heres Sit': 'Who Is the Heir of Divine Things',
  'De Congressu Eruditionis Gratia': 'On the Preliminary Studies',
  'De Fuga Et Inventione': 'On Flight and Finding',
  'De Mutatione Nominum': 'On the Change of Names',
  'De Somniis (lib. i-ii)': 'On Dreams (2 books)',
  'De Abrahamo': 'On Abraham',
  'De Josepho': 'On Joseph',
  'De Vita Mosis (Lib. I-II)': 'On the Life of Moses (2 books)',
  'De Decalogo': 'On the Decalogue',
  'De Specialibus Legibus (lib. i‑iv)': 'On the Special Laws (4 books)',
  'De Virtutibus': 'On the Virtues',
  'De Praemiis Et Poenis Et De Exsecrationibus': 'On Rewards and Punishments',
  'Quod Omnis Probus Liber Sit': 'Every Good Man Is Free',
  'De Vita Contemplativa': 'On the Contemplative Life',
  'De Aeternitate Mundi': 'On the Eternity of the World',
  'In Flaccum': 'Against Flaccus',
  'Legatio Ad Gaium': 'Embassy to Gaius',
};

export function workTitle(work: string): string {
  return LATIN_TITLES[work] ?? work;
}

/**
 * Expand any reference string for display: Bible book codes become full
 * names, witness abbreviations become author + English title, and the
 * LXX/Targum prefixes become words. "Jhn 3:16" -> "John 3:16";
 * "Opif. 26-27" -> "Philo, On the Creation 26-27".
 */
export function displayRef(ref: string): string {
  let r = ref.trim();
  let prefix = '';
  if (r.startsWith('LXX ')) {
    prefix = 'Septuagint · ';
    r = r.slice(4);
  } else if (r.startsWith('Targum Onkelos ')) {
    prefix = 'Targum Onkelos · ';
    r = r.slice(15);
  } else if (r.startsWith('Targum ')) {
    prefix = 'Targum · ';
    r = r.slice(7);
  }
  const m = r.match(/^([1-3]?[A-Za-z]{2,3})\s+(\d.*)$/);
  if (m && BOOK_NAMES[m[1]]) return `${prefix}${BOOK_NAMES[m[1]]} ${m[2]}`;
  const t = r.match(/^T\.\s+(\w+)\s+(.*)$/);
  if (t) return `${prefix}Testament of ${t[1]} ${t[2]}`;
  for (const [abbr, full] of WITNESS_ABBREVS) {
    if (r.startsWith(abbr + ' ')) return `${prefix}${full} ${r.slice(abbr.length + 1)}`;
  }
  return prefix + r;
}
