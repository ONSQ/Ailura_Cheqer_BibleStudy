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
from collections import defaultdict
from pathlib import Path

REF_RE = re.compile(r"^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)#(\d+)=(\S+)")
# dStrong tags look like H7225G, G0976, H9003; root is wrapped in {curly braces}
DSTRONG_ROOT_RE = re.compile(r"\{([HG]\d{4}[A-Za-z]?)")
STRONG_SIMPLE_RE = re.compile(r"([HG])(\d{4})([A-Za-z]?)")


def simple_strongs(dstrong: str):
    """H7225G -> H7225 ; G0976 -> G0976 ; returns None if no match."""
    if not dstrong:
        return None
    m = STRONG_SIMPLE_RE.search(dstrong)
    return f"{m.group(1)}{m.group(2)}" if m else None


def parse_tahot_line(cols):
    """TAHOT: ref | hebrew | translit | gloss | dStrongs | grammar | meaning-var |
    spelling-var | root dStrong+instance | alt strongs | conjoin | expanded tags"""
    ref = REF_RE.match(cols[0])
    if not ref:
        return None
    book, ch, vs, wn, ttype = ref.groups()
    dstrongs_raw = cols[4] if len(cols) > 4 else ""
    root_field = cols[8] if len(cols) > 8 else ""
    # Prefer the explicit root column; fall back to {root} inside dStrongs
    root = root_field.split("_")[0].strip() if root_field.strip() else None
    if not root:
        m = DSTRONG_ROOT_RE.search(dstrongs_raw)
        root = m.group(1) if m else None
    return dict(
        corpus="OT", book=book, chapter=int(ch), verse=int(vs), word_num=int(wn),
        source_tag=ttype,
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
    ref = REF_RE.match(cols[0])
    if not ref:
        return None
    book, ch, vs, wn, editions_tag = ref.groups()
    surface_tr = cols[1].strip() if len(cols) > 1 else ""
    m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", surface_tr)
    surface, translit = (m.group(1).strip(), m.group(2)) if m else (surface_tr, None)
    strong_morph = cols[3].split("=", 1) if len(cols) > 3 else [""]
    dstrong = strong_morph[0].strip()
    morph = strong_morph[1].strip() if len(strong_morph) > 1 else None
    lemma_meaning = cols[4].split("=", 1) if len(cols) > 4 else [""]
    lemma = lemma_meaning[0].strip() or None
    return dict(
        corpus="NT", book=book, chapter=int(ch), verse=int(vs), word_num=int(wn),
        source_tag=editions_tag,
        surface=surface,
        translit=translit,
        gloss=cols[2].strip() if len(cols) > 2 else None,
        dstrongs=dstrong or None,
        strongs=simple_strongs(dstrong),
        dstrongs_raw=cols[3].strip() if len(cols) > 3 else "",
        lemma=lemma,
        morph=morph,
        editions=cols[5].strip() if len(cols) > 5 else None,
        expanded=cols[4] if len(cols) > 4 else "",
    )


HEB_LEMMA_RE = re.compile(r"\{[HG]\d{4}[A-Za-z]?=([^=]+)=([^}]*)\}")


def iter_rows(path: Path):
    is_ot = "TAHOT" in path.name
    parse = parse_tahot_line if is_ot else parse_tagnt_line
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            if line.startswith("#") or "\t" not in line:
                continue
            cols = line.rstrip("\n").split("\t")
            row = parse(cols)
            if row:
                # Hebrew: pull lemma + gloss for the ROOT from expanded tags
                if is_ot and row["dstrongs"] and row["expanded"]:
                    m = re.search(
                        re.escape(row["dstrongs"]) + r"=([^=]+)=([^}]*)", row["expanded"]
                    )
                    if m:
                        row["lemma"] = m.group(1)
                        row.setdefault("lex_gloss", m.group(2).split(":")[0].strip())
                elif not is_ot and len(cols := row) >= 0:
                    row["lex_gloss"] = None
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

    lex = {}  # strongs -> (language, lemma, gloss, count)

    if args.postgres:
        import psycopg2  # noqa
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        ph = INSERT_SQL.replace("?", "%s").replace("insert into", "insert into")
    else:
        db = args.sqlite or "wordstudy.db"
        conn = sqlite3.connect(db)
        conn.executescript(SQLITE_SCHEMA)
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
            if row["strongs"]:
                lang = "heb" if row["strongs"].startswith("H") else "grk"
                s = lex.setdefault(row["strongs"], [lang, row["lemma"], row.get("lex_gloss") or row["gloss"], 0])
                s[3] += 1
                if not s[1] and row["lemma"]:
                    s[1] = row["lemma"]
            n += 1
            if len(batch) >= 5000:
                cur.executemany(ph, batch)
                batch = []
        if batch:
            cur.executemany(ph, batch)
        conn.commit()
        total += n
        print(f"  {path.name[:60]:62s} {n:>8,} words")

    cur.executemany(
        "insert or replace into lexemes (strongs, language, lemma, gloss, occurrences) values (?,?,?,?,?)"
        if not args.postgres else
        "insert into lexemes (strongs, language, lemma, gloss, occurrences) values (%s,%s,%s,%s,%s) "
        "on conflict (strongs) do update set occurrences = excluded.occurrences",
        [(k, v[0], v[1], v[2], v[3]) for k, v in lex.items()],
    )
    conn.commit()
    print(f"\nIngested {total:,} word tokens, {len(lex):,} lexemes.")
    conn.close()


if __name__ == "__main__":
    main()
