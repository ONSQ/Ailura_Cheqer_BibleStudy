#!/usr/bin/env python3
"""
Ingest STEPBible TAHOT (Hebrew OT) and TAGNT (Greek NT) into a word-study database.

Data source: github.com/STEPBible/STEPBible-Data (CC BY 4.0)
Attribution: "Tyndale House, Cambridge" (www.TyndaleHouse.com) and
             "STEP Bible" (www.STEPBible.org)

Usage:
    # Local test database (SQLite):
    python ingest_stepbible.py --data-dir "./STEPBible-Data/Translators Amalgamated OT+NT" --sqlite wordstudy.db

    # Supabase / Postgres (pip install psycopg2-binary):
    export DATABASE_URL="postgresql://postgres:...@db.<project>.supabase.co:5432/postgres"
    python ingest_stepbible.py --data-dir "..." --postgres

To fetch the data first:
    git clone --depth 1 --filter=blob:none --sparse https://github.com/STEPBible/STEPBible-Data.git
    cd STEPBible-Data && git sparse-checkout set --no-cone "/Translators Amalgamated OT+NT"
"""

import argparse
import os
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

# Reference column: "Gen.1.1#01=L". Where editions number verses differently
# the English ref carries the alternate in brackets: "Psa.18.0(18.1)#01=L"
# (Hebrew numbering counts the psalm title as verse 1), "Rom.16.25{14.24}#01=NKO",
# "Act.19.41(19.40)#01=NKO", "3Jn.1.15[1.14]#01=NKO". Round brackets hold the
# original-language edition's ref (Hebrew, NA), square brackets the KJV's,
# curly brackets other editions'. We keep the English numbering, which is what
# the translations table and the app's refs use; titles become verse 0. The
# Hebrew refs go to verse_map so witnesses that follow them can be found.
REF_RE = re.compile(
    r"^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)(?:([(\[{])(\d+)\.(\d+)[)\]}])?#(\d+)=(\S+)"
)
# TAGNT's main ref follows the NRSV; square brackets carry the KJV numbering.
# BSB, KJV and WEB all side with the KJV at these verses, so the bracketed ref
# is the English one here. (Elsewhere the BSB follows the main ref.)
KJV_NUMBERED = {("2Co", 13, 12), ("2Co", 13, 13), ("3Jn", 1, 15), ("Rev", 12, 18)}
# dStrong tags look like H7225G, G0976, H9003; root is wrapped in {curly braces}
DSTRONG_ROOT_RE = re.compile(r"\{([HG]\d{4}[A-Za-z]?)")
STRONG_SIMPLE_RE = re.compile(r"([HG])(\d{4})([A-Za-z]?)")
VERSE_MARK_RE = re.compile(r"^\[\d+(?:\.\d+)?\]\s+")


def simple_strongs(dstrong: str):
    """H7225G -> H7225 ; G0976 -> G0976 ; returns None if no match."""
    if not dstrong:
        return None
    m = STRONG_SIMPLE_RE.search(dstrong)
    return f"{m.group(1)}{m.group(2)}" if m else None


def parse_ref(cell):
    """Split a reference cell into the fields shared by TAHOT and TAGNT.

    Extra words (LXX additions, restored text) are numbered WWXX: the XXth
    word inserted after word WW. They come back as word_num WW with
    inserted=True so iter_rows can place them in reading order."""
    ref = REF_RE.match(cell)
    if not ref:
        return None
    book, ch, vs, bracket, alt_ch, alt_vs, wn, tag = ref.groups()
    ch, vs = int(ch), int(vs)
    alt = f"{alt_ch}.{alt_vs}" if bracket else None
    renumbered = bracket == "[" and (book, ch, vs) in KJV_NUMBERED
    heb_ref = (int(alt_ch), int(alt_vs)) if bracket == "(" else None
    if renumbered:
        ch, vs = int(alt_ch), int(alt_vs)
    inserted = len(wn) == 4
    return dict(
        book=book, chapter=ch, verse=vs, alt_ref=alt, heb_ref=heb_ref,
        renumbered=renumbered, inserted=inserted,
        word_num=int(wn[:2]) if inserted else int(wn), source_tag=tag,
    )


def clean_meaning(meaning):
    """Lexicon meaning from a TAHOT expanded tag, reduced to the lexeme's gloss.

    Three shapes occur: "to hover", ": spirit»spirit:1_spirit" (sub-sense »
    base meaning : sense notes) and "God»LORD@Gen.1.1-Heb" (gloss » entity)."""
    meaning = meaning.strip()
    if meaning.startswith(":"):
        base = meaning.split("»", 1)[1] if "»" in meaning else meaning[1:]
        meaning = base.split(":")[0]
    else:
        meaning = meaning.split("@")[0].split("»")[0]
    return meaning.replace("_", " ").strip()


