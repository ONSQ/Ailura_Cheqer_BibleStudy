#!/usr/bin/env python3
"""Ingest Philo from OpenGreekAndLatin First1KGreek into period_docs.

Source: First1KGreek tlg0018 (CC BY-SA 4.0): Cohn's Greek text with
Yonge's public-domain English translation, both divided by the same
Cohn section numbers. Consecutive sections merge into passage-sized
chunks (~130 English words) for retrieval.

Usage:
  python ingest/ingest_philo.py --data-dir data/philo [--sqlite wordstudy.db]

Idempotent: deletes corpus='Philo' rows first, then reloads.
"""
import argparse
import copy
import re
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path

TEI = "{http://www.tei-c.org/ns/1.0}"
CTS = "{http://chs.harvard.edu/xmlns/cts}"

# Standard Philo abbreviations, keyed by the Latin title in the CTS metadata.
ABBREV = {
    "de opificio mundi": "Opif.",
    "legum allegoriarum": "Leg.",
    "legum allegoriae": "Leg.",
    "de cherubim": "Cher.",
    "de sacrificiis abelis et caini": "Sacr.",
    "quod deterius potiori insidiari soleat": "Det.",
    "de posteritate caini": "Post.",
    "de gigantibus": "Gig.",
    "quod deus sit immutabilis": "Deus",
    "de agricultura": "Agr.",
    "de plantatione": "Plant.",
    "de ebrietate": "Ebr.",
    "de sobrietate": "Sobr.",
    "de confusione linguarum": "Conf.",
    "de migratione abrahami": "Migr.",
    "quis rerum divinarum heres sit": "Her.",
    "de congressu eruditionis gratia": "Congr.",
    "de fuga et inventione": "Fug.",
    "de mutatione nominum": "Mut.",
    "de somniis": "Somn.",
    "de abrahamo": "Abr.",
    "de iosepho": "Ios.",
    "de josepho": "Ios.",
    "de vita mosis": "Mos.",
    "de decalogo": "Decal.",
    "de specialibus legibus": "Spec.",
    "de virtutibus": "Virt.",
    "de praemiis et poenis": "Praem.",
    "legum allegoriarum libri": "Leg.",
    "quod omnis probus liber sit": "Prob.",
    "de vita contemplativa": "Contempl.",
    "de aeternitate mundi": "Aet.",
    "in flaccum": "Flacc.",
    "legatio ad gaium": "Legat.",
    "de providentia": "Prov.",
    "hypothetica": "Hypoth.",
}

LICENSE = "OpenGreekAndLatin First1KGreek, CC BY-SA 4.0; Yonge translation public domain"
TARGET_WORDS = 130


def clean_text(div: ET.Element) -> str:
    div = copy.deepcopy(div)
    for parent in div.iter():
        for child in list(parent):
            if child.tag in (f"{TEI}note", f"{TEI}bibl", f"{TEI}head"):
                parent.remove(child)
    return " ".join("".join(div.itertext()).split())


def work_title(cts_path: Path) -> str:
    root = ET.parse(cts_path).getroot()
    title = root.find(f"{CTS}title")
    return title.text.strip() if title is not None and title.text else cts_path.stem


def units(root: ET.Element):
    """Yield (book_n or None, {section_n: div}) for each book-like unit."""
    body = root.find(f".//{TEI}body")
    books = [
        d
        for d in body.iter(f"{TEI}div")
        if d.get("subtype") == "book" and (d.get("n") or "").isdigit()
    ]
    containers = [(b.get("n"), b) for b in books] if books else [(None, body)]
    for book_n, c in containers:
        secs = {}
        for d in c.iter(f"{TEI}div"):
            if d.get("subtype") == "section" and (d.get("n") or "").isdigit():
                secs[int(d.get("n"))] = d
        yield book_n, secs


def chunk(work: str, abbr: str, book_n, grc: dict, eng: dict) -> list[dict]:
    rows = []
    ns = sorted(set(grc) | set(eng))
    cur, start = [], None
    for n in ns:
        if start is None:
            start = n
        cur.append(n)
        en_words = sum(len(clean_text(eng[m]).split()) for m in cur if m in eng)
        if en_words >= TARGET_WORDS:
            rows.append((start, cur[-1], list(cur)))
            cur, start = [], None
    if cur:
        rows.append((start, cur[-1], list(cur)))

    out = []
    for a, b, members in rows:
        content = " ".join(clean_text(grc[m]) for m in members if m in grc)
        english = " ".join(clean_text(eng[m]) for m in members if m in eng)
        if not content and not english:
            continue
        loc = f"{book_n}.{a}" if book_n else str(a)
        if b > a:
            loc += f"-{b}"
        out.append(
            {
                "corpus": "Philo",
                "work": work,
                "ref": f"{abbr} {loc}",
                "language": "grc",
                "content": content or english,
                "content_en": english or None,
                "license": LICENSE,
            }
        )
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data/philo")
    ap.add_argument("--sqlite", default="wordstudy.db")
    args = ap.parse_args()
    data_dir = Path(args.data_dir)

    all_rows = []
    for cts_path in sorted(data_dir.glob("tlg0*.cts.xml")):
        tlg = cts_path.name.split(".")[0]
        title = work_title(cts_path)
        norm = re.sub(r"\s+", " ", title.lower()).strip()
        abbr = next(
            (a for k, a in sorted(ABBREV.items(), key=lambda kv: -len(kv[0])) if norm.startswith(k)),
            title,
        )
        grc_root = ET.parse(data_dir / f"tlg0018.{tlg}.1st1K-grc1.xml").getroot()
        eng_root = ET.parse(data_dir / f"tlg0018.{tlg}.1st1K-eng1.xml").getroot()
        eng_units = dict((b, s) for b, s in units(eng_root))
        n_work = 0
        for book_n, grc_secs in units(grc_root):
            eng_secs = eng_units.get(book_n, {})
            rows = chunk(title, abbr, book_n, grc_secs, eng_secs)
            all_rows.extend(rows)
            n_work += len(rows)
        print(f"{title} ({abbr}): {n_work} passages")
    conn = sqlite3.connect(args.sqlite)
    conn.execute("delete from period_docs where corpus = 'Philo'")
    conn.executemany(
        "insert into period_docs (corpus, work, ref, language, content, content_en, license) "
        "values (:corpus, :work, :ref, :language, :content, :content_en, :license)",
        all_rows,
    )
    conn.commit()
    total, no_en = conn.execute(
        "select count(*), sum(case when content_en is null then 1 else 0 end) "
        "from period_docs where corpus = 'Philo'"
    ).fetchone()
    print(f"loaded {total} rows ({no_en or 0} without English)")


if __name__ == "__main__":
    main()
