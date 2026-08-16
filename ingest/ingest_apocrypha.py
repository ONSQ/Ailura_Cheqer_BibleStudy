#!/usr/bin/env python3
"""Ingest Second Temple apocrypha and pseudepigrapha from Sefaria.

Public-domain translations (Charles and others) served by the Sefaria
API, chunked into passage-sized groups of consecutive verses. Ben Sira
also carries its Hebrew text. Complex texts (Testaments of the Twelve
Patriarchs) are walked node by node.

Usage:
  python ingest/ingest_apocrypha.py [--sqlite wordstudy.db]

Idempotent: deletes corpus='Second Temple' rows first, then reloads.
"""
import argparse
import json
import re
import sqlite3
import time
import urllib.parse
import urllib.request

API = "https://www.sefaria.org/api"
TARGET_WORDS = 130
LICENSE = "Sefaria (public domain translations), CC-BY where noted"

WORKS = [
    ("Book of Jubilees", "Jubilees"),
    ("Ben Sira", "Ben Sira"),
    ("Book of Judith", "Judith"),
    ("Book of Tobit", "Tobit"),
    ("The Wisdom of Solomon", "Wisdom of Solomon"),
    ("Letter of Aristeas", "Aristeas"),
    ("Prayer of Manasseh", "Prayer of Manasseh"),
    ("Psalm 151", "Psalm 151"),
    ("Psalm 154", "Psalm 154"),
    ("The Book of Maccabees I", "1 Maccabees"),
    ("The Book of Maccabees II", "2 Maccabees"),
    ("The Book of Susanna", "Susanna"),
    ("The Testaments of the Twelve Patriarchs", "T12P"),
]


def get(path: str):
    url = f"{API}/{path}"
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as res:
                return json.load(res)
        except Exception as e:
            time.sleep(2**attempt)
    raise SystemExit(f"FAILED: {url}")


def strip_html(s: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", s).split())


def flat(texts) -> list[str]:
    """Sefaria text arrays are strings or nested lists; normalize to strings."""
    # A single-chapter book fetched whole comes back as [[v1, v2, ...]].
    while isinstance(texts, list) and len(texts) == 1 and isinstance(texts[0], list):
        texts = texts[0]
    out = []
    for t in texts or []:
        if isinstance(t, list):
            out.append(" ".join(flat(t)))
        else:
            out.append(strip_html(str(t)))
    return out


def chunk_chapter(work, ref_base, ch, en, he, keep_hebrew):
    """Group consecutive verses of one chapter into ~TARGET_WORDS chunks."""
    rows = []
    cur_en, cur_he, start = [], [], None
    n_verses = max(len(en), len(he))
    for i in range(n_verses):
        e = en[i] if i < len(en) else ""
        h = he[i] if i < len(he) else ""
        if not e.strip() and not h.strip():
            continue
        if start is None:
            start = i + 1
        cur_en.append(e)
        cur_he.append(h)
        if sum(len(x.split()) for x in cur_en) >= TARGET_WORDS:
            rows.append((start, i + 1, list(cur_en), list(cur_he)))
            cur_en, cur_he, start = [], [], None
    if cur_en or cur_he:
        rows.append((start, n_verses, cur_en, cur_he))

    out = []
    for a, b, ens, hes in rows:
        english = " ".join(x for x in ens if x).strip()
        hebrew = " ".join(x for x in hes if x).strip()
        if ch is None:
            loc = str(a) if a == b else f"{a}-{b}"
        else:
            loc = f"{ch}:{a}" if a == b else f"{ch}:{a}-{b}"
        content = hebrew if (keep_hebrew and hebrew) else english
        if not content:
            continue
        out.append(
            {
                "corpus": "Second Temple",
                "work": work,
                "ref": f"{ref_base} {loc}",
                "language": "he" if (keep_hebrew and hebrew) else "en",
                "content": content,
                "content_en": english or None,
                "license": LICENSE,
            }
        )
    return out


def ingest_simple(title, work, keep_hebrew=False):
    shape = get(f"shape/{urllib.parse.quote(title)}")
    node = shape[0]
    chapters = node["chapters"]
    rows = []
    if isinstance(chapters, int) or (chapters and isinstance(chapters[0], int) and node.get("length") == 1):
        # depth-1 text: one run of sections, no chapter level
        d = get(f"texts/{urllib.parse.quote(title)}?context=0&pad=0")
        return chunk_chapter(work, work, None, flat(d.get("text")), flat(d.get("he")), keep_hebrew)
    if isinstance(chapters[0], dict):  # complex text: one node per sub-book
        for sub in chapters:
            sub_title = sub["title"]
            # "The Testaments of the Twelve Patriarchs, Reuben" -> "T. Reuben"
            short = f"T. {sub_title.split(',')[-1].strip()}" if work == "T12P" else sub_title
            for ch in range(1, len(sub["chapters"]) + 1):
                d = get(f"texts/{urllib.parse.quote(sub_title)}.{ch}?context=0&pad=0")
                rows.extend(
                    chunk_chapter(work, short, ch, flat(d.get("text")), flat(d.get("he")), keep_hebrew)
                )
    else:
        for ch in range(1, len(chapters) + 1):
            d = get(f"texts/{urllib.parse.quote(title)}.{ch}?context=0&pad=0")
            rows.extend(
                chunk_chapter(work, work, ch, flat(d.get("text")), flat(d.get("he")), keep_hebrew)
            )
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", default="wordstudy.db")
    args = ap.parse_args()

    all_rows = []
    for title, work in WORKS:
        rows = ingest_simple(title, work, keep_hebrew=(work == "Ben Sira"))
        print(f"{work}: {len(rows)} passages")
        all_rows.extend(rows)

    conn = sqlite3.connect(args.sqlite)
    # scoped to this script's works: 1 Enoch loads separately (ingest_enoch.py)
    conn.execute(
        "delete from period_docs where corpus = 'Second Temple' and work != '1 Enoch'"
    )
    conn.executemany(
        "insert into period_docs (corpus, work, ref, language, content, content_en, license) "
        "values (:corpus, :work, :ref, :language, :content, :content_en, :license)",
        all_rows,
    )
    conn.commit()
    total = conn.execute(
        "select count(*) from period_docs where corpus = 'Second Temple'"
    ).fetchone()[0]
    print(f"loaded {total} rows")


if __name__ == "__main__":
    main()
