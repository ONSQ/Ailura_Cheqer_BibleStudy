#!/usr/bin/env python3
"""
Dev API bridge: serves wordstudy.db (SQLite) over HTTP with the same shapes
the app's data layer expects from Supabase. Lets the Expo app run against
local Phase 1 data before a Supabase project exists.

Usage:
    python tools/dev_server.py [--db wordstudy.db] [--port 8787]

Endpoints (all JSON, CORS open, read-only):
    /books                                  -> [{book, corpus, chapters}]
    /chapter?book=Gen&chapter=1             -> {book, chapter, corpus, verses:[{verse, words:[...]}]}
    /lexeme?strongs=H0430                   -> {strongs, language, lemma, gloss, occurrences}
    /translation?version=BSB&book=Gen&chapter=1 -> {version, book, chapter, verses:[{verse, text}]}
    /glosses?strongs=H0430                  -> [{gloss, count}]
    /occurrences?strongs=H0430&limit=50&offset=0 -> {total, rows:[...]}

stdlib only, no dependencies.
"""

import argparse
import json
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

local = threading.local()
DB_PATH = "wordstudy.db"


def db():
    if not hasattr(local, "conn"):
        local.conn = sqlite3.connect(DB_PATH)
        local.conn.row_factory = sqlite3.Row
    return local.conn


def tag_priority(corpus, tag):
    """Pick one row per word slot. OT: Leningrad main text first, then Qere,
    then anything else. NT has no duplicate slots, so priority is moot there."""
    tag = tag or ""
    if corpus == "OT":
        if tag.startswith("L"):
            return 0
        if tag.startswith("Q"):
            return 1
        return 2
    return 0


def get_books():
    rows = db().execute(
        """select book, corpus, max(chapter) as chapters, min(id) as ord
           from ol_words group by book, corpus
           order by case corpus when 'OT' then 0 else 1 end, ord"""
    ).fetchall()
    return [dict(book=r["book"], corpus=r["corpus"], chapters=r["chapters"]) for r in rows]


def get_chapter(book, chapter):
    rows = db().execute(
        """select id, verse, word_num, source_tag, surface, translit, gloss,
                  strongs, morph, corpus
           from ol_words where book = ? and chapter = ?
           order by verse, word_num, id""",
        (book, chapter),
    ).fetchall()
    corpus = rows[0]["corpus"] if rows else None
    # Dedupe word slots (ketiv/qere and text-type variants share word_num)
    best = {}
    for r in rows:
        key = (r["verse"], r["word_num"])
        if key not in best or tag_priority(corpus, r["source_tag"]) < tag_priority(
            corpus, best[key]["source_tag"]
        ):
            best[key] = r
    verses = {}
    for (verse, _), r in sorted(best.items()):
        verses.setdefault(verse, []).append(
            dict(
                id=r["id"], word_num=r["word_num"], surface=r["surface"],
                translit=r["translit"], gloss=r["gloss"], strongs=r["strongs"],
                morph=r["morph"],
            )
        )
    return dict(
        book=book, chapter=chapter, corpus=corpus,
        verses=[dict(verse=v, words=w) for v, w in verses.items()],
    )


def get_lexeme(strongs):
    r = db().execute("select * from lexemes where strongs = ?", (strongs,)).fetchone()
    return dict(r) if r else None


def get_glosses(strongs):
    rows = db().execute(
        """select gloss, count(*) as count from ol_words
           where strongs = ? and gloss is not null and gloss != ''
           group by gloss order by count desc limit 15""",
        (strongs,),
    ).fetchall()
    return [dict(r) for r in rows]


BOOK_ORDER = (
    "Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro "
    "Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal "
    "Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas "
    "1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev"
).split()
BOOK_ORDER_SQL = "case book " + " ".join(
    f"when '{b}' then {i}" for i, b in enumerate(BOOK_ORDER)
) + " else 99 end"


def get_occurrences(strongs, limit, offset):
    total = db().execute(
        "select count(*) from ol_words where strongs = ?", (strongs,)
    ).fetchone()[0]
    rows = db().execute(
        f"""select book, chapter, verse, word_num, surface, translit, gloss
           from ol_words where strongs = ?
           order by {BOOK_ORDER_SQL}, chapter, verse, word_num
           limit ? offset ?""",
        (strongs, limit, offset),
    ).fetchall()
    return dict(total=total, rows=[dict(r) for r in rows])


def get_translation(version, book, chapter):
    try:
        rows = db().execute(
            """select verse, text from translations
               where version = ? and book = ? and chapter = ?
               order by verse""",
            (version, book, chapter),
        ).fetchall()
    except sqlite3.OperationalError:  # translations table not imported yet
        rows = []
    return dict(
        version=version, book=book, chapter=chapter,
        verses=[dict(r) for r in rows],
    )


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        try:
            if url.path == "/books":
                body = get_books()
            elif url.path == "/chapter":
                body = get_chapter(q["book"], int(q["chapter"]))
            elif url.path == "/lexeme":
                body = get_lexeme(q["strongs"])
            elif url.path == "/glosses":
                body = get_glosses(q["strongs"])
            elif url.path == "/translation":
                body = get_translation(
                    q.get("version", "BSB"), q["book"], int(q["chapter"])
                )
            elif url.path == "/occurrences":
                body = get_occurrences(
                    q["strongs"], int(q.get("limit", 50)), int(q.get("offset", 0))
                )
            else:
                self.respond(404, {"error": "not found"})
                return
            self.respond(200, body)
        except (KeyError, ValueError) as e:
            self.respond(400, {"error": str(e)})

    def respond(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass  # keep the console quiet


def main():
    global DB_PATH
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="wordstudy.db")
    ap.add_argument("--port", type=int, default=8787)
    args = ap.parse_args()
    DB_PATH = args.db
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Dev API bridge on http://127.0.0.1:{args.port} serving {args.db}")
    server.serve_forever()


if __name__ == "__main__":
    main()
