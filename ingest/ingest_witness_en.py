#!/usr/bin/env python3
"""
Fill period_docs.content_en with public-domain English translations of the
period witnesses, verse-aligned on the same rows:

- Targum Onkelos: J.W. Etheridge (1862, Public Domain) where Sefaria has
  it, falling back to the Sefaria Community Translation (CC0). Coverage
  is partial; verses without either stay Aramaic-only.
- LXX: Brenton's English Septuagint (Public Domain) via the helloao API
  (eng_bre). Brenton follows LXX structure (Psalms has 151 chapters), so
  refs align with the CenterBLC rows directly.

Usage:
    python ingest/ingest_witness_en.py --sqlite wordstudy.db
"""

import argparse
import json
import sqlite3
import time
import urllib.parse
import urllib.request

SEFARIA = "https://www.sefaria.org/api/texts"
HELLOAO = "https://bible.helloao.org/api"

ETHERIDGE = (
    "J.W._Etheridge._The_Targums_of_Onkelos_and_Jonathan_Ben_Uzziel_"
    "on_the_Pentateuch._London:_Longmans,_Green,_1862"
)
COMMUNITY = "Sefaria_Community_Translation"

TARGUM_BOOKS = {
    "Onkelos Genesis": "Gen",
    "Onkelos Exodus": "Exo",
    "Onkelos Leviticus": "Lev",
    "Onkelos Numbers": "Num",
    "Onkelos Deuteronomy": "Deu",
}

# helloao USFM id -> CenterBLC LXX work code (confident matches only)
BRENTON_BOOKS = {
    "GEN": "Gen", "EXO": "Exod", "LEV": "Lev", "NUM": "Num", "DEU": "Deut",
    "JOS": "Josh", "JDG": "Judg", "RUT": "Ruth", "1SA": "1Sam", "2SA": "2Sam",
    "1KI": "1Kgs", "2KI": "2Kgs", "1CH": "1Chr", "2CH": "2Chr", "EST": "Esth",
    "JOB": "Job", "PSA": "Ps", "PRO": "Prov", "ECC": "Qoh", "SNG": "Cant",
    "ISA": "Isa", "JER": "Jer", "LAM": "Lam", "EZK": "Ezek", "DAN": "DanTh",
    "HOS": "Hos", "JOL": "Joel", "AMO": "Amos", "OBA": "Obad", "JON": "Jonah",
    "MIC": "Mic", "NAM": "Nah", "HAB": "Hab", "ZEP": "Zeph", "HAG": "Hag",
    "ZEC": "Zech", "MAL": "Mal", "JDT": "Jdt", "WIS": "Wis", "SIR": "Sir",
    "BAR": "Bar", "1MA": "1Mac", "2MA": "2Mac", "3MA": "3Mac", "4MA": "4Mac",
    "1ES": "1Esdr",
}


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "cheqer-ingest"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def sefaria_chapter(title, chapter, ven):
    url = (
        f"{SEFARIA}/{urllib.parse.quote(title)}.{chapter}"
        f"?context=0&commentary=0&ven={urllib.parse.quote(ven)}"
    )
    return fetch_json(url).get("text") or []


def strip_html(s):
    out, tag = [], False
    for ch in s:
        if ch == "<":
            tag = True
        elif ch == ">":
            tag = False
        elif not tag:
            out.append(ch)
    return "".join(out).strip()


def load_targum_english(conn):
    total = 0
    for title, code in TARGUM_BOOKS.items():
        chapters = fetch_json(
            f"{SEFARIA}/{urllib.parse.quote(title)}.1?context=0&commentary=0"
        )["lengths"][0]
        updates = []
        for ch in range(1, chapters + 1):
            eth = sefaria_chapter(title, ch, ETHERIDGE)
            com = sefaria_chapter(title, ch, COMMUNITY)
            n = max(len(eth), len(com))
            for i in range(n):
                text = ""
                if i < len(eth) and str(eth[i]).strip():
                    text = strip_html(str(eth[i]))
                elif i < len(com) and str(com[i]).strip():
                    text = strip_html(str(com[i]))
                if text:
                    updates.append((text, f"Onkelos {code}", f"{ch}:{i + 1}"))
            time.sleep(0.15)
        conn.executemany(
            "update period_docs set content_en = ? "
            "where corpus = 'Targum' and work = ? and ref = ?",
            updates,
        )
        conn.commit()
        total += len(updates)
        print(f"  Targum {code}: {len(updates):,} English verses")
    return total


def load_brenton(conn):
    total = 0
    books = {b["id"]: b for b in fetch_json(f"{HELLOAO}/eng_bre/books.json")["books"]}
    for usfm, work in BRENTON_BOOKS.items():
        meta = books.get(usfm)
        if not meta:
            continue
        updates = []
        for ch in range(1, meta["numberOfChapters"] + 1):
            data = fetch_json(f"{HELLOAO}/eng_bre/{usfm}/{ch}.json")
            for item in data["chapter"]["content"]:
                if isinstance(item, dict) and item.get("type") == "verse":
                    parts = [
                        p.strip() if isinstance(p, str) else str(p.get("text", "")).strip()
                        for p in item.get("content", [])
                        if isinstance(p, str) or (isinstance(p, dict) and "text" in p)
                    ]
                    text = " ".join(x for x in parts if x)
                    if text:
                        updates.append((text, work, f"{ch}:{item['number']}"))
        conn.executemany(
            "update period_docs set content_en = ? "
            "where corpus = 'LXX' and work = ? and ref = ?",
            updates,
        )
        conn.commit()
        total += len(updates)
        print(f"  LXX {work}: {len(updates):,} Brenton verses")
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", default="wordstudy.db")
    ap.add_argument("--skip-targum", action="store_true")
    ap.add_argument("--skip-brenton", action="store_true")
    args = ap.parse_args()
    conn = sqlite3.connect(args.sqlite)
    try:
        conn.execute("alter table period_docs add column content_en text")
    except sqlite3.OperationalError:
        pass  # already there
    t = load_targum_english(conn) if not args.skip_targum else 0
    b = load_brenton(conn) if not args.skip_brenton else 0
    matched = conn.execute(
        "select count(*) from period_docs where content_en is not null"
    ).fetchone()[0]
    print(f"\nEnglish attached: {t:,} Targum + {b:,} Brenton updates; "
          f"{matched:,} rows now carry content_en.")
    conn.close()


if __name__ == "__main__":
    main()
