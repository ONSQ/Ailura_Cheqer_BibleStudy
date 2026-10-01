#!/usr/bin/env python3
"""
Build lxx_verse_map: which Septuagint verse stands behind each English-numbered
OT verse, wherever that is not simply the same chapter:verse.

The LXX (Rahlfs numbering, as loaded by ingest_lxx.py) differs from the English
refs the app uses in four ways:
  1. Hebrew versification. Psalm titles count as verse 1, and chapter breaks
     fall differently in places (Joel 2:28 = 3:1, Mal 4:1 = 3:19). verse_map
     (from ingest_stepbible.py) carries the Hebrew ref of every such verse. The
     LXX follows the Hebrew numbering in most of these chapters but not all
     (Deu 29 follows the English), so each chapter is decided by the data.
  2. The psalter is numbered one behind for most of its run, with Pss 9-10 and
     114-115 joined and 116 and 147 split.
  3. Jeremiah's oracles against the nations sit mid-book (MT 46-51 = LXX 26-31),
     which shifts MT 25:15-45:5 as well.
  4. Smaller relocations: 1 Kings 20 and 21 swap, Nehemiah is 2 Esdras 11-23,
     Daniel 3:24-30 follows the Prayer of Azariah as 3:91-97, Proverbs 25-29
     are numbered 32-36 in the CenterBLC text, and Malachi's last three verses
     are reordered.

Alignment is scored without any English text: a verse pair counts as aligned
when at least half of the Hebrew lemmas that have known Greek translation
equivalents find one in the LXX verse. Equivalents come from verse
co-occurrence (the same recipe as the lxx_equivalents table), rebuilt once
after the first mapping pass. In chapters that still align poorly (the LXX
orders or words the passage differently, as in Exodus 39), verses that fail the
test get a null mapping, so the app shows no LXX verse instead of the wrong one.

Usage:
    python ingest/build_lxx_map.py --sqlite wordstudy.db
    python ingest/build_lxx_map.py --sqlite wordstudy.db --postgres   # also load DATABASE_URL

Needs ol_words + verse_map (ingest_stepbible.py) and period_docs (ingest_lxx.py)
in the SQLite db. Idempotent: truncate-and-load.
"""

import argparse
import json
import os
import sqlite3
from collections import Counter, defaultdict

LXX_WORK = {
    "Gen": "Gen", "Exo": "Exod", "Lev": "Lev", "Num": "Num", "Deu": "Deut",
    "Jos": "Josh", "Jdg": "Judg", "Rut": "Ruth", "1Sa": "1Sam", "2Sa": "2Sam",
    "1Ki": "1Kgs", "2Ki": "2Kgs", "1Ch": "1Chr", "2Ch": "2Chr", "Ezr": "2Esdr",
    "Neh": "2Esdr", "Est": "Esth", "Job": "Job", "Psa": "Ps", "Pro": "Prov",
    "Ecc": "Qoh", "Sng": "Cant", "Isa": "Isa", "Jer": "Jer", "Lam": "Lam",
    "Ezk": "Ezek", "Dan": "DanTh", "Hos": "Hos", "Jol": "Joel", "Amo": "Amos",
    "Oba": "Obad", "Jon": "Jonah", "Mic": "Mic", "Nam": "Nah", "Hab": "Hab",
    "Zep": "Zeph", "Hag": "Hag", "Zec": "Zech", "Mal": "Mal",
}

MIN_PAIRS, MIN_LIFT = 3, 2.0   # translation-equivalent thresholds (as lxx_equivalents)
WEAK_CHAPTER = 0.7             # aligned share under which failing verses are withheld


def psalm(c, v):
    """Hebrew-numbered psalm verse -> LXX psalm verse."""
    if c <= 9:
        return c, v
    if c == 10:
        return 9, v + 21
    if c <= 113:
        return c - 1, v
    if c == 114:
        return 113, v
    if c == 115:
        return 113, v + 8
    if c == 116:
        return (114, v) if v <= 9 else (115, v - 9)
    if c <= 146:
        return c - 1, v
    if c == 147:
        return (146, v) if v <= 11 else (147, v - 11)
    return c, v


