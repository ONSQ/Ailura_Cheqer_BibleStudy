#!/usr/bin/env python3
"""
Copy the finished local wordstudy.db (ol_words, lexemes, translations)
into Supabase Postgres in one shot. Faster than re-running the ingest
scripts against Supabase, and preserves ol_words ids (occurrence order).

Usage:
    export DATABASE_URL="postgresql://postgres:...@db.<project>.supabase.co:5432/postgres"
    pip install psycopg2-binary
    python tools/load_supabase.py [--db wordstudy.db]

Idempotent: upserts on each table's natural key.
"""

import argparse
import os
import sqlite3
import sys

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("pip install psycopg2-binary first")

BATCH = 5000

TABLES = {
    "ol_words": dict(
        cols="id, corpus, book, chapter, verse, word_num, source_tag, surface, "
             "translit, gloss, strongs, dstrongs, dstrongs_raw, lemma, morph, editions",
        conflict="(corpus, book, chapter, verse, word_num, source_tag) do nothing",
    ),
    "lexemes": dict(
        cols="strongs, language, lemma, gloss, occurrences",
        conflict="(strongs) do update set occurrences = excluded.occurrences, "
                 "lemma = excluded.lemma, gloss = excluded.gloss",
    ),
    "translations": dict(
        cols="version, book, chapter, verse, text",
        conflict="(version, book, chapter, verse) do update set text = excluded.text",
    ),
    # TIPNR entity layer (ingest/ingest_tipnr.py --sqlite first). entities
    # must load before the three tables that reference it.
    "entities": dict(
        cols="ustrong, kind, etype, name, unified_name, description, summary, "
             "parents, siblings, partners, offspring, tribe, founder, inhabitants, "
             "openbible_name, lat, lng, brief, short_desc, article, refs_count",
        conflict="(ustrong) do update set summary = excluded.summary, "
                 "brief = excluded.brief, short_desc = excluded.short_desc, "
                 "article = excluded.article, refs_count = excluded.refs_count",
    ),
    "entity_names": dict(
        cols="ustrong, dstrong, estrong, significance, form, translated",
        conflict="do nothing",
    ),
    "entity_refs": dict(
        cols="ustrong, book, chapter, verse",
        conflict="(ustrong, book, chapter, verse) do nothing",
    ),
    "entity_links": dict(
        cols="ustrong, role, name, target",
        conflict="do nothing",
    ),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="wordstudy.db")
    args = ap.parse_args()

    if "DATABASE_URL" not in os.environ:
        sys.exit("Set DATABASE_URL first (Supabase > Settings > Database > Connection string)")

    lite = sqlite3.connect(args.db)
    pg = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = pg.cursor()

    # entity_names/entity_links have no natural key; truncate-and-load keeps
    # re-runs idempotent (cascades from entities cover all four tables).
    if lite.execute(
        "select count(*) from sqlite_master where type='table' and name='entities'"
    ).fetchone()[0]:
        cur.execute("truncate entity_refs, entity_names, entity_links, entities cascade")
        pg.commit()

    for table, spec in TABLES.items():
        try:
            src = lite.execute(f"select {spec['cols']} from {table}")
        except sqlite3.OperationalError:
            print(f"  {table}: not in {args.db}, skipped")
            continue
        n = 0
        sql = (
            f"insert into {table} ({spec['cols']}) values %s "
            f"on conflict {spec['conflict']}"
        )
        while True:
            rows = src.fetchmany(BATCH)
            if not rows:
                break
            psycopg2.extras.execute_values(cur, sql, rows, page_size=BATCH)
            pg.commit()
            n += len(rows)
            print(f"\r  {table}: {n:,}", end="", flush=True)
        print()

    # ol_words ids were copied verbatim; move the sequence past them.
    cur.execute("select setval(pg_get_serial_sequence('ol_words','id'), "
                "coalesce((select max(id) from ol_words), 1))")
    cur.execute("select setval(pg_get_serial_sequence('translations','id'), "
                "coalesce((select max(id) from translations), 1))")
    pg.commit()

    for q, want in [
        ("select count(*) from ol_words", "~425,454"),
        ("select count(*) from lexemes", "~13,616"),
        ("select count(*) from translations", "~93,286"),
        ("select occurrences from lexemes where strongs='H0430'", "2,246"),
    ]:
        cur.execute(q)
        print(f"  {q} -> {cur.fetchone()[0]} (expect {want})")
    pg.close()
    lite.close()


if __name__ == "__main__":
    main()
