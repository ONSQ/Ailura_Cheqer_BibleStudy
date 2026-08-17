# CLAUDE.md — Cheqer

## What this project is

Cheqer (חֵקֶר, KHAY-ker: "searching out, deep inquiry") is a word-study Bible app for personal discipleship and a men's church group, powered by Ailura. Tap any word in the biblical text and see its original Hebrew or Greek lemma, morphology, every occurrence across Scripture, how translators render it, and (later phases) how the Septuagint, Dead Sea Scrolls, and Second Temple literature use the same term. Owner: Owen Eskew (github.com/ONSQ). This may also become a UTSA independent study on cross-corpus lemma retrieval.

## Branding

- App name: **Cheqer** (display as "Cheqer Bible Study" where context needs it)
- Byline: "powered by Ailura" (About screen, splash, store listings; link ailura.net)
- Tagline: Proverbs 25:2 — "It is the glory of God to conceal a matter, but the glory of kings is to search out a matter."
- The Phase 3/4 period-witness panel is named **Sod** (the deeper counsel: Jer 23:18, Ps 25:14)
- Keep Ailura as byline branding only. The app itself is a free ministry/personal project; this matters for the ETCBC non-commercial data constraint below.
- Suggested identifiers: repo `ONSQ/cheqer`, Android package `net.onsq.cheqer` (or `com.getailura.cheqer`), Expo slug `cheqer`

## Current state

Phase 1 is complete and verified:
- `schema.sql` — Postgres schema for Supabase (word tokens, lexemes, translations, period_docs with pgvector, shared word_studies)
- `ingest/ingest_stepbible.py` — parses STEPBible TAHOT (Hebrew OT) and TAGNT (Greek NT) into SQLite or Postgres
- Verified locally: 425,454 word tokens, 13,616 lexemes. H0430 elohim returns 2,246 occurrences; John 1:1 renders as a full interlinear with Robinson morphology.

## Architecture

```
Expo React Native app (Android first via EAS internal testing, iOS/TestFlight later, same codebase)
        |
Supabase: Postgres + pgvector + Auth + Row Level Security
        |
  ol_words / lexemes   <- STEPBible TAHOT/TAGNT (done)
  translations         <- helloao Free Use Bible API import (phase 2)
  period_docs          <- LXX, Sefaria, Perseus, Pseudepigrapha, DSS (phase 3)
  word_studies         <- shared group notes, RLS: each user sees shared + own (phase 2)
```

## AI architecture

The AI layers in Cheqer, in build order:

1. Semantic retrieval over untagged corpora (Phase 3). The OT/NT are
   exhaustively tagged, so lemma lookup there is deterministic SQL. The period
   witnesses (Josephus, Philo, Pseudepigrapha, some DSS material) have no
   Strong's tags and no join key. Solution: embed every passage in period_docs
   (the vector(1536) pgvector column), embed the semantic field of the lemma
   under study, and retrieve conceptually related passages across languages.
   Hybrid retrieval rule: exact lemma match wherever tagging exists, semantic
   search where it does not, merged and deduplicated.

2. Grounded synthesis (Phase 4). An LLM writes the word-study brief (usage
   development from Torah to prophets to Qumran to NT) strictly from retrieved
   passages, with a citation for every claim linking back to the source row in
   period_docs or ol_words. No claim without a retrievable citation. This is
   theological content: the model summarizes witnesses, it never generates
   doctrine from its own weights.

