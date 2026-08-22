#!/usr/bin/env python3
"""
Ingest STEPBible TIPNR (proper names: people, places, other) into the
word-study database. Gives every tagged name an identity: who the person
is (family, era, every appearance) or where the place is (coordinates).

Data source: github.com/STEPBible/STEPBible-Data (CC BY 4.0)
Attribution: "Tyndale House, Cambridge" (www.TyndaleHouse.com) and
             "STEP Bible" (www.STEPBible.org)

Usage:
    # Fetch the data file first (not committed; STEPBible asks that the
    # repo stay the single distribution point):
    curl -sL -o data/TIPNR/TIPNR.txt "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Proper%20Nouns/TIPNR%20-%20Translators%20Individualised%20Proper%20Names%20with%20all%20References%20-%20STEPBible.org%20CC%20BY.txt"

    # Local test database (SQLite):
    python ingest/ingest_tipnr.py --file data/TIPNR/TIPNR.txt --sqlite wordstudy.db

    # Supabase / Postgres (pip install psycopg2-binary):
    export DATABASE_URL="postgresql://postgres:...@db.<project>.supabase.co:5432/postgres"
    python ingest/ingest_tipnr.py --file data/TIPNR/TIPNR.txt --postgres

Idempotent: truncate-and-load.

Format (see docs/historical-context.md): records separated by
"$========== PERSON(s)|PLACE|OTHER" lines; a top line for the individual,
"– <Significance>" sub-lines per name form (dStrong + refs), a "– Total"
line, then @Briefest/@Brief/@Short/@Article description lines.
"""

import argparse
import os
import re
import sqlite3
import sys
from pathlib import Path

RECORD_RE = re.compile(r"^\$=+\s*(PERSON|PLACE|OTHER)")
# Aaron@Exo.4.14-Heb=H0175  /  Abdon@Jos.19.28-1Ch=H5658G
TOP_RE = re.compile(r"^(.+?)@([^=\t]+)=([HG]\d{4}[A-Za-z]*)$")
# H0175«H0175=אַהֲרֹן
STRONGFORM_RE = re.compile(r"^([HG]\d{4}[A-Za-z]*)\xab([HG]\d{4}[A-Za-z]*)?=?(.*)$")
REF_RE = re.compile(r"^(LXX\s+)?([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)[a-z]?$")
LATLNG_RE = re.compile(r"@(-?\d+\.\d+),(-?\d+\.\d+)")

KIND = {"PERSON": "person", "PLACE": "place", "OTHER": "other"}


def clean(s):
    """Empty, lone '>' continuation markers, and bare '+' become None."""
    s = (s or "").strip()
    return s if s and s not in (">", "+", "– >") else None


def parse_refs(field):
    """'Exo.4.14; Exo.7.10a; LXX Gen.14.5' -> [('Exo',4,14), ('Exo',7,10)].
    LXX-only refs are skipped (no MT/NT verse to land on)."""
    out, seen = [], set()
    for part in (field or "").split(";"):
        m = REF_RE.match(part.strip())
        if not m or m.group(1):
            continue
        key = (m.group(2), int(m.group(3)), int(m.group(4)))
        if key not in seen:
            seen.add(key)
            out.append(key)
    return out


