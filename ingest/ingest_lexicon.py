#!/usr/bin/env python3
"""Word anatomy: load the lexicon entries behind each Strong's number.

Sources (all free to use, credited on the About screen):
  Greek   TBESG from STEPBible (CC BY 4.0): Abbott-Smith's Manual Greek
          Lexicon (1922, public domain) edited by Tyndale House. Carries the
          derivation in parentheses after the headword, the Hebrew the LXX
          used the word for, and the sense structure.
  Hebrew  Brown-Driver-Briggs (1906, public domain) as marked up by
          OpenScriptures (CC BY 4.0), with their Lexical Index that maps
          Strong's numbers to BDB entries and records each word's root and
          the family of words derived from it. TBESH from STEPBible supplies
          the transliteration, grammar code, gloss and name relations; its
          Meaning column (Online Bible's abridged BDB, permission required)
          is deliberately not read.

Idempotent: truncate-and-load. Writes lexicon_entries to SQLite or Postgres.

    python3 ingest/ingest_lexicon.py --data-dir data/lexicon --sqlite wordstudy.db
    python3 ingest/ingest_lexicon.py --data-dir data/lexicon --postgres   # DATABASE_URL

The four source files are downloaded into --data-dir when missing.
"""
import argparse
import html
import json
import os
import re
import sqlite3
import sys
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict

STEP = "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/"
OS = "https://raw.githubusercontent.com/openscriptures/HebrewLexicon/master/"
SOURCES = {
    "tbesg.txt": STEP + "TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Greek%20-%20STEPBible.org%20CC%20BY.txt",
    "tbesh.txt": STEP + "TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew%20-%20STEPBible.org%20CC%20BY.txt",
    "bdb.xml": OS + "BrownDriverBriggs.xml",
    "lexindex.xml": OS + "LexicalIndex.xml",
}
NS = "{http://openscriptures.github.com/morphhb/namespace}"


def fetch_sources(data_dir):
    os.makedirs(data_dir, exist_ok=True)
    for name, url in SOURCES.items():
        path = os.path.join(data_dir, name)
        if not os.path.exists(path):
            print(f"downloading {name} ...", file=sys.stderr)
            urllib.request.urlretrieve(url, path)


# ---------------------------------------------------------------------------
# Greek: TBESG (Abbott-Smith)
# ---------------------------------------------------------------------------

TAG_RE = re.compile(r"<[^>]+>")
PAREN_RE = re.compile(r"\(([^()]*(?:\([^()]*\)[^()]*)*)\)")
LXX_RE = re.compile(r"\[in LXX([^\]]*)\]")
NOT_DERIVATION_RE = re.compile(r"^(AS|MD|T om|LXX|EV|WH|Rec)\b")


def html_to_text(s):
    s = re.sub(r"<\s*br\s*/?\s*>", "\n", s, flags=re.I)
    s = re.sub(r"<ref=[^>]*>", "", s, flags=re.I)
    s = TAG_RE.sub("", s)
    s = html.unescape(s)
    s = s.replace("__", "")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def split_greek_meaning(meaning):
    """Abbott-Smith opens with the headword, then (derivation), then
    "[in LXX ... ;]", then the senses. Return (derivation, lxx_for, senses)."""
    text = html_to_text(meaning)
    lxx_for = None
    m = LXX_RE.search(text)
    if m:
        lxx_for = m.group(1).strip(" ;:")
        text = text[: m.start()] + text[m.end():]
    derivation = None
    m = PAREN_RE.search(text[:320])
    if m and not NOT_DERIVATION_RE.match(m.group(1)):
        derivation = m.group(1).strip()
        text = text[: m.start()] + text[m.end():]
    senses = text.split("\n", 1)[1] if "\n" in text else ""
    senses = re.sub(r"\s*\(AS\)\s*$", "", senses).strip(" \n,;")
    if not senses:
        senses = re.sub(r"^\S+\s*", "", text, count=1).strip(" \n,;")
    return derivation, lxx_for, senses