3. Natural-language front door (Phase 4). Users ask questions ("where does
   Scripture talk about the sons of God?"); an LLM maps the question to lemma
   sets + retrieval queries. Users never need to know Strong's numbers.

4. Evaluation harness (UTSA independent study). Gold standard: scholarly
   cross-reference sets (e.g., NA28 loci citati, lexicon article citations)
   define which period passages relate to a given lemma. Measure precision and
   recall of embedding retrieval vs. lemma-match baseline vs. hybrid, across
   20-30 test lemmas. Compare at least two embedding models for Koine Greek
   and Biblical Hebrew coverage. Keep eval code in docs/eval/ so results are
   reproducible.

## Roadmap

- Phase 1 (done): data spine, ingestion, schema.
- Phase 2 (current): Expo React Native app with three screens: Reader (verse view, tappable words), Word Study (lemma header, gloss distribution, occurrence list with jump-to-verse), Shared Studies (group notes behind Supabase Auth). Plus a translations importer from the helloao API (BSB is public domain, use it as default English text).
- Phase 3: period witnesses. Ingest CenterBLC LXX first (tagged, joins on lemma space), then Sefaria Targumim, Perseus Josephus/Philo, Online Critical Pseudepigrapha texts into period_docs with embeddings.
- Phase 4: RAG panel on the word-study screen ("Second Temple usage") with citations back to each witness. Hybrid retrieval: exact lemma match where tagging exists, semantic search where it does not.

## Hard constraints (do not violate)

1. LICENSING. STEPBible data is CC BY 4.0: credit "Tyndale House, Cambridge" (www.TyndaleHouse.com) and "STEP Bible" (www.STEPBible.org) in the app's About screen and README. Do not commit or redistribute their raw data files; the ingest script clones from their repo. ETCBC Dead Sea Scrolls data is CC BY-NC 4.0: personal/free use only, keep it isolated so it can be excluded from any future commercial build. Never commit wordstudy.db.
2. Never commit .env, Supabase service keys, or DATABASE_URL. Client app uses the anon key + RLS only.
3. RLS on word_studies: owner can CRUD own rows; group members can read rows where is_shared = true. No public access.
4. Keep the ingestion scripts idempotent (safe to re-run: truncate-and-load or upsert).
5. Support: buymeacoffee.com/ONSQ (About screen only, alongside the Tyndale House / STEP Bible attribution; never gate any content or feature behind it, especially anything touching the CC BY-NC Dead Sea Scrolls data).

## Conventions

- Python 3.11+, no heavy frameworks for ingestion (stdlib + psycopg2 only where possible).
- App: Expo (managed workflow), TypeScript, expo-router, @supabase/supabase-js. State: keep it simple (React Query for server state).
- Book codes follow STEPBible 3-letter forms (Gen, Exo, Mat, Jhn, Rev).
- Strong's stored two ways: `strongs` simple zero-padded (H0430, G3056) for joins, `dstrongs` disambiguated (H0430G) for precision.
- Hebrew displays right-to-left; test Reader screen with both Gen 1 and Jhn 1.
- Writing style for docs: no em dashes, avoid the words substantial, significant, robust, elegant, leverage, utilize, demonstrate, showcase, highlight, underscore. No "Furthermore/Moreover/Critically" openers.

## Commands

```bash
# Rebuild local test database
git clone --depth 1 --filter=blob:none --sparse https://github.com/STEPBible/STEPBible-Data.git data/STEPBible-Data
cd data/STEPBible-Data && git sparse-checkout set --no-cone "/Translators Amalgamated OT+NT" && cd ../..
python3 ingest/ingest_stepbible.py --data-dir "data/STEPBible-Data/Translators Amalgamated OT+NT" --sqlite wordstudy.db

# Load Supabase (run schema.sql in Supabase SQL editor first)
export DATABASE_URL="postgresql://postgres:...@db.<project>.supabase.co:5432/postgres"
python3 ingest/ingest_stepbible.py --data-dir "data/STEPBible-Data/Translators Amalgamated OT+NT" --postgres

# App (once scaffolded)
cd app && npx expo start
eas build --platform android --profile preview   # APK for the men's group
```

## Repo layout

```
cheqer/
├── CLAUDE.md
├── README.md
├── schema.sql
├── .gitignore          # wordstudy.db, data/, .env, *.pyc, node_modules/
├── ingest/
│   └── ingest_stepbible.py
├── app/                # Expo app (phase 2)
└── docs/               # UTSA proposal, eval design
```

## Verification queries (sanity checks after any ingestion change)

- `select count(*) from ol_words;` expect ~425k
- `select occurrences from lexemes where strongs='H0430';` expect ~2,246
- John 1:1 should return 17 word rows ordered by word_num
- G3056 top gloss should be "word"
