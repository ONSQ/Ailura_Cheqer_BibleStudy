#!/usr/bin/env python3
"""
Fill period_docs.content_en with public-domain English translations of the
period witnesses, verse-aligned on the same rows:

- Targum Onkelos: J.W. Etheridge (1862, Public Domain) where Sefaria has
  it, falling back to the Sefaria Community Translation (CC0). Coverage
  is partial; verses without either stay Aramaic-only.
- LXX: Brenton's English Septuagint (Public Domain) via the helloao API
  (eng_bre). Brenton follows LXX structure (Psalms has 151 chapters), so most
  refs match the CenterBLC rows directly. They do not match everywhere:
  Brenton numbers some chapters a verse or two off the Rahlfs text (Deut 29,
  parts of 1 Esdras) and orders Sirach 30-36 differently. Each chapter is
  therefore checked against the Greek before it is attached (see align_work):
  a run of verses moves to the Brenton verses that translate it when the
  evidence is clear, and otherwise the given ref stands. The check is
  conservative. It corrects whole shifted or displaced stretches; it leaves
  alone chapters where Brenton merely divides verses differently (1 Esdras 2).

Usage:
    python ingest/ingest_witness_en.py --sqlite wordstudy.db

Brenton chapters are cached under data/brenton/ (git-ignored).
"""

import argparse
import json
import re
import sqlite3
import time
from collections import Counter, defaultdict
from pathlib import Path
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


def brenton_chapter(usfm, ch, cache_dir):
    """One Brenton chapter as [(verse number, text)], cached on disk."""
    cache = Path(cache_dir) / f"{usfm}_{ch}.json"
    if cache.exists():
        data = json.loads(cache.read_text(encoding="utf-8"))
    else:
        data = fetch_json(f"{HELLOAO}/eng_bre/{usfm}/{ch}.json")
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(data), encoding="utf-8")
        time.sleep(0.05)
    verses = []
    for item in data["chapter"]["content"]:
        if isinstance(item, dict) and item.get("type") == "verse":
            parts = [
                p.strip() if isinstance(p, str) else str(p.get("text", "")).strip()
                for p in item.get("content", [])
                if isinstance(p, str) or (isinstance(p, dict) and "text" in p)
            ]
            text = " ".join(x for x in parts if x)
            if text and str(item["number"]).isdigit():
                verses.append((int(item["number"]), text))
    return verses


# --- Alignment of Brenton's verses to the Greek rows -------------------------
#
# A Greek verse and an English verse agree to the extent that the Greek lemmas
# find their usual English in the verse. "Usual English" is learned from the
# corpus itself (learn_lexicon): nine refs in ten are already right, which is
# enough to tell which English words travel with which Greek lemma.

AGREE = 0.4          # share of a verse's lemmas that must find their English
BETTER = 0.2         # margin by which a moved run must beat the given refs
MIN_RUN = 3          # verses that must move together; a lone verse never moves
DRIFT = 0.3          # cost of changing offset from one verse to the next
MAX_OFFSET = 3       # verses, for ordinary numbering differences
WINDOW = 160         # verses either side, when hunting a displaced block
UNNUMBERED = 0.6     # agreement needed where Brenton has no such verse number


def stems(text):
    return {w[:5] for w in re.sub(r"[^a-z ]", " ", text.lower()).split() if len(w) >= 4}


def learn_lexicon(pairs):
    """Greek lemma -> English stems that translate it, from verse pairs.

    pairs: [(lemmas, english stems)] for verses paired by their given refs.
    Most of those refs are right, so a stem that keeps turning up beside a
    lemma (4x more often than chance, at least 3 times) is its translation.
    Names and LXX vocabulary are learned along with everything else; function
    words fail the test and are left out, so they do not count for or against."""
    n_lemma, n_stem, n_both = Counter(), Counter(), Counter()
    for lemmas, english in pairs:
        n_lemma.update(lemmas)
        n_stem.update(english)
        for g in lemmas:
            for e in english:
                n_both[(g, e)] += 1
    total = len(pairs)
    lexicon = defaultdict(set)
    for (g, e), n in n_both.items():
        if n >= 3 and (n / n_lemma[g]) / (n_stem[e] / total) >= 4:
            lexicon[g].add(e)
    return lexicon


def agreement(lemmas, english_stems, lexicon):
    known = [g for g in lemmas if g in lexicon]
    if len(known) < 3:
        return None
    return sum(1 for g in known if lexicon[g] & english_stems) / len(known)


def best_path(n, candidates, emit, move):
    """Viterbi: the highest-scoring choice of one candidate per verse."""
    prev = {j: emit(0, j) for j in candidates(0)}
    back = []
    for i in range(1, n):
        cur, ptr = {}, {}
        for j in candidates(i):
            options = [(prev[k] - cost, k) for k in prev
                       for cost in [move(i, k, j)] if cost is not None]
            if options:
                total, k = max(options)
                cur[j], ptr[j] = total + emit(i, j), k
        if not cur:      # no legal move: restart from this verse
            top = max(prev, key=prev.get)
            cur = {j: prev[top] + emit(i, j) for j in candidates(i)}
            ptr = {j: top for j in cur}
        back.append(ptr)
        prev = cur
    j = max(prev, key=prev.get)
    path = [j]
    for ptr in reversed(back):
        j = ptr[j]
        path.append(j)
    return path[::-1]