def parse_tbesg(path):
    """Yield one entry per base eStrong."""
    seen = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 8 or not re.match(r"^G\d{4}$", cols[0]):
                continue
            strongs = cols[0]
            if strongs in seen:
                continue  # first row per eStrong is the base sense
            seen.add(strongs)
            derivation, lxx_for, senses = split_greek_meaning(cols[7])
            yield dict(
                strongs=strongs, language="grk", source="Abbott-Smith",
                lemma=cols[3].strip() or None, translit=cols[4].strip() or None,
                pos=cols[5].strip() or None, gloss=cols[6].strip() or None,
                root=None, derivation=derivation, lxx_for=lxx_for,
                definition=senses[:4000] or None, family=[], relations=[],
            )


# ---------------------------------------------------------------------------
# Hebrew: OpenScriptures BDB + Lexical Index, TBESH for forms and relations
# ---------------------------------------------------------------------------

def el_text(el):
    """Flatten a BDB element to readable text: senses on their own lines."""
    out = []

    def walk(e, depth):
        tag = e.tag.replace(NS, "")
        if tag == "status":
            return
        if tag == "sense":
            n = e.get("n")
            out.append("\n" + "  " * depth + (f"{n}. " if n else "- "))
        if tag == "stem":
            out.append("[" + (e.text or "").strip() + "] ")
        elif e.text:
            out.append(e.text)
        for c in e:
            walk(c, depth + 1 if tag == "sense" else depth)
            if c.tail:
                out.append(c.tail)

    walk(el, 0)
    text = "".join(out)
    text = re.sub(r"^(\S+) \d+ ", r"\1 ", text)  # BDB's occurrence count after the headword
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def parse_hebrew(bdb_path, index_path, tbesh_path):
    bdb = {}
    for entry in ET.parse(bdb_path).getroot().iter(NS + "entry"):
        bdb[entry.get("id")] = entry

    # Lexical index: id -> word, transliteration, pos, gloss, BDB id, Strong's, root links.
    idx = {}
    for entry in ET.parse(index_path).getroot().iter(NS + "entry"):
        w = entry.find(NS + "w")
        xref = entry.find(NS + "xref")
        etym = entry.find(NS + "etym")
        rec = dict(
            id=entry.get("id"),
            w=(w.text or "").strip() if w is not None else None,
            xlit=w.get("xlit") if w is not None else None,
            pos=(entry.findtext(NS + "pos") or "").strip() or None,
            defn=", ".join(d.text.strip() for d in entry.findall(NS + "def") if d.text) or None,
            bdb=xref.get("bdb") if xref is not None else None,
            strong=xref.get("strong") if xref is not None else None,
            aug=xref.get("aug") if xref is not None else None,
            root=etym.get("root") if etym is not None else None,
            etype=etym.get("type") if etym is not None else None,
            etext=(etym.text or "").strip() if etym is not None else "",
        )
        idx[rec["id"]] = rec

    # Family: children of a root entry (listed in its etym text); parent of a sub.
    children = defaultdict(list)
    parent = {}
    for rec in idx.values():
        if rec["etype"] == "main":
            for cid in re.split(r"[,\s]+", rec["etext"]):
                if cid:
                    children[rec["id"]].append(cid)
                    parent[cid] = rec["id"]
        elif rec["etype"] == "sub" and rec["etext"]:
            parent[rec["id"]] = rec["etext"].split(",")[0].strip()

    by_strong = defaultdict(list)
    for rec in idx.values():
        if rec["strong"] and rec["strong"].isdigit():
            by_strong[int(rec["strong"])].append(rec)

    # TBESH: transliteration, grammar, gloss, relations (never the Meaning column).
    tbesh = {}
    with open(tbesh_path, encoding="utf-8") as f:
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 7 or not re.match(r"^H\d{4}[a-z]?$", cols[0]):
                continue
            key = cols[0][:5]
            rel = cols[1].split("=", 1)[1].strip() if "=" in cols[1] else ""
            rec = tbesh.setdefault(key, dict(hebrew=cols[3].strip(), translit=cols[4].strip(),
                                             morph=cols[5].strip(), gloss=cols[6].strip(), relations=[]))
            if rel and cols[2].strip() and not rel.startswith("a Meaning"):
                item = f"{rel} {cols[2].strip().rstrip(',').strip()}"
                if item not in rec["relations"]:
                    rec["relations"].append(item)

    for num, recs in sorted(by_strong.items()):
        strongs = f"H{num:04d}"
        recs.sort(key=lambda r: (r["aug"] or ""))
        base = next((r for r in recs if r["aug"] in (None, "a")), recs[0])
        homonyms = [r for r in recs if r is not base]
        entry = bdb.get(base["bdb"]) if base["bdb"] else None
        definition = el_text(entry) if entry is not None else None
        for h in homonyms:
            e2 = bdb.get(h["bdb"]) if h["bdb"] else None
            if e2 is not None:
                definition = (definition or "") + f"\n\nAlso ({h['aug'] or '?'}): " + el_text(e2)[:800]
        root_id = parent.get(base["id"]) if base["etype"] == "sub" else (base["id"] if base["etype"] == "main" else None)
        root_rec = idx.get(root_id) if root_id else None
        root = (root_rec.get("root") or root_rec["w"]) if root_rec else base["root"]
        family = []
        if root_id:
            for cid in children.get(root_id, []):
                c = idx.get(cid)
                if c and c["id"] != base["id"] and c["strong"] and c["strong"].isdigit():
                    family.append(dict(strongs=f"H{int(c['strong']):04d}", lemma=c["w"], gloss=c["defn"]))
        derivation = None
        if root_rec and root_rec is not base:
            derivation = f"from the root {root}" + (f" ({root_rec['defn']})" if root_rec["defn"] else "")
        elif base["etype"] == "main":
            derivation = "a root"
        t = tbesh.get(strongs, {})
        yield dict(
            strongs=strongs, language="heb", source="BDB",
            lemma=t.get("hebrew") or base["w"], translit=t.get("translit") or base["xlit"],
            pos=t.get("morph") or base["pos"], gloss=t.get("gloss") or base["defn"],
            root=root, derivation=derivation, lxx_for=None,
            definition=(definition or None) and definition[:4000],
            family=family[:12], relations=t.get("relations", [])[:6],
        )


# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------

DDL_SQLITE = """
create table if not exists lexicon_entries (
  strongs text primary key, language text not null, source text not null,
  lemma text, translit text, pos text, gloss text, root text, derivation text,
  lxx_for text, definition text, family text, relations text
);
"""


def row_tuple(r):
    return (r["strongs"], r["language"], r["source"], r["lemma"], r["translit"], r["pos"],
            r["gloss"], r["root"], r["derivation"], r["lxx_for"], r["definition"],
            json.dumps(r["family"], ensure_ascii=False), json.dumps(r["relations"], ensure_ascii=False))


def write_sqlite(path, rows):
    con = sqlite3.connect(path)
    con.executescript(DDL_SQLITE)
    con.execute("delete from lexicon_entries")
    con.executemany("insert into lexicon_entries values (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    [row_tuple(r) for r in rows])
    con.commit()
    con.close()


def write_postgres(rows):
    import psycopg2
    from psycopg2.extras import execute_values
    con = psycopg2.connect(os.environ["DATABASE_URL"])
    with con, con.cursor() as cur:
        cur.execute("truncate lexicon_entries")
        execute_values(
            cur,
            "insert into lexicon_entries (strongs, language, source, lemma, translit, pos, gloss, "
            "root, derivation, lxx_for, definition, family, relations) values %s",
            [row_tuple(r) for r in rows], page_size=500,
        )
    con.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data/lexicon")
    ap.add_argument("--sqlite")
    ap.add_argument("--postgres", action="store_true")
    ap.add_argument("--json", help="also write the rows as JSON lines")
    args = ap.parse_args()
    fetch_sources(args.data_dir)
    d = args.data_dir
    rows = list(parse_tbesg(os.path.join(d, "tbesg.txt")))
    rows += list(parse_hebrew(os.path.join(d, "bdb.xml"), os.path.join(d, "lexindex.xml"),
                              os.path.join(d, "tbesh.txt")))
    print(f"{len(rows)} entries ({sum(r['language'] == 'grk' for r in rows)} Greek, "
          f"{sum(r['language'] == 'heb' for r in rows)} Hebrew)", file=sys.stderr)
    if args.sqlite:
        write_sqlite(args.sqlite, rows)
    if args.postgres:
        write_postgres(rows)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
