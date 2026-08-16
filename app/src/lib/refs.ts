/**
 * Parse a typed Bible reference ("John 3:16", "Gen 1", "1 Cor 13:4",
 * "psalm 23.1") into STEPBible book code + chapter + optional verse.
 */

const NAMES: Record<string, string> = {
  genesis: 'Gen',
  exodus: 'Exo',
  leviticus: 'Lev',
  numbers: 'Num',
  deuteronomy: 'Deu',
  joshua: 'Jos',
  judges: 'Jdg',
  ruth: 'Rut',
  '1samuel': '1Sa',
  '2samuel': '2Sa',
  '1kings': '1Ki',
  '2kings': '2Ki',
  '1chronicles': '1Ch',
  '2chronicles': '2Ch',
  ezra: 'Ezr',
  nehemiah: 'Neh',
  esther: 'Est',
  job: 'Job',
  psalm: 'Psa',
  psalms: 'Psa',
  proverbs: 'Pro',
  ecclesiastes: 'Ecc',
  song: 'Sng',
  songofsongs: 'Sng',
  songofsolomon: 'Sng',
  isaiah: 'Isa',
  jeremiah: 'Jer',
  lamentations: 'Lam',
  ezekiel: 'Ezk',
  daniel: 'Dan',
  hosea: 'Hos',
  joel: 'Jol',
  amos: 'Amo',
  obadiah: 'Oba',
  jonah: 'Jon',
  micah: 'Mic',
  nahum: 'Nam',
  habakkuk: 'Hab',
  zephaniah: 'Zep',
  haggai: 'Hag',
  zechariah: 'Zec',
  malachi: 'Mal',
  matthew: 'Mat',
  mark: 'Mrk',
  luke: 'Luk',
  john: 'Jhn',
  acts: 'Act',
  romans: 'Rom',
  '1corinthians': '1Co',
  '2corinthians': '2Co',
  galatians: 'Gal',
  ephesians: 'Eph',
  philippians: 'Php',
  colossians: 'Col',
  '1thessalonians': '1Th',
  '2thessalonians': '2Th',
  '1timothy': '1Ti',
  '2timothy': '2Ti',
  titus: 'Tit',
  philemon: 'Phm',
  hebrews: 'Heb',
  james: 'Jas',
  '1peter': '1Pe',
  '2peter': '2Pe',
  '1john': '1Jn',
  '2john': '2Jn',
  '3john': '3Jn',
  jude: 'Jud',
  revelation: 'Rev',
};

const CODES = new Map(
  ('Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro ' +
    'Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal ' +
    'Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas ' +
    '1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev')
    .split(' ')
    .map((c) => [c.toLowerCase(), c] as const),
);

function resolveBook(raw: string): string | null {
  const key = raw.toLowerCase();
  const exactCode = CODES.get(key);
  if (exactCode) return exactCode;
  const exactName = NAMES[key];
  if (exactName) return exactName;
  // Unique prefix of a full name: "matt" -> Matthew, "rev" handled above.
  const hits = new Set(
    Object.keys(NAMES)
      .filter((n) => n.startsWith(key))
      .map((n) => NAMES[n]),
  );
  return hits.size === 1 ? [...hits][0] : null;
}

export function parseRef(
  input: string,
): { book: string; chapter: number; verse?: number } | null {
  const m = input
    .trim()
    .match(/^([1-3]?)\s*([A-Za-z]+)\.?\s+(\d{1,3})(?:\s*[:.,]\s*(\d{1,3}))?$/);
  if (!m) return null;
  const book = resolveBook(m[1] + m[2]);
  if (!book) return null;
  const chapter = Number(m[3]);
  if (chapter < 1) return null;
  const verse = m[4] ? Number(m[4]) : undefined;
  return verse ? { book, chapter, verse } : { book, chapter };
}