def parse_tahot_line(cols):
    """TAHOT: ref | hebrew | translit | gloss | dStrongs | grammar | meaning-var |
    spelling-var | root dStrong+instance | alt strongs | conjoin | expanded tags"""
    ref = parse_ref(cols[0])
    if not ref:
        return None
    dstrongs_raw = cols[4] if len(cols) > 4 else ""
    root_field = cols[8] if len(cols) > 8 else ""
    # Prefer the explicit root column; fall back to {root} inside dStrongs
    root = root_field.split("_")[0].strip() if root_field.strip() else None
    if not root:
        m = DSTRONG_ROOT_RE.search(dstrongs_raw)
        root = m.group(1) if m else None
    return dict(
        ref, corpus="OT",
        surface=cols[1].strip(),
        translit=cols[2].strip() if len(cols) > 2 else None,
        gloss=cols[3].strip() if len(cols) > 3 else None,
        dstrongs=root,
        strongs=simple_strongs(root or dstrongs_raw),
        dstrongs_raw=dstrongs_raw.strip(),
        lemma=None,  # Hebrew lemma extracted from expanded tags below
        morph=cols[5].strip() if len(cols) > 5 else None,
        editions=None,
        expanded=cols[11] if len(cols) > 11 else "",
    )


def parse_tagnt_line(cols):
    """TAGNT: ref | greek (translit) | gloss | strongs=morph | lemma=meaning |
    editions | ... | word# | dStrong+instance"""
    ref = parse_ref(cols[0])
    if not ref:
        return None
    surface_tr = cols[1].strip() if len(cols) > 1 else ""
    m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", surface_tr)
    surface, translit = (m.group(1).strip(), m.group(2)) if m else (surface_tr, None)
    strong_morph = cols[3].split("=", 1) if len(cols) > 3 else [""]
    dstrong = strong_morph[0].strip()
    morph = strong_morph[1].strip() if len(strong_morph) > 1 else None
    lemma_meaning = cols[4].split("=", 1) if len(cols) > 4 else [""]
    lemma = lemma_meaning[0].strip() or None
    meaning = lemma_meaning[1].replace("_", " ").strip() if len(lemma_meaning) > 1 else None
    return dict(
        ref, corpus="NT", lex_gloss=meaning or None,
        surface=surface,
        translit=translit,
        # TAGNT opens a KJV-numbered verse with its number: "[14] The".
        gloss=VERSE_MARK_RE.sub("", cols[2].strip()) if len(cols) > 2 else None,
        dstrongs=dstrong or None,
        strongs=simple_strongs(dstrong),
        dstrongs_raw=cols[3].strip() if len(cols) > 3 else "",
        lemma=lemma,
        morph=morph,
        editions=cols[5].strip() if len(cols) > 5 else None,
        expanded=cols[4] if len(cols) > 4 else "",
    )


def iter_rows(path: Path):
    is_ot = "TAHOT" in path.name
    parse = parse_tahot_line if is_ot else parse_tagnt_line
    # When two source verses merge into one English verse (split verses like
    # 1Ki 22:43(43+44), Hebrew psalm titles spanning two verses), each source
    # verse restarts word numbering at 1, which would collide on the
    # (verse, word_num, source_tag) key. Shift each later source verse so
    # numbering continues; the offset is calibrated from the group's first
    # word so sources that already continue the numbering are left alone.
    offsets = {}   # (book, chapter, verse) -> {alt_ref: word_num offset}
    max_wn = {}    # (book, chapter, verse) -> highest word_num emitted
    inserts = {}   # (book, chapter, verse, alt_ref) -> extra words placed so far
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            if line.startswith("#") or "\t" not in line:
                continue
            cols = line.rstrip("\n").split("\t")
            row = parse(cols)
            if row:
                key = (row["book"], row["chapter"], row["verse"])
                alts = offsets.setdefault(key, {})
                alt = row.pop("alt_ref")
                # Extra words sit after source word WW, in file order; every
                # later word of that source verse moves up by one per insert.
                placed = inserts.get(key + (alt,), 0)
                row["word_num"] += placed
                if row.pop("inserted"):
                    row["word_num"] += 1
                    inserts[key + (alt,)] = placed + 1
                if alt not in alts:
                    alts[alt] = max_wn.get(key, 0) - row["word_num"] + 1
                    # A verse moved onto its English ref starts again at 1.
                    if not row["renumbered"]:
                        alts[alt] = max(0, alts[alt])
                row["word_num"] += alts[alt]
                if row["word_num"] > max_wn.get(key, 0):
                    max_wn[key] = row["word_num"]
                # Hebrew: pull lemma + gloss for the ROOT from expanded tags
                if is_ot:
                    row["lex_gloss"] = None
                    if row["dstrongs"] and row["expanded"]:
                        m = re.search(
                            re.escape(row["dstrongs"]) + r"=([^=]+)=([^}]*)", row["expanded"]
                        )
                        if m:
                            row["lemma"] = m.group(1)
                            row["lex_gloss"] = clean_meaning(m.group(2)) or None
                yield row


