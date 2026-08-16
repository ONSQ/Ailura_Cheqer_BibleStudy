#!/usr/bin/env python3
"""
Ingest Targum Onkelos (Aramaic, Public Domain version) from the Sefaria API
into period_docs, verse-per-row, ref-aligned with the MT so it can join the
Reader's verses directly. Untagged: retrieval over this corpus is semantic
(Phase 4); the ref alignment enables verse-level display before that.

Usage:
    python ingest/ingest_targum.py --sqlite wordstudy.db

Idempotent: replaces all Targum rows.
"""

import argparse
import json
import sqlite3
import time
import urllib.parse
import urllib.request

API = "https://www.sefaria.org/api/texts"

# Sefaria title -> our STEPBible book code
BOOKS = {
    "Onkelos Genesis": "Gen",
    "Onkelos Exodus": "Exo",
    "Onkelos Leviticus": "Lev",
    "Onkelos Numbers": "Num",
    "Onkelos Deuteronomy": "Deu",
}


def fetch(title, chapter):
    vhe = urllib.parse.quote(title.replace(" ", "_"))
    url = (
        f"{API}/{urllib.parse.quote(title)}.{chapter}"
        f"?context=0&commentary=0&vhe={vhe}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "cheqer-ingest"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", default="wordstudy.db")
    args = ap.parse_args()

    conn = sqlite3.connect(args.sqlite)
    conn.execute("delete from period_docs where corpus = 'Targum'")
    total = 0
    for title, code in BOOKS.items():
        first = fetch(title, 1)
        chapters = first["lengths"][0]
        license_ = first.get("heLicense") or first.get("license") or "Public Domain"
        rows = []
        for ch in range(1, chapters + 1):
            data = first if ch == 1 else fetch(title, ch)
            for i, verse in enumerate(data.get("he", []), start=1):
                text = verse.strip()
                if text:
                    rows.append((
                        "Targum", f"Onkelos {code}", f"{ch}:{i}", "arc",
                        text, f"{license_} (Sefaria, {first.get('heVersionTitle', title)})",
                        None, None,
                    ))
            time.sleep(0.2)  # be polite to Sefaria
        conn.executemany(
            "insert into period_docs (corpus, work, ref, language, content, license, strongs, lemmas) "
            "values (?,?,?,?,?,?,?,?)",
            rows,
        )
        conn.commit()
        total += len(rows)
        print(f"  {title:22s} {chapters:>3} chapters {len(rows):>6,} verses")
    print(f"\nIngested {total:,} Targum verses.")
    conn.close()


if __name__ == "__main__":
    main()