def align_work(greek, brenton, lexicon):
    """Pair each Greek verse of one work with a Brenton verse.

    greek:   {chapter: [(verse, lemmas)]} in verse order
    brenton: {chapter: [(verse, text)]}
    Returns ({(chapter, verse): text}, [chapters whose pairing changed]).

    The given ref stands unless the Greek clearly says otherwise. Brenton's
    verses are laid end to end, so a shift at the end of a chapter runs into
    the next one (Deut 28:69 is Brenton's 29:1). Within a chapter the pairing
    may drift a few verses, never backwards; a chapter that still disagrees is
    searched for a block Brenton prints elsewhere (Sirach 30-36). Verses move
    only as a run of MIN_RUN or more that agrees with the Greek and beats the
    given refs by a margin."""
    flat, texts, start, index = [], [], {}, {}
    for ch in sorted(brenton):
        start[ch] = len(flat)
        for verse, text in brenton[ch]:
            index[(ch, verse)] = len(flat)
            flat.append(stems(text))
            texts.append(text)

    out, changed = {}, []
    for ch, verses in greek.items():
        if ch not in start:
            continue
        n = len(verses)
        own = [index.get((ch, v)) for v, _ in verses]            # Brenton's verse of that number
        home = [o if o is not None else start[ch] + v - 1 for o, (v, _) in zip(own, verses)]

        def raw(i, j):
            return agreement(verses[i][1], flat[j], lexicon) if 0 <= j < len(flat) else None

        def score(i, j):
            return raw(i, j) or 0.0

        def share(path):
            marks = [a for a in (raw(i, j) for i, j in enumerate(path)) if a is not None]
            return (sum(1 for a in marks if a >= AGREE) / len(marks)) if len(marks) >= 8 else None

        def emit(i, j):
            return score(i, j) + (0.05 if j == home[i] else 0)

        def drift(i, k, j):
            if j < k:
                return None                                  # never backwards
            return 0.0 if j - k == verses[i][0] - verses[i - 1][0] else DRIFT

        near = best_path(
            n, lambda i: range(home[i] - MAX_OFFSET, home[i] + MAX_OFFSET + 1), emit, drift)

        pick = list(home)
        i = 0
        while i < n:
            k = i
            while k < n and near[k] - home[k] == near[i] - home[i]:
                k += 1
            if near[i] != home[i] and k - i >= MIN_RUN:
                new = sum(score(x, near[x]) for x in range(i, k)) / (k - i)
                old = sum(score(x, home[x]) for x in range(i, k)) / (k - i)
                if new >= AGREE and new >= old + BETTER:
                    pick[i:k] = near[i:k]
            i = k

        # A displaced block: most of the chapter disagrees where it stands and
        # agrees, in order, somewhere else.
        before = share(pick)
        if before is not None and before < 0.4:
            lo, hi = max(0, min(home) - WINDOW), min(len(flat), max(home) + WINDOW)

            def jump(i, k, j):
                return 0.0 if j - k == verses[i][0] - verses[i - 1][0] else 0.5

            wide = best_path(n, lambda i: range(lo, hi), emit, jump)
            breaks = sum(1 for x in range(1, n)
                         if wide[x] - wide[x - 1] != verses[x][0] - verses[x - 1][0])
            after = share(wide)
            if after is not None and breaks <= 2 and after >= 0.6 and after >= before + 0.3:
                pick = wide
        if pick != home:
            changed.append(ch)

        for x, (verse, _) in enumerate(verses):
            j = pick[x]
            if not 0 <= j < len(texts):
                continue
            if j == own[x] or pick[x] != home[x]:
                out[(ch, verse)] = texts[j]                  # the given ref, or an evidenced move
            elif own[x] is None and score(x, j) >= UNNUMBERED:
                out[(ch, verse)] = texts[j]                  # unnumbered in Brenton, but it agrees
    return out, changed


def load_brenton(conn, cache_dir="data/brenton"):
    books = {b["id"]: b for b in fetch_json(f"{HELLOAO}/eng_bre/books.json")["books"]}
    works = {}
    for usfm, work in BRENTON_BOOKS.items():
        meta = books.get(usfm)
        if not meta:
            continue
        brenton = {
            ch: brenton_chapter(usfm, ch, cache_dir)
            for ch in range(1, meta["numberOfChapters"] + 1)
        }
        greek = defaultdict(list)
        for ref, lemmas in conn.execute(
            "select ref, lemmas from period_docs where corpus = 'LXX' and work = ? order by id",
            (work,),
        ):
            ch, _, verse = ref.partition(":")
            if ch.isdigit() and verse.isdigit():
                greek[int(ch)].append((int(verse), set(json.loads(lemmas or "[]"))))
        for verses in greek.values():
            verses.sort(key=lambda r: r[0])
        works[work] = (greek, brenton)

    lexicon = learn_lexicon([
        (lemmas, stems(text))
        for greek, brenton in works.values()
        for ch, verses in greek.items()
        for given in [dict(brenton.get(ch, []))]
        for verse, lemmas in verses if verse in given
        for text in [given[verse]]
    ])

    total = 0
    for work, (greek, brenton) in works.items():
        paired, changed = align_work(greek, brenton, lexicon)
        # Clear first so a re-run cannot leave an earlier, wrong pairing behind.
        conn.execute(
            "update period_docs set content_en = null where corpus = 'LXX' and work = ?", (work,)
        )
        conn.executemany(
            "update period_docs set content_en = ? "
            "where corpus = 'LXX' and work = ? and ref = ?",
            [(text, work, f"{ch}:{verse}") for (ch, verse), text in paired.items()],
        )
        conn.commit()
        total += len(paired)
        note = f"; realigned chapters {', '.join(map(str, changed))}" if changed else ""
        print(f"  LXX {work}: {len(paired):,} Brenton verses{note}")
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
