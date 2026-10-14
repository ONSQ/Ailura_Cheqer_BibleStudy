// One-off loader for lexicon_entries: a TypeScript port of
// ingest/ingest_lexicon.py that fetches the four source files from GitHub
// and upserts the rows with the service role, because the database is not
// reachable from Owen's network over DATABASE_URL. Call once per language:
//   POST { "language": "grk" }   then   POST { "language": "heb" }
// Guarded by LOADER_TOKEN (a Supabase secret) and refuses to run while the
// table already holds rows for that language, so a stray call cannot
// double-load. Re-stub to 410 after use, like bulk-load and tipnr-load.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { DOMParser } from 'npm:@xmldom/xmldom@0.9.8';

const STEP = 'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/';
const OS = 'https://raw.githubusercontent.com/openscriptures/HebrewLexicon/master/';
const SOURCES = {
  tbesg: STEP + 'TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Greek%20-%20STEPBible.org%20CC%20BY.txt',
  tbesh: STEP + 'TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew%20-%20STEPBible.org%20CC%20BY.txt',
  bdb: OS + 'BrownDriverBriggs.xml',
  index: OS + 'LexicalIndex.xml',
};

type Row = {
  strongs: string; language: 'grk' | 'heb'; source: string;
  lemma: string | null; translit: string | null; pos: string | null; gloss: string | null;
  root: string | null; derivation: string | null; lxx_for: string | null; definition: string | null;
  family: { strongs: string; lemma: string | null; gloss: string | null }[];
  relations: string[];
};

// ---------------------------------------------------------------- Greek ----

function htmlToText(s: string): string {
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<ref=[^>]*>/gi, '');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  s = s.replace(/__/g, '');
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n\s*\n+/g, '\n');
  return s.trim();
}

const PAREN_RE = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)/;
const NOT_DERIVATION_RE = /^(AS|MD|T om|LXX|EV|WH|Rec)\b/;

function splitGreekMeaning(meaning: string) {
  let text = htmlToText(meaning);
  let lxxFor: string | null = null;
  const lm = /\[in LXX([^\]]*)\]/.exec(text);
  if (lm) {
    lxxFor = lm[1].replace(/^[\s;:]+|[\s;:]+$/g, '');
    text = text.slice(0, lm.index) + text.slice(lm.index + lm[0].length);
  }
  let derivation: string | null = null;
  const head = text.slice(0, 320);
  const pm = PAREN_RE.exec(head);
  if (pm && !NOT_DERIVATION_RE.test(pm[1])) {
    derivation = pm[1].trim();
    text = text.slice(0, pm.index) + text.slice(pm.index + pm[0].length);
  }
  let senses = text.includes('\n') ? text.slice(text.indexOf('\n') + 1) : '';
  senses = senses.replace(/\s*\(AS\)\s*$/, '').replace(/^[\s\n,;]+|[\s\n,;]+$/g, '');
  if (!senses) senses = text.replace(/^\S+\s*/, '').replace(/^[\s\n,;]+|[\s\n,;]+$/g, '');
  return { derivation, lxxFor, senses };
}

function parseTbesg(txt: string): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const line of txt.split('\n')) {
    const cols = line.replace(/\r$/, '').split('\t');
    if (cols.length < 8 || !/^G\d{4}$/.test(cols[0])) continue;
    if (seen.has(cols[0])) continue;
    seen.add(cols[0]);
    const { derivation, lxxFor, senses } = splitGreekMeaning(cols[7]);
    rows.push({
      strongs: cols[0], language: 'grk', source: 'Abbott-Smith',
      lemma: cols[3].trim() || null, translit: cols[4].trim() || null,
      pos: cols[5].trim() || null, gloss: cols[6].trim() || null,
      root: null, derivation, lxx_for: lxxFor,
      definition: senses.slice(0, 4000) || null, family: [], relations: [],
    });
  }
  return rows;
}

// --------------------------------------------------------------- Hebrew ----

// deno-lint-ignore no-explicit-any
type XEl = any;