SQLITE_SCHEMA = """
create table if not exists ol_words (
    id integer primary key autoincrement,
    corpus text, book text, chapter int, verse int, word_num int,
    source_tag text, surface text, translit text, gloss text,
    strongs text, dstrongs text, dstrongs_raw text,
    lemma text, morph text, editions text
);
create index if not exists idx_strongs on ol_words (strongs);
create index if not exists idx_ref on ol_words (book, chapter, verse);
create table if not exists lexemes (
    strongs text primary key, language text, lemma text, gloss text, occurrences int
);
create table if not exists verse_map (
    book text, chapter int, verse int, heb_chapter int, heb_verse int,
    primary key (book, chapter, verse, heb_chapter, heb_verse)
);
"""

INSERT_SQL = """insert into ol_words
(corpus, book, chapter, verse, word_num, source_tag, surface, translit, gloss,
 strongs, dstrongs, dstrongs_raw, lemma, morph, editions)
values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--sqlite", help="path to SQLite db (local testing)")
    ap.add_argument("--postgres", action="store_true", help="use DATABASE_URL")
    args = ap.parse_args()

    files = sorted(Path(args.data_dir).glob("TA*NT*.txt")) + sorted(
        Path(args.data_dir).glob("TAHOT*.txt")
    )
    files = [f for f in files if f.is_file()]
    if not files:
        sys.exit(f"No TAHOT/TAGNT files found in {args.data_dir}")

    lex = {}        # strongs -> [lemma, occurrences, Aramaic occurrences]
    meanings = {}   # strongs -> Counter of lexicon meanings across occurrences
    fallback = {}   # strongs -> first contextual gloss, if the lexicon has none
    verse_map = set()  # (book, chapter, verse, heb_chapter, heb_verse)

    if args.postgres:
        import psycopg2  # noqa
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        ph = INSERT_SQL.replace("?", "%s").replace("insert into", "insert into")
    else:
        db = args.sqlite or "wordstudy.db"
        conn = sqlite3.connect(db)
        conn.executescript(SQLITE_SCHEMA)
        # Truncate-and-load, so a re-run cannot double the word counts.
        conn.executescript("delete from ol_words; delete from lexemes; delete from verse_map;")
        ph = INSERT_SQL

    cur = conn.cursor()
    total = 0
    for path in files:
        n = 0
        batch = []
        for row in iter_rows(path):
            batch.append((
                row["corpus"], row["book"], row["chapter"], row["verse"],
                row["word_num"], row["source_tag"], row["surface"], row["translit"],
                row["gloss"], row["strongs"], row["dstrongs"], row["dstrongs_raw"],
                row["lemma"], row["morph"], row["editions"],
            ))
            if row["heb_ref"] and row["corpus"] == "OT":
                verse_map.add((row["book"], row["chapter"], row["verse"]) + row["heb_ref"])
            if row["strongs"]:
                s = lex.setdefault(row["strongs"], [row["lemma"], 0, 0])
                s[1] += 1
                if not s[0] and row["lemma"]:
                    s[0] = row["lemma"]
                # TAHOT morphology codes open with the language: H or A(ramaic)
                if row["corpus"] == "OT" and (row["morph"] or "").startswith("A"):
                    s[2] += 1
                if row["lex_gloss"]:
                    meanings.setdefault(row["strongs"], Counter())[row["lex_gloss"]] += 1
                fallback.setdefault(row["strongs"], row["gloss"])
            n += 1
            if len(batch) >= 5000:
                cur.executemany(ph, batch)
                batch = []
        if batch:
            cur.executemany(ph, batch)
        conn.commit()
        total += n
        print(f"  {path.name[:60]:62s} {n:>8,} words")

    # The lexeme gloss is the lexicon meaning its occurrences carry most often
    # (a simple Strong's number can cover several disambiguated senses), never
    # the contextual gloss of whichever occurrence happened to come first.
    lexemes = []
    for strongs, (lemma, count, aramaic) in lex.items():
        if strongs.startswith("G"):
            lang = "grk"
        else:
            lang = "arc" if aramaic * 2 > count else "heb"
        best = meanings.get(strongs)
        gloss = best.most_common(1)[0][0] if best else fallback[strongs]
        lexemes.append((strongs, lang, lemma, gloss, count))

    cur.executemany(
        "insert or replace into lexemes (strongs, language, lemma, gloss, occurrences) values (?,?,?,?,?)"
        if not args.postgres else
        "insert into lexemes (strongs, language, lemma, gloss, occurrences) values (%s,%s,%s,%s,%s) "
        "on conflict (strongs) do update set occurrences = excluded.occurrences, "
        "language = excluded.language, lemma = excluded.lemma, gloss = excluded.gloss",
        lexemes,
    )
    cur.executemany(
        "insert or replace into verse_map (book, chapter, verse, heb_chapter, heb_verse) values (?,?,?,?,?)"
        if not args.postgres else
        "insert into verse_map (book, chapter, verse, heb_chapter, heb_verse) values (%s,%s,%s,%s,%s) "
        "on conflict do nothing",
        sorted(verse_map),
    )
    conn.commit()
    print(f"\nIngested {total:,} word tokens, {len(lex):,} lexemes, "
          f"{len(verse_map):,} Hebrew-numbered verse mappings.")
    conn.close()


if __name__ == "__main__":
    main()