def jeremiah(c, v):
    if c < 25 or c == 52 or (c == 25 and v <= 13):
        return c, v
    if c == 25:
        return (32, v) if v >= 15 else None      # 25:14 is not in the LXX
    if c <= 43:
        return c + 7, v
    if c == 44:
        return 51, v
    if c == 45:
        return 51, v + 30
    if c == 49:
        if v <= 5:
            return 30, v + 16
        if v == 6:
            return None                          # not in the LXX
        if v <= 22:
            return 30, v - 6
        if v <= 27:
            return 30, v + 6
        if v <= 33:
            return 30, v - 5
        return 25, v - 20
    return {46: 26, 47: 29, 48: 31, 50: 27, 51: 28}[c], v


def relocate(book, c, v):
    """Book-level LXX arrangement, applied after the numbering scheme."""
    if book == "Psa":
        return psalm(c, v)
    if book == "Jer":
        return jeremiah(c, v)
    if book == "1Ki" and c in (20, 21):
        return 41 - c, v
    if book == "Neh":
        return c + 10, v
    if book == "Dan" and c == 3 and v >= 24:
        return 3, v + 67
    if book == "Pro" and 25 <= c <= 29:
        return c + 7, v
    if book == "Mal" and c == 3 and v >= 22:
        return 3, {22: 24, 23: 22, 24: 23}[v]   # the LXX ends on the law of Moses
    return c, v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", default="wordstudy.db")
    ap.add_argument("--postgres", action="store_true", help="also load DATABASE_URL")
    args = ap.parse_args()
    db = sqlite3.connect(args.sqlite)

    heb = defaultdict(set)      # (book, chapter, verse) -> Hebrew lemmas
    for book, c, v, s in db.execute(
        "select book, chapter, verse, strongs from ol_words where corpus='OT' and strongs is not null"
    ):
        heb[(book, c, v)].add(s)
    hebrew_ref = defaultdict(list)
    for book, c, v, hc, hv in db.execute(
        "select book, chapter, verse, heb_chapter, heb_verse from verse_map order by 1, 2, 3, 4, 5"
    ):
        hebrew_ref[(book, c, v)].append((hc, hv))
    lxx = {}                    # (work, chapter, verse) -> Greek lemmas
    for work, ref, strongs in db.execute(
        "select work, ref, strongs from period_docs where corpus='LXX'"
    ):
        c, _, v = ref.partition(":")
        if c.isdigit() and v.isdigit():
            lxx[(work, int(c), int(v))] = set(json.loads(strongs) if strongs else [])
    grk_total = Counter(g for gs in lxx.values() for g in gs)

    def targets(key, scheme):
        """LXX verses for one English verse under a numbering scheme."""
        book, c, v = key
        refs = hebrew_ref.get(key) if scheme == "heb" else None
        out = []
        for ref in refs or [(c, v)]:
            t = relocate(book, *ref)
            if t and (LXX_WORK[book],) + t in lxx and t not in out:
                out.append(t)
        return out

    def equivalents(mapping):
        pairs, n_heb = Counter(), Counter()
        for key, hs in heb.items():
            gs = set().union(*(lxx[(LXX_WORK[key[0]],) + t] for t in mapping(key)))
            for h in hs:
                n_heb[h] += 1
                for g in gs:
                    pairs[(h, g)] += 1
        eq = defaultdict(set)
        for (h, g), n in pairs.items():
            if n >= MIN_PAIRS and (n / n_heb[h]) / (grk_total[g] / len(lxx)) >= MIN_LIFT:
                eq[h].add(g)
        return eq

    def aligned(key, tgts, eq):
        """True/False when the pair can be judged, None when it cannot."""
        known = [h for h in heb[key] if h in eq]
        if len(known) < 2 or not tgts:
            return None if tgts else False
        gs = set().union(*(lxx[(LXX_WORK[key[0]],) + t] for t in tgts))
        return sum(1 for h in known if eq[h] & gs) * 2 >= len(known)

    chapters = defaultdict(list)
    for key in heb:
        if key[0] in LXX_WORK:
            chapters[key[:2]].append(key)

    def choose(eq):
        """Per chapter: English or Hebrew numbering, whichever aligns more verses."""
        scheme, share = {}, {}
        for ch, keys in chapters.items():
            best = None
            for s in ("eng", "heb") if any(k in hebrew_ref for k in keys) else ("eng",):
                judged = [a for a in (aligned(k, targets(k, s), eq) for k in keys) if a is not None]
                good = sum(judged)
                if best is None or good > best[0]:
                    best = (good, len(judged), s)
            scheme[ch] = best[2]
            share[ch] = best[0] / best[1] if best[1] else None
        return scheme, share

    # Pass 1: equivalents from the plain refs (most verses already line up),
    # then again from the chosen mapping so remapped books contribute cleanly.
    eq = equivalents(lambda k: [t for t in [(k[1], k[2])] if (LXX_WORK[k[0]],) + t in lxx]
                     if k[0] in LXX_WORK else [])
    scheme, share = choose(eq)
    eq = equivalents(lambda k: targets(k, scheme[k[:2]]) if k[0] in LXX_WORK else [])
    scheme, share = choose(eq)

    rows, withheld = [], []
    stats = Counter()
    for ch in sorted(chapters):
        weak = share[ch] is not None and share[ch] < WEAK_CHAPTER
        if weak:
            withheld.append(f"{ch[0]} {ch[1]} ({share[ch]:.0%})")
        for key in sorted(chapters[ch]):
            book, c, v = key
            tgts = targets(key, scheme[ch])
            if weak and aligned(key, tgts, eq) is False:
                tgts = []
            plain_exists = (LXX_WORK[book], c, v) in lxx
            if tgts == [(c, v)]:
                stats["same ref"] += 1
            elif tgts:
                stats["remapped"] += 1
                rows += [(book, c, v, tc, tv) for tc, tv in tgts]
            elif plain_exists:
                stats["withheld"] += 1     # the same-numbered LXX verse is a different verse
                rows.append((book, c, v, None, None))
            else:
                stats["no LXX verse"] += 1

    db.executescript("""
        create table if not exists lxx_verse_map (
            book text, chapter int, verse int, lxx_chapter int, lxx_verse int);
        delete from lxx_verse_map;
        create index if not exists idx_lxx_verse_map on lxx_verse_map (book, chapter, verse);
    """)
    db.executemany("insert into lxx_verse_map values (?,?,?,?,?)", rows)
    db.commit()

    kept = {}
    for book, c, v, tc, tv in rows:
        kept.setdefault((book, c, v), [])
        if tc is not None:
            kept[(book, c, v)].append((tc, tv))
    judged = good = 0
    for key in heb:
        if key[0] not in LXX_WORK:
            continue
        tgts = kept.get(key, [key[1:]] if (LXX_WORK[key[0]],) + key[1:] in lxx else [])
        a = aligned(key, tgts, eq) if tgts else None
        if a is not None:
            judged += 1
            good += a
    # Baseline for comparison: the same chapter:verse (the pre-map behaviour).
    base_judged = base_good = 0
    for key in heb:
        if key[0] in LXX_WORK and (LXX_WORK[key[0]],) + key[1:] in lxx:
            a = aligned(key, [key[1:]], eq)
            if a is not None:
                base_judged += 1
                base_good += a
    print(f"same chapter:verse baseline: {base_good:,} of {base_judged:,} judged verses ({base_good / base_judged:.1%})")
    print(f"OT verses: {dict(stats)}")
    print(f"lxx_verse_map rows: {len(rows):,}")
    print(f"aligned by translation equivalents: {good:,} of {judged:,} judged verses ({good / judged:.1%})")
    print(f"chapters following Hebrew numbering: {sum(1 for s in scheme.values() if s == 'heb')}")
    print(f"weak chapters (failing verses withheld): {', '.join(withheld) or 'none'}")

    if args.postgres:
        import psycopg2
        import psycopg2.extras
        pg = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = pg.cursor()
        cur.execute("truncate lxx_verse_map")
        psycopg2.extras.execute_values(
            cur, "insert into lxx_verse_map (book, chapter, verse, lxx_chapter, lxx_verse) values %s", rows
        )
        pg.commit()
        pg.close()
    db.close()


if __name__ == "__main__":
    main()