def parse_records(path: Path):
    """Yield one dict per entity."""
    kind = None
    rec = None
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            line = line.rstrip("\n").rstrip("\t \r")
            m = RECORD_RE.match(line)
            if m:
                if rec:
                    yield rec
                kind, rec = KIND[m.group(1)], None
                continue
            if kind is None:
                continue
            cols = line.split("\t")
            top = TOP_RE.match(cols[0])
            # Records are usually separated by "$..." lines, but the OTHER
            # section runs records together: a new top line ends the previous
            # record. Sub-record UniqueName cells never land here because
            # sub-lines start with "–" and are consumed below.
            if rec is not None and top:
                yield rec
                rec = None
            if rec is None and top:
                name, anchor, ustrong = top.groups()
                rec = dict(
                    ustrong=ustrong, kind=kind, name=name.strip(),
                    unified_name=f"{name}@{anchor}", etype=None, description=None,
                    parents=None, siblings=None, partners=None, offspring=None,
                    tribe=None, founder=None, inhabitants=None,
                    openbible_name=None, lat=None, lng=None, summary=None,
                    brief=None, short_desc=None, article=None,
                    refs_count=None, names=[],
                )
                get = lambda i: clean(cols[i]) if len(cols) > i else None
                if kind == "person":
                    rec.update(description=get(1), parents=get(2),
                               siblings=get(3), partners=get(4),
                               offspring=get(5), tribe=get(6))
                elif kind == "place":
                    rec.update(openbible_name=get(1), founder=get(2),
                               inhabitants=get(3), tribe=get(6))
                    ll = LATLNG_RE.search(cols[4] if len(cols) > 4 else "")
                    if ll and float(ll.group(1)) != 0.0:
                        rec["lat"], rec["lng"] = float(ll.group(1)), float(ll.group(2))
                else:
                    rec["description"] = get(1)
                # summary is the first #-prefixed column; type follows it
                for i, c in enumerate(cols[1:], 1):
                    if c.strip().startswith("#"):
                        rec["summary"] = c.strip().lstrip("#").strip()
                        rec["etype"] = clean(cols[i + 1]) if len(cols) > i + 1 else None
                        break
                continue
            if rec is None:
                continue
            first = cols[0].strip()
            if first.startswith("–"):
                sig = first.lstrip("–").strip()
                if sig == "Total":
                    if len(cols) > 4 and cols[4].strip().isdigit():
                        rec["refs_count"] = int(cols[4])
                elif sig and len(cols) > 2:
                    sf = STRONGFORM_RE.match(cols[1].strip()) if "\xab" in cols[1] else None
                    ci = 1 if sf else 2  # some lines omit the UniqueName column
                    sf = sf or (STRONGFORM_RE.match(cols[2].strip()) if len(cols) > 2 else None)
                    if sf:
                        rec["names"].append(dict(
                            significance=sig,
                            dstrong=sf.group(1), estrong=sf.group(2),
                            form=clean(sf.group(3)),
                            translated=clean(cols[ci + 1]) if len(cols) > ci + 1 else None,
                            refs=parse_refs(cols[ci + 3]) if len(cols) > ci + 3 else [],
                        ))
            elif first.startswith("@"):
                for chunk in re.split(r"\t&?\s*(?=@)", line):
                    chunk = chunk.strip()
                    for key, col in (("@Briefest=", None), ("@Brief=", "brief"),
                                     ("@Short=", "short_desc"), ("@Article=", "article")):
                        if chunk.startswith(key) and col:
                            rec[col] = clean(chunk[len(key):])
    if rec:
        yield rec


# Family/founder fields hold UniqueNames like "Amram@Exo.6.18-1Ch + Jochebed@Exo.6.20-Num"
# with markers: (d) descended-from, (a) ancestor, (f) founder, (?) uncertain.
LINK_MARK_RE = re.compile(r"\((d|a|f|\?)\)\s*$")
LINK_ROLES = (("parents", "parent"), ("siblings", "sibling"),
              ("partners", "partner"), ("offspring", "offspring"),
              ("founder", "founder"), ("inhabitants", "inhabitant"))


def build_links(records):
    """Resolve family/founder UniqueName references to uStrongs."""
    by_uname = {}
    for r in records:
        by_uname.setdefault(r["unified_name"], r["ustrong"])
        # AltName|UnifiedName forms resolve through the unified half
        if "|" in r["unified_name"]:
            by_uname.setdefault(r["unified_name"].split("|", 1)[1], r["ustrong"])
    links = []
    for r in records:
        for field, role in LINK_ROLES:
            for part in re.split(r"[+,]", r[field] or ""):
                part = LINK_MARK_RE.sub("", part.strip()).strip()
                if not part or "@" not in part:
                    continue
                target = by_uname.get(part) or by_uname.get(part.split("|", 1)[-1])
                links.append((r["ustrong"], role, part.split("@")[0].split("|")[-1], target))
    return links


