#!/usr/bin/env python3
"""
Import translation text from the helloao Free Use Bible API into the
translations table (verse per row). Default version is BSB, which is
public domain and serves as Cheqer's default English text.

API: https://bible.helloao.org/api/{version}/{BOOK}/{chapter}.json
Book ids are USFM (GEN, JHN); we store STEPBible codes (Gen, Jhn).

Usage:
    # Local SQLite (adds to the same db the dev server reads):
    python ingest/ingest_helloao.py --sqlite wordstudy.db

    # Supabase / Postgres (run schema.sql first):
    export DATABASE_URL="postgresql://postgres:...@db.<project>.supabase.co:5432/postgres"
    python ingest/ingest_helloao.py --postgres

    # Subset for testing:
    python ingest/ingest_helloao.py --sqlite wordstudy.db --books Gen,Jhn

Idempotent: rows upsert on (version, book, chapter, verse).
"""

import argparse
import json
import os
import sqlite3
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://bible.helloao.org/api"

# The 66 canonical books, STEPBible codes. USFM id = code.upper().
BOOKS = (
    "Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro "
    "Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal "
    "Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas "
    "1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev"
).split()

SQLITE_SCHEMA = """
create table if not exists translations (
    id integer primary key autoincrement,
    version text not null, book text not null, chapter int not null,
    verse int not null, text text not null
);
create unique index if not exists idx_translations_key
    on translations (version, book, chapter, verse);
create index if not exists idx_translations_ref on translations (book, chapter, verse);
"""


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "cheqer-ingest"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def flatten_verse(content):
    """Verse content mixes strings, {text,...} objects, and {noteId} markers."""
    parts = []
    for item in content:
        if isinstance(item, str):
            parts.append(item.strip())
        elif isinstance(item, dict) and "text" in item:
            parts.append(str(item["text"]).strip())
    return " ".join(p for p in parts if p)


def chapter_rows(version, book, chapter_json):
    for item in chapter_json["chapter"]["content"]:
        if isinstance(item, dict) and item.get("type") == "verse":
            text = flatten_verse(item.get("content", []))
            if text:
                yield (version, book, chapter_json["chapter"]["number"], item["number"], text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default="BSB")
    ap.add_argument("--sqlite", help="path to SQLite db (local testing)")
    ap.add_argument("--postgres", action="store_true", help="use DATABASE_URL")
    ap.add_argument("--books", help="comma-separated STEPBible codes (default: all 66)")
    args = ap.parse_args()

    wanted = args.books.split(",") if args.books else BOOKS
    unknown = [b for b in wanted if b not in BOOKS]
    if unknown:
        sys.exit(f"Unknown book codes: {unknown}")

    if args.postgres:
        import psycopg2
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        upsert = (
            "insert into translations (version, book, chapter, verse, text) "
            "values (%s,%s,%s,%s,%s) "
            "on conflict (version, book, chapter, verse) do update set text = excluded.text"
        )
    else:
        conn = sqlite3.connect(args.sqlite or "wordstudy.db")
        conn.executescript(SQLITE_SCHEMA)
        upsert = (
            "insert or replace into translations (version, book, chapter, verse, text) "
            "values (?,?,?,?,?)"
        )

    cur = conn.cursor()
    books_meta = {
        b["id"]: b for b in fetch_json(f"{API}/{args.version}/books.json")["books"]
    }
    total = 0
    for code in wanted:
        usfm = code.upper()
        meta = books_meta.get(usfm)
        if not meta:
            print(f"  {code}: not in {args.version}, skipped")
            continue
        chapters = meta["numberOfChapters"]
        urls = [f"{API}/{args.version}/{usfm}/{n}.json" for n in range(1, chapters + 1)]
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(fetch_json, urls))
        rows = [r for ch in results for r in chapter_rows(args.version, code, ch)]
        cur.executemany(upsert, rows)
        conn.commit()
        total += len(rows)
        print(f"  {code:4s} {chapters:>3} chapters {len(rows):>6,} verses")
    print(f"\nImported {total:,} verses of {args.version}.")
    conn.close()


if __name__ == "__main__":
    main()
