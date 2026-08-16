#!/usr/bin/env python3
"""Embed period_docs passages for semantic retrieval.

Uses OpenAI text-embedding-3-small (1536 dims, matching the pgvector
column). Embeds the English translation where present, the original
text otherwise, and stores vectors in the local wordstudy.db; stream
them to Supabase afterward with the bulk-load pattern.

Usage:
  set OPENAI_API_KEY=sk-...
  python ingest/embed_period.py [--sqlite wordstudy.db] [--corpus Josephus]

Idempotent: skips rows that already have an embedding; re-run to resume.
"""
import argparse
import json
import os
import sqlite3
import time
import urllib.request

MODEL = "text-embedding-3-small"
BATCH = 100
MAX_CHARS = 8000


def embed(texts: list[str], key: str) -> list[list[float]]:
    body = json.dumps({"model": MODEL, "input": texts}).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                data = json.load(res)
                return [d["embedding"] for d in data["data"]]
        except Exception as e:
            wait = 2**attempt
            print(f"  retry {attempt + 1} in {wait}s: {e}", flush=True)
            time.sleep(wait)
    raise SystemExit("embedding FAILED after retries")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", default="wordstudy.db")
    ap.add_argument("--corpus", default=None, help="limit to one corpus")
    args = ap.parse_args()

    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise SystemExit("set OPENAI_API_KEY first")

    conn = sqlite3.connect(args.sqlite)
    cols = [r[1] for r in conn.execute("pragma table_info(period_docs)")]
    if "embedding" not in cols:
        conn.execute("alter table period_docs add column embedding text")
        conn.commit()

    where = "embedding is null"
    params: tuple = ()
    if args.corpus:
        where += " and corpus = ?"
        params = (args.corpus,)
    rows = conn.execute(
        f"select id, coalesce(nullif(content_en, ''), content) from period_docs where {where}",
        params,
    ).fetchall()
    print(f"{len(rows)} passages to embed")

    start = time.time()
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        vectors = embed([t[:MAX_CHARS] for _, t in chunk], key)
        conn.executemany(
            "update period_docs set embedding = ? where id = ?",
            [(json.dumps(v), rid) for (rid, _), v in zip(chunk, vectors)],
        )
        conn.commit()
        done = i + len(chunk)
        print(f"{done:,}/{len(rows):,} ({time.time() - start:.0f}s)", flush=True)
    print("done")


if __name__ == "__main__":
    main()