function elText(el: XEl): string {
  const out: string[] = [];
  const walk = (e: XEl, depth: number) => {
    const tag: string = e.localName ?? e.nodeName;
    if (tag === 'status') return;
    if (tag === 'sense') {
      const n = e.getAttribute('n');
      out.push('\n' + '  '.repeat(depth) + (n ? `${n}. ` : '- '));
    }
    for (let c = e.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) {
        out.push(c.nodeValue ?? '');
      } else if (c.nodeType === 1) {
        if ((c.localName ?? c.nodeName) === 'stem') out.push('[' + (c.textContent ?? '').trim() + '] ');
        else walk(c, tag === 'sense' ? depth + 1 : depth);
      }
    }
  };
  walk(el, 0);
  let text = out.join('');
  text = text.replace(/^(\S+) \d+ /, '$1 ');
  text = text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n');
  return text.trim();
}

function parseHebrew(bdbXml: string, indexXml: string, tbeshTxt: string): Row[] {
  const parser = new DOMParser();
  const bdb = new Map<string, XEl>();
  const bdbDoc = parser.parseFromString(bdbXml, 'text/xml');
  for (const e of Array.from(bdbDoc.getElementsByTagName('entry')) as XEl[]) bdb.set(e.getAttribute('id'), e);

  type Idx = {
    id: string; w: string | null; xlit: string | null; pos: string | null; defn: string | null;
    bdb: string | null; strong: string | null; aug: string | null; root: string | null;
    etype: string | null; etext: string;
  };
  const idx = new Map<string, Idx>();
  const indexDoc = parser.parseFromString(indexXml, 'text/xml');
  for (const e of Array.from(indexDoc.getElementsByTagName('entry')) as XEl[]) {
    const w = e.getElementsByTagName('w')[0];
    const xref = e.getElementsByTagName('xref')[0];
    const etym = e.getElementsByTagName('etym')[0];
    const defs = (Array.from(e.getElementsByTagName('def')) as XEl[]).map((d) => (d.textContent ?? '').trim()).filter(Boolean);
    const pos = e.getElementsByTagName('pos')[0];
    idx.set(e.getAttribute('id'), {
      id: e.getAttribute('id'),
      w: w ? (w.textContent ?? '').trim() : null,
      xlit: w ? w.getAttribute('xlit') : null,
      pos: pos ? (pos.textContent ?? '').trim() || null : null,
      defn: defs.length ? defs.join(', ') : null,
      bdb: xref ? xref.getAttribute('bdb') : null,
      strong: xref ? xref.getAttribute('strong') : null,
      aug: xref ? xref.getAttribute('aug') : null,
      root: etym ? etym.getAttribute('root') : null,
      etype: etym ? etym.getAttribute('type') : null,
      etext: etym ? (etym.textContent ?? '').trim() : '',
    });
  }

  const children = new Map<string, string[]>();
  const parent = new Map<string, string>();
  for (const rec of idx.values()) {
    if (rec.etype === 'main') {
      for (const cid of rec.etext.split(/[,\s]+/)) {
        if (!cid) continue;
        children.set(rec.id, [...(children.get(rec.id) ?? []), cid]);
        parent.set(cid, rec.id);
      }
    } else if (rec.etype === 'sub' && rec.etext) {
      parent.set(rec.id, rec.etext.split(',')[0].trim());
    }
  }
  const byStrong = new Map<number, Idx[]>();
  for (const rec of idx.values()) {
    if (rec.strong && /^\d+$/.test(rec.strong)) {
      const n = Number(rec.strong);
      byStrong.set(n, [...(byStrong.get(n) ?? []), rec]);
    }
  }

  const tbesh = new Map<string, { hebrew: string; translit: string; morph: string; gloss: string; relations: string[] }>();
  for (const line of tbeshTxt.split('\n')) {
    const cols = line.replace(/\r$/, '').split('\t');
    if (cols.length < 7 || !/^H\d{4}[a-z]?$/.test(cols[0])) continue;
    const key = cols[0].slice(0, 5);
    const rel = cols[1].includes('=') ? cols[1].split('=').slice(1).join('=').trim() : '';
    let rec = tbesh.get(key);
    if (!rec) {
      rec = { hebrew: cols[3].trim(), translit: cols[4].trim(), morph: cols[5].trim(), gloss: cols[6].trim(), relations: [] };
      tbesh.set(key, rec);
    }
    if (rel && cols[2].trim() && !rel.startsWith('a Meaning')) {
      const item = `${rel} ${cols[2].trim().replace(/,$/, '').trim()}`;
      if (!rec.relations.includes(item)) rec.relations.push(item);
    }
  }

  const rows: Row[] = [];
  for (const [num, recs] of [...byStrong.entries()].sort((a, b) => a[0] - b[0])) {
    const strongs = `H${String(num).padStart(4, '0')}`;
    recs.sort((a, b) => (a.aug ?? '').localeCompare(b.aug ?? ''));
    const base = recs.find((r) => r.aug === null || r.aug === 'a') ?? recs[0];
    const homonyms = recs.filter((r) => r !== base);
    const entry = base.bdb ? bdb.get(base.bdb) : undefined;
    let definition: string | null = entry ? elText(entry) : null;
    for (const h of homonyms) {
      const e2 = h.bdb ? bdb.get(h.bdb) : undefined;
      if (e2) definition = (definition ?? '') + `\n\nAlso (${h.aug ?? '?'}): ` + elText(e2).slice(0, 800);
    }
    const rootId = base.etype === 'sub' ? parent.get(base.id) : base.etype === 'main' ? base.id : undefined;
    const rootRec = rootId ? idx.get(rootId) : undefined;
    const root = rootRec ? (rootRec.root ?? rootRec.w) : base.root;
    const family: Row['family'] = [];
    if (rootId) {
      for (const cid of children.get(rootId) ?? []) {
        const c = idx.get(cid);
        if (c && c.id !== base.id && c.strong && /^\d+$/.test(c.strong)) {
          family.push({ strongs: `H${String(Number(c.strong)).padStart(4, '0')}`, lemma: c.w, gloss: c.defn });
        }
      }
    }
    let derivation: string | null = null;
    if (rootRec && rootRec !== base) derivation = `from the root ${root}` + (rootRec.defn ? ` (${rootRec.defn})` : '');
    else if (base.etype === 'main') derivation = 'a root';
    const t = tbesh.get(strongs);
    rows.push({
      strongs, language: 'heb', source: 'BDB',
      lemma: t?.hebrew || base.w, translit: t?.translit || base.xlit,
      pos: t?.morph || base.pos, gloss: t?.gloss || base.defn,
      root: root ?? null, derivation, lxx_for: null,
      definition: definition ? definition.slice(0, 4000) : null,
      family: family.slice(0, 12), relations: (t?.relations ?? []).slice(0, 6),
    });
  }
  return rows;
}

