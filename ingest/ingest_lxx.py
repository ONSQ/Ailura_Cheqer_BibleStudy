#!/usr/bin/env python3
"""
Ingest the CenterBLC LXX (Rahlfs 1935, Text-Fabric format, MIT license)
into period_docs: one row per verse with Greek text plus strongs[] and
lemmas[] arrays for the exact-match arm of hybrid retrieval.

Data: github.com/CenterBLC/LXX (tf/1935). Word-level features are stored
line-per-slot; book/chapter/verse are word-level features too, so the
parse is a straight zip of files.

Usage:
    git clone --depth 1 --filter=blob:none --sparse https://github.com/CenterBLC/LXX.git data/CenterBLC-LXX
    cd data/CenterBLC-LXX && git sparse-checkout set --no-cone "/tf/1935" && cd ../..
    python ingest/ingest_lxx.py --tf-dir data/CenterBLC-LXX/tf/1935 --sqlite wordstudy.db

Idempotent: replaces all LXX rows in period_docs.
In SQLite the strongs/lemmas arrays are stored as JSON strings.
"""

import argparse
import json
import re
import sqlite3
from pathlib import Path

STRONGS_RE = re.compile(r"^G(\d+)$")

SQLITE_SCHEMA = """
create table if not exists period_docs (
    id integer primary key autoincrement,
    corpus text not null, work text not null, ref text not null,
    language text, content text not null, license text,
    strongs text, lemmas text
);
create index if not exists idx_period_docs_work on period_docs (corpus, work);
"""


def feature_lines(path: Path):
    """Yield (node, value) for a TF node-feature file. Lines are sequential
    from node 1; a line 'nodeSpec\\tvalue' jumps to that node."""
    node = 0
    with open(path, encoding="utf-8") as fh:
        in_data = False
        for line in fh:
            line = line.rstrip("\n")
            if not in_data:
                if line.startswith("@") or line == "":
                    continue
                in_data = True
            if "\t" in line:
                spec, value = line.split("\t", 1)
                start = int(spec.split("-")[0])
                node = start
            else:
                node += 1
                value = line
            yield node, value


def norm_strongs(v: str):
    m = STRONGS_RE.match(v.strip())
    return f"G{int(m.group(1)):04d}" if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tf-dir", required=True)
    ap.add_argument("--sqlite", default="wordstudy.db")
    args = ap.parse_args()
    tf = Path(args.tf_dir)

    def word_feature(name):
        out = {}
        for node, value in feature_lines(tf / name):
            out[node] = value
        return out

    print("Reading features...")
    words = word_feature("word.tf")
    books = word_feature("book.tf")
    chapters = word_feature("chapter.tf")
    verses = word_feature("verse.tf")
    strongs = word_feature("strongs.tf")
    lemmas = word_feature("lex_utf8.tf")

    n_slots = max(words)
    print(f"  {n_slots:,} word slots")

    # Group slots into verses. Accumulate by key across the whole pass:
    # Rahlfs repeats some verses non-contiguously (doubled text traditions,
    # e.g. Joshua 15), and (corpus, work, ref) must stay unique.
    grouped: dict[tuple, dict] = {}
    for slot in range(1, n_slots + 1):
        if slot not in words or slot not in books:
            continue
        key = (books[slot], chapters.get(slot), verses.get(slot))
        g = grouped.setdefault(key, {"words": [], "strongs": [], "lemmas": []})
        g["words"].append(words[slot])
        s = norm_strongs(strongs.get(slot, ""))
        if s:
            g["strongs"].append(s)
        lm = lemmas.get(slot, "").strip()
        if lm:
            g["lemmas"].append(lm)

    rows = [
        (
            "LXX", book, f"{ch}:{vs}", "grc",
            " ".join(g["words"]), "MIT (CenterBLC/LXX, Rahlfs 1935)",
            json.dumps(sorted(set(g["strongs"]))), json.dumps(sorted(set(g["lemmas"]))),
        )
        for (book, ch, vs), g in grouped.items()
    ]

    print(f"  {len(rows):,} verses across {len({r[1] for r in rows})} books")

    conn = sqlite3.connect(args.sqlite)
    conn.executescript(SQLITE_SCHEMA)
    conn.execute("delete from period_docs where corpus = 'LXX'")
    conn.executemany(
        "insert into period_docs (corpus, work, ref, language, content, license, strongs, lemmas) "
        "values (?,?,?,?,?,?,?,?)",
        rows,
    )
    conn.commit()

    # Sanity: logos in the LXX
    n = conn.execute(
        "select count(*) from period_docs where corpus='LXX' and strongs like '%G3056%'"
    ).fetchone()[0]
    print(f"  verses containing G3056 (logos): {n}")
    conn.close()


if __name__ == "__main__":
    main()
