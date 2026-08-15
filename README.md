# Cheqer

**Cheqer** (חֵקֶר, KHAY-ker: "searching out, deep inquiry") is a word-study Bible app built on open-licensed scholarly data, powered by [Ailura](https://getailura.com). Tap a word, see its lemma, morphology, every occurrence, how translators render it, and (in later phases) how the LXX, Dead Sea Scrolls, and Second Temple literature use the same term.

> "It is the glory of God to conceal a matter, but the glory of kings is to search out a matter." (Proverbs 25:2)

## What is here now

| File | Purpose |
|---|---|
| `schema.sql` | Supabase Postgres schema: word tokens, lexemes, translations, period documents (with pgvector for RAG), and shared word studies for group use |
| `ingest/ingest_stepbible.py` | Parses STEPBible TAHOT (Hebrew OT) and TAGNT (Greek NT) into SQLite or Postgres |
| `app/` | Expo React Native app (TypeScript, expo-router, React Query): Reader with tappable words, Word Study with gloss distribution and occurrence list, Shared Studies stub |
| `tools/dev_server.py` | Local API bridge serving `wordstudy.db` to the app during development, no Supabase needed |

The build produces `wordstudy.db`, a local SQLite database with 425,454 word tokens and 13,616 lexemes covering the full OT and NT. It is not committed to this repo; build it with the quick start below.

Verified queries against the built database:

- H0430 (elohim): 2,246 occurrences, full reference list with pointed Hebrew and transliteration
- G3056 (logos): 332 occurrences with per-gloss counts (word, speech, saying, account...)
- John 1:1 renders as a complete interlinear with Robinson morphology codes

## Data sources and licenses

| Source | Content | License | Phase |
|---|---|---|---|
| STEPBible TAHOT/TAGNT | Tagged Hebrew OT + Greek NT, all major editions | CC BY 4.0 | Done |
| helloao Free Use Bible API | 1,250+ translations incl. public-domain BSB | Free use | 2 |
| OSHB lexicon / Abbott-Smith | BDB and Greek lexicon entries | Public domain | 2 |
| CenterBLC LXX (Rahlfs) | Tagged Septuagint | Check repo | 3 |
| Sefaria exports | Targumim, Mishnah, rabbinic texts | Mixed free licenses | 3 |
| Perseus | Josephus, Philo (Greek + English) | CC BY-SA | 3 |
| Online Critical Pseudepigrapha / Charles | 1 Enoch, Jubilees | Check per text | 3 |
| ETCBC DSS | Dead Sea Scrolls transcriptions | CC BY-NC 4.0 | 3 |

License note: everything above is fine for a free app shared with your group. The ETCBC Dead Sea Scrolls data is non-commercial only, so keep it out of any future paid product or isolate it behind a personal-use flag.

Original-language tagging data is from [Tyndale House, Cambridge](https://www.TyndaleHouse.com) and [STEP Bible](https://www.STEPBible.org), licensed CC BY 4.0. This repo does not redistribute their raw data files; the ingest script clones them from the [STEPBible-Data repo](https://github.com/STEPBible/STEPBible-Data).

## Architecture

```
Expo React Native app (Android first, then iOS via same codebase)
        |
Supabase (Postgres + pgvector + Auth + Row Level Security)
        |
  ol_words / lexemes  <- STEPBible (done)
  translations        <- helloao API import (phase 2)
  period_docs         <- LXX, DSS, Sefaria, Perseus, OCP (phase 3)
  word_studies        <- shared notes for the men's group (phase 2)
```

## Roadmap

**Phase 1 (done): the spine.** Run `schema.sql` in the Supabase SQL editor, then re-run the ingestion script with `--postgres` and your `DATABASE_URL`. Total data is ~425k rows, well within the Supabase free tier.

**Phase 2: the app.** Expo React Native. Three screens to start: reader (verse view with tappable words), word study (lemma, gloss distribution chart, occurrence list), and shared studies (group notes, gated by Supabase Auth with RLS so each man sees shared studies plus his own). Distribute the Android build to the group through Play internal testing or a direct APK from EAS Build. When it earns its keep, `eas build --platform ios` and TestFlight, no rewrite.

**Phase 3: period witnesses.** Ingest LXX first (it is tagged and joins to the same Strong's-adjacent lemma space), then Sefaria Targumim, then Perseus Josephus/Philo and the Pseudepigrapha as plain text with embeddings in `period_docs`. The word-study screen gains a "Second Temple usage" panel powered by hybrid retrieval: exact lemma match where tagging exists, semantic search where it does not.

**Phase 4: the AI layer.** RAG over `period_docs` with citations back to source texts. A word study for *ruach* would pull Ezekiel's usage cluster, Qumran's spirit dualism in 1QS, and Philo's pneuma passages, each linked to its witness.

## UTSA independent study framing

The defensible research question is retrieval, not app-building: how well does embedding-based semantic retrieval surface diachronically related usages of a lemma across MT, LXX, DSS, and Second Temple corpora, compared against exact concordance lookup as the baseline? Deliverables map cleanly: literature review (biblical NLP, MACULA, Text-Fabric ecosystem), a gold-standard evaluation set of 20-30 lemmas with expert-verified related passages, precision/recall comparison of retrieval strategies, and the app as the working artifact. Budget is near zero: all data is free, Supabase free tier holds it, and embedding costs for the period corpus run a few dollars.

## Quick start

```bash
# 1. Get the data (sparse clone keeps it to ~100MB)
git clone --depth 1 --filter=blob:none --sparse https://github.com/STEPBible/STEPBible-Data.git data/STEPBible-Data
cd data/STEPBible-Data && git sparse-checkout set --no-cone "/Translators Amalgamated OT+NT" && cd ../..

# 2. Build locally
python3 ingest/ingest_stepbible.py --data-dir "data/STEPBible-Data/Translators Amalgamated OT+NT" --sqlite wordstudy.db

# 3. Or load Supabase directly
#    (run schema.sql in the Supabase SQL editor first)
export DATABASE_URL="postgresql://postgres:...@db.<project>.supabase.co:5432/postgres"
pip install psycopg2-binary
python3 ingest/ingest_stepbible.py --data-dir "data/STEPBible-Data/Translators Amalgamated OT+NT" --postgres

# 4. Run the app against the local database
python3 tools/dev_server.py            # serves wordstudy.db on :8787
cd app && npm install && npm run web   # or npm start for a device

# To run against Supabase instead, set in app/.env:
#   EXPO_PUBLIC_SUPABASE_URL=...
#   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```
