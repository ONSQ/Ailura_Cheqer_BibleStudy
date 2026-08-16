#!/usr/bin/env python3
"""Ingest Josephus from Perseus TEI into the local period_docs table.

Source: PerseusDL canonical-greekLit tlg0526 (CC BY-SA 4.0), Greek text
with Whiston's public-domain English translation. The English is divided
into Whiston's paragraphs, each anchored at the Niese section where it
starts; we use those paragraphs as the retrieval unit and attach the
Greek text of the sections each paragraph covers.

Usage:
  python ingest/ingest_josephus.py --data-dir data/josephus [--sqlite wordstudy.db]

Idempotent: deletes corpus='Josephus' rows first, then reloads.
"""
import argparse
import copy
import re
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path

TEI = "{http://www.tei-c.org/ns/1.0}"

WORKS = {
    "tlg001": ("Antiquities", "Ant."),
    "tlg002": ("Life", "Life"),
    "tlg003": ("Against Apion", "Apion"),
    "tlg004": ("Jewish War", "War"),
}

LICENSE = "Perseus Digital Library, CC BY-SA 4.0; Whiston translation public domain"


def clean_text(div: ET.Element) -> str:
    """Text content of a div, with footnotes and milestone labels dropped."""
    div = copy.deepcopy(div)
    for parent in div.iter():
        for child in list(parent):
            if child.tag in (f"{TEI}note", f"{TEI}bibl", f"{TEI}head"):
                parent.remove(child)
    text = " ".join("".join(div.itertext()).split())
    return text


def sections_of(parent: ET.Element) -> list[tuple[int, ET.Element]]:
    """Numeric (n, div) section children, skipping 'arg' chapter summaries."""
    out = []
    for div in parent.iter(f"{TEI}div"):
        if div.get("subtype") == "section" and (div.get("n") or "").isdigit():
            out.append((int(div.get("n")), div))
    return out


def book_units(root: ET.Element) -> list[tuple[str | None, ET.Element]]:
    """(book_n, container) pairs; a work without book divs is one unit."""
    body = root.find(f".//{TEI}body")
    books = [
        d
        for d in body.iter(f"{TEI}div")
        if d.get("subtype") == "book" and (d.get("n") or "").isdigit()
    ]
    if books:
        return [(b.get("n"), b) for b in books]
    return [(None, body)]


def parse_work(data_dir: Path, tlg: str) -> list[dict]:
    work, abbr = WORKS[tlg]
    eng_root = ET.parse(data_dir / f"tlg0526.{tlg}.perseus-eng2.xml").getroot()
    grc_root = ET.parse(data_dir / f"tlg0526.{tlg}.perseus-grc2.xml").getroot()

    grc_by_book: dict[str | None, dict[int, str]] = {}
    for book_n, container in book_units(grc_root):
        grc_by_book[book_n] = {n: clean_text(d) for n, d in sections_of(container)}

    rows = []
    for book_n, container in book_units(eng_root):
        greek = grc_by_book.get(book_n, {})
        anchors = sections_of(container)
        for i, (start, div) in enumerate(anchors):
            end = anchors[i + 1][0] - 1 if i + 1 < len(anchors) else max(greek, default=start)
            english = clean_text(div)
            if not english:
                continue
            covered = [greek[n] for n in range(start, end + 1) if n in greek]
            content = " ".join(covered)
            loc = f"{book_n}.{start}" if book_n else str(start)
            if end > start:
                loc += f"-{end}"
            rows.append(
                {
                    "corpus": "Josephus",
                    "work": work,
                    "ref": f"{abbr} {loc}",
                    "language": "grc",
                    "content": content or english,
                    "content_en": english,
                    "license": LICENSE,
                }
            )
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data/josephus")
    ap.add_argument("--sqlite", default="wordstudy.db")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    all_rows = []
    for tlg in WORKS:
        rows = parse_work(data_dir, tlg)
        print(f"{WORKS[tlg][0]}: {len(rows)} passages")
        all_rows.extend(rows)

    conn = sqlite3.connect(args.sqlite)
    conn.execute("delete from period_docs where corpus = 'Josephus'")
    conn.executemany(
        "insert into period_docs (corpus, work, ref, language, content, content_en, license) "
        "values (:corpus, :work, :ref, :language, :content, :content_en, :license)",
        all_rows,
    )
    conn.commit()
    total = conn.execute(
        "select count(*) from period_docs where corpus = 'Josephus'"
    ).fetchone()[0]
    words = conn.execute(
        "select sum(length(content_en) - length(replace(content_en, ' ', '')) + 1) "
        "from period_docs where corpus = 'Josephus'"
    ).fetchone()[0]
    print(f"loaded {total} rows, ~{words:,} English words")


if __name__ == "__main__":
    main()