// ---------------------------------------------------------------- serve ----

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const token = Deno.env.get('LOADER_TOKEN');
  if (!token || req.headers.get('x-loader-token') !== token) return json({ error: 'forbidden' }, 403);
  const { language } = await req.json().catch(() => ({}));
  if (language !== 'grk' && language !== 'heb') return json({ error: 'language must be grk or heb' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { count } = await supabase.from('lexicon_entries').select('strongs', { count: 'exact', head: true }).eq('language', language);
  if ((count ?? 0) > 0) return json({ error: `lexicon_entries already holds ${count} ${language} rows` }, 409);

  const get = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
    return await r.text();
  };
  let rows: Row[];
  if (language === 'grk') {
    rows = parseTbesg(await get(SOURCES.tbesg));
  } else {
    const [bdbXml, indexXml, tbeshTxt] = await Promise.all([get(SOURCES.bdb), get(SOURCES.index), get(SOURCES.tbesh)]);
    rows = parseHebrew(bdbXml, indexXml, tbeshTxt);
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('lexicon_entries').upsert(rows.slice(i, i + 500), { onConflict: 'strongs' });
    if (error) return json({ error: error.message, inserted }, 500);
    inserted += Math.min(500, rows.length - i);
  }
  return json({ ok: true, language, inserted, sample: rows.find((r) => r.strongs === (language === 'grk' ? 'G4129' : 'H0430')) });
});
