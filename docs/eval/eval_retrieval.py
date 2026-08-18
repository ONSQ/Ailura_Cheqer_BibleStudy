#!/usr/bin/env python3
"""Retrieval evaluation: semantic search vs. concordance baseline.

Question: how well does embedding-based retrieval surface passages that
use a lemma, compared against English keyword search, when neither sees
the tags? The tagged Septuagint provides automatic ground truth: a
passage is relevant to lemma g iff its tagging contains g.

Systems under test (both blind to tags):
  semantic  embed the lexeme's semantic field (lemma + distinct gloss
            senses, the production recipe) with text-embedding-3-small,
            rank LXX passages by cosine distance
  keyword   rank LXX passages by number of gloss-term matches in the
            English translation (what a concordance user could do)
  random    expected precision equals the lemma's base rate; computed
            analytically as |truth| / N

Metrics per lemma: precision@10, precision@25, recall@50, and lift
(precision@10 over the random base rate). Macro averages close the
report.

Usage:
  set OPENAI_API_KEY=sk-...
  python docs/eval/eval_retrieval.py
  # writes results.json and results.md next to this script

Reproducible with only the app's public anon key; no database password
or service key involved.
"""
import json
import os
import time
import urllib.request
from pathlib import Path

SUPABASE = "https://sprykzqdpybiyqzbiybr.supabase.co"
ANON = "sb_publishable_mPC9RUurQIxHzR6ESYwgPw_TRAhzBIs"
EMBED_MODEL = "text-embedding-3-small"

# 25 Greek lemmas spanning frequency bands and semantic domains:
# theological abstractions, concrete nouns, persons, and body/nature terms.
LEMMAS = [
    "G2316",  # θεός god
    "G2962",  # κύριος lord
    "G3056",  # λόγος word
    "G4151",  # πνεῦμα spirit
    "G3551",  # νόμος law
    "G1242",  # διαθήκη covenant
    "G1391",  # δόξα glory
    "G4678",  # σοφία wisdom
    "G1515",  # εἰρήνη peace
    "G1343",  # δικαιοσύνη righteousness
    "G0266",  # ἁμαρτία sin
    "G5485",  # χάρις grace/favor
    "G5590",  # ψυχή soul
    "G2588",  # καρδία heart
    "G0935",  # βασιλεύς king
    "G0032",  # ἄγγελος angel/messenger
    "G2378",  # θυσία sacrifice
    "G2409",  # ἱερεύς priest
    "G4166",  # ποιμήν shepherd
    "G0740",  # ἄρτος bread
    "G5204",  # ὕδωρ water
    "G5457",  # φῶς light
    "G2222",  # ζωή life
    "G2288",  # θάνατος death
    "G0026",  # ἀγάπη love
]

STOP = {
    "and", "the", "a", "of", "my", "his", "your", "their", "i", "he", "you",
    "they", "who", "m", "re", "y", "have", "been", "were", "was", "are",
    "is", "to", "about",
}


def rpc(name: str, payload: dict):
    req = urllib.request.Request(
        f"{SUPABASE}/rest/v1/rpc/{name}",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "apikey": ANON,
            "Authorization": f"Bearer {ANON}",
        },
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                return json.load(res)
        except Exception as e:
            time.sleep(2**attempt)
            err = e
    raise SystemExit(f"RPC {name} failed: {err}")


def rest(path: str):
    req = urllib.request.Request(
        f"{SUPABASE}/rest/v1/{path}",
        headers={"apikey": ANON, "Authorization": f"Bearer {ANON}"},
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)


def clean(gloss: str) -> str:
    head = gloss.split("@")[0].split("»")[0]
    words = head.replace("[", " ").replace("]", " ").replace("/", " ").replace(",", " ").split()
    return " ".join(w for w in words if w.lower() not in STOP)


def semantic_field(strongs: str) -> tuple[str, list[str]]:
    lex = rest(f"lexemes?strongs=eq.{strongs}&select=lemma,gloss")[0]
    glosses = rpc("gloss_distribution", {"p_strongs": strongs})
    senses: list[str] = []
    for g in [x["gloss"] for x in glosses] + [lex["gloss"] or ""]:
        c = clean(g)
        if c and c not in senses:
            senses.append(c)
    senses = senses[:8]
    return f"{lex['lemma']}: {', '.join(senses)}", senses