SQLITE_SCHEMA = """
drop table if exists entities;
drop table if exists entity_names;
drop table if exists entity_refs;
drop table if exists entity_links;
create table entities (
    ustrong text primary key,
    kind text, etype text, name text, unified_name text,
    description text, summary text,
    parents text, siblings text, partners text, offspring text, tribe text,
    founder text, inhabitants text, openbible_name text,
    lat real, lng real,
    brief text, short_desc text, article text, refs_count int
);
create table entity_names (
    id integer primary key autoincrement,
    ustrong text, dstrong text, estrong text,
    significance text, form text, translated text
);
create index idx_entity_names_dstrong on entity_names (dstrong);
create index idx_entity_names_ustrong on entity_names (ustrong);
create table entity_refs (
    ustrong text, book text, chapter int, verse int,
    primary key (ustrong, book, chapter, verse)
) without rowid;
create index idx_entity_refs_ref on entity_refs (book, chapter, verse);
create table entity_links (
    ustrong text, role text, name text, target text
);
create index idx_entity_links_ustrong on entity_links (ustrong);
"""

ENTITY_COLS = ("ustrong", "kind", "etype", "name", "unified_name", "description",
               "summary", "parents", "siblings", "partners", "offspring", "tribe",
               "founder", "inhabitants", "openbible_name", "lat", "lng",
               "brief", "short_desc", "article", "refs_count")
NAME_COLS = ("ustrong", "dstrong", "estrong", "significance", "form", "translated")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True, help="path to the TIPNR txt file")
    ap.add_argument("--sqlite", help="path to SQLite db (local testing)")
    ap.add_argument("--postgres", action="store_true", help="use DATABASE_URL")
    args = ap.parse_args()

    records, dupes, seen = [], 0, set()
    for rec in parse_records(Path(args.file)):
        if rec["ustrong"] in seen:
            dupes += 1
            continue
        seen.add(rec["ustrong"])
        records.append(rec)
    if dupes:
        print(f"  warning: {dupes} duplicate uStrong records skipped")

    entities, names, refs = [], [], []
    for rec in records:
        entities.append(tuple(rec[c] for c in ENTITY_COLS))
        ref_seen = set()
        for nm in rec["names"]:
            names.append((rec["ustrong"], nm["dstrong"], nm["estrong"],
                          nm["significance"], nm["form"], nm["translated"]))
            for book, ch, vs in nm["refs"]:
                if (book, ch, vs) not in ref_seen:
                    ref_seen.add((book, ch, vs))
                    refs.append((rec["ustrong"], book, ch, vs))
    links = build_links(records)

    if args.postgres:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        for table in ("entity_refs", "entity_names", "entity_links", "entities"):
            cur.execute(f"truncate {table}" if table != "entities"
                        else "truncate entities cascade")
        psycopg2.extras.execute_values(
            cur, f"insert into entities ({','.join(ENTITY_COLS)}) values %s", entities)
        psycopg2.extras.execute_values(
            cur, f"insert into entity_names ({','.join(NAME_COLS)}) values %s", names)
        psycopg2.extras.execute_values(
            cur, "insert into entity_refs (ustrong, book, chapter, verse) values %s "
                 "on conflict do nothing", refs)
        psycopg2.extras.execute_values(
            cur, "insert into entity_links (ustrong, role, name, target) values %s", links)
        conn.commit()
    else:
        conn = sqlite3.connect(args.sqlite or "wordstudy.db")
        conn.executescript(SQLITE_SCHEMA)
        cur = conn.cursor()
        cur.executemany(
            f"insert into entities ({','.join(ENTITY_COLS)}) values ({','.join('?' * len(ENTITY_COLS))})",
            entities)
        cur.executemany(
            f"insert into entity_names ({','.join(NAME_COLS)}) values (?,?,?,?,?,?)", names)
        cur.executemany(
            "insert or ignore into entity_refs (ustrong, book, chapter, verse) values (?,?,?,?)",
            refs)
        cur.executemany(
            "insert into entity_links (ustrong, role, name, target) values (?,?,?,?)", links)
        conn.commit()

    kinds = {}
    for e in entities:
        kinds[e[1]] = kinds.get(e[1], 0) + 1
    resolved = sum(1 for l in links if l[3])
    print(f"Ingested {len(entities):,} entities ({', '.join(f'{v:,} {k}' for k, v in sorted(kinds.items()))}), "
          f"{len(names):,} name forms, {len(refs):,} refs, "
          f"{len(links):,} links ({resolved:,} resolved).")
    conn.close()


if __name__ == "__main__":
    main()
