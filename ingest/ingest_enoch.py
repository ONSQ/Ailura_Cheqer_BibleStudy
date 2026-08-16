#!/usr/bin/env python3
"""Ingest 1 Enoch (Charles 1917, public domain) from Wikisource.

Chapters 1-108 live as subpages of "The Book of Enoch (Charles)".
Charles marks verses with leading numbers and uses half brackets for
critical restorations; both are cleaned. Verses chunk into ~130-word
passages with refs like "1 Enoch 6:1-4".

Usage:
  python ingest/ingest_enoch.py [--sqlite wordstudy.db]

Idempotent: deletes work='1 Enoch' rows first, then reloads.
"""
import argparse
import json
import re
import sqlite3
import time
import urllib.parse
import urllib.request

API = "https://en.wikisource.org/w/api.php"
TARGET_WORDS = 130
LICENSE = "Charles 1917 translation, public domain (via Wikisource)"
CHAPTERS = 108


def get_chapter(n: int) -> str:
    page = f"The Book of Enoch (Charles)/Chapter {n:02d}"
    qs = urllib.parse.urlencode(
        {"action": "parse", "page": page, "prop": "wikitext", "format": "json"}
    )
    req = urllib.request.Request(
        f"{API}?{qs}",
        headers={"User-Agent": "CheqerIngest/1.0 (personal Bible study app; onsq27@gmail.com)"},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                d = json.load(res)
                return d["parse"]["wikitext"]["*"]
        except Exception:
            time.sleep(2**attempt)
    raise SystemExit(f"FAILED chapter {n}")


def clean(wikitext: str) -> str:
    s = wikitext
    s = re.sub(r"\{\{header.*?\}\}", " ", s, flags=re.S)
    s = re.sub(r"\{\{[^}]*\}\}", " ", s)
    s = re.sub(r"=+[^=]*=+", " ", s)  # section headings
    s = re.sub(r"\[\[(?:[^]|]*\|)?([^]]*)\]\]", r"\1", s)  # links -> display text
    s = re.sub(r"CHAPTER [IVXLC]+\.?", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("⌈", "").replace("⌉", "").replace("‡", "").replace("†", "")
    return " ".join(s.split())


def verses(text: str) -> list[tuple[int, str]]:
    """Split on leading verse numbers ("1. words 2. more")."""
    parts = re.split(r"(?:(?<=\s)|^)(\d{1,3})\.\s", text)
    out = []
    for i in range(1, len(parts) - 1, 2):
        out.append((int(parts[i]), parts[i + 1].strip()))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", default="wordstudy.db")
    args = ap.parse_args()

    rows = []
    for ch in range(1, CHAPTERS + 1):
        vs = verses(clean(get_chapter(ch)))
        cur, start = [], None
        for v, text in vs:
            if not text:
                continue
            if start is None:
                start = v
            cur.append((v, text))
            if sum(len(t.split()) for _, t in cur) >= TARGET_WORDS:
                a, b = start, cur[-1][0]
                loc = f"{ch}:{a}" if a == b else f"{ch}:{a}-{b}"
                rows.append((loc, " ".join(t for _, t in cur)))
                cur, start = [], None
        if cur:
            a, b = start, cur[-1][0]
            loc = f"{ch}:{a}" if a == b else f"{ch}:{a}-{b}"
            rows.append((loc, " ".join(t for _, t in cur)))
        if ch % 20 == 0:
            print(f"chapter {ch}: {len(rows)} passages so far", flush=True)

    conn = sqlite3.connect(args.sqlite)
    conn.execute("delete from period_docs where corpus = 'Second Temple' and work = '1 Enoch'")
    conn.executemany(
        "insert into period_docs (corpus, work, ref, language, content, content_en, license) "
        "values ('Second Temple', '1 Enoch', '1 Enoch ' || ?, 'en', ?, null, ?)",
        [(loc, text, LICENSE) for loc, text in rows],
    )
    conn.commit()
    print(f"loaded {len(rows)} passages")


if __name__ == "__main__":
    main()