def embed(text: str, key: str) -> list[float]:
    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=json.dumps({"model": EMBED_MODEL, "input": text}).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)["data"][0]["embedding"]


def precision_at(ranked: list[int], truth: set[int], k: int) -> float:
    top = ranked[:k]
    return sum(1 for i in top if i in truth) / k if top else 0.0


def recall_at(ranked: list[int], truth: set[int], k: int) -> float:
    if not truth:
        return 0.0
    return sum(1 for i in ranked[:k] if i in truth) / min(len(truth), k)


def main():
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise SystemExit("set OPENAI_API_KEY first")

    rows = []
    for strongs in LEMMAS:
        field, senses = semantic_field(strongs)
        truth_data = rpc("eval_lxx_truth", {"p_strongs": strongs})
        truth = set(truth_data["truth_ids"])
        total = truth_data["total_lxx"]
        base_rate = len(truth) / total if total else 0.0

        vector = embed(field, key)
        sem = rpc("eval_semantic_lxx", {"p_embedding": json.dumps(vector), "p_k": 50})
        kw_terms = [t for s in senses for t in s.split()][:8]
        kw = rpc("eval_keyword_lxx", {"p_terms": kw_terms, "p_k": 50})

        row = {
            "strongs": strongs,
            "field": field,
            "truth_size": len(truth),
            "base_rate": round(base_rate, 4),
            "semantic": {
                "p10": precision_at(sem, truth, 10),
                "p25": precision_at(sem, truth, 25),
                "r50": round(recall_at(sem, truth, 50), 4),
            },
            "keyword": {
                "p10": precision_at(kw, truth, 10),
                "p25": precision_at(kw, truth, 25),
                "r50": round(recall_at(kw, truth, 50), 4),
            },
        }
        row["semantic"]["lift"] = (
            round(row["semantic"]["p10"] / base_rate, 1) if base_rate else None
        )
        row["keyword"]["lift"] = (
            round(row["keyword"]["p10"] / base_rate, 1) if base_rate else None
        )
        rows.append(row)
        print(
            f"{strongs} {field[:34]:36} truth={len(truth):5}  "
            f"sem P@10={row['semantic']['p10']:.2f}  kw P@10={row['keyword']['p10']:.2f}",
            flush=True,
        )

    def macro(system: str, metric: str) -> float:
        return round(sum(r[system][metric] for r in rows) / len(rows), 4)

    summary = {
        "model": EMBED_MODEL,
        "n_lemmas": len(rows),
        "macro": {
            "semantic": {m: macro("semantic", m) for m in ("p10", "p25", "r50")},
            "keyword": {m: macro("keyword", m) for m in ("p10", "p25", "r50")},
            "mean_base_rate": round(sum(r["base_rate"] for r in rows) / len(rows), 4),
        },
    }

    out_dir = Path(__file__).parent
    (out_dir / "results.json").write_text(
        json.dumps({"summary": summary, "lemmas": rows}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    md = ["# Retrieval evaluation results", "", f"Embedding model: `{EMBED_MODEL}`", ""]
    md.append("| Lemma | Field | Truth | Base rate | Sem P@10 | KW P@10 | Sem P@25 | KW P@25 | Sem R@50 | KW R@50 |")
    md.append("|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        md.append(
            f"| {r['strongs']} | {r['field'][:30]} | {r['truth_size']} | {r['base_rate']:.3f} "
            f"| {r['semantic']['p10']:.2f} | {r['keyword']['p10']:.2f} "
            f"| {r['semantic']['p25']:.2f} | {r['keyword']['p25']:.2f} "
            f"| {r['semantic']['r50']:.2f} | {r['keyword']['r50']:.2f} |"
        )
    m = summary["macro"]
    md += [
        "",
        f"**Macro averages over {len(rows)} lemmas** "
        f"(mean base rate {m['mean_base_rate']:.3f}):",
        "",
        f"- Semantic: P@10 {m['semantic']['p10']:.3f}, P@25 {m['semantic']['p25']:.3f}, R@50 {m['semantic']['r50']:.3f}",
        f"- Keyword: P@10 {m['keyword']['p10']:.3f}, P@25 {m['keyword']['p25']:.3f}, R@50 {m['keyword']['r50']:.3f}",
    ]
    (out_dir / "results.md").write_text("\n".join(md), encoding="utf-8")
    print("\nwrote results.json and results.md")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
