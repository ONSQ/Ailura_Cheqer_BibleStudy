# CLAUDE.md — Cheqer

## What this project is

Cheqer (חֵקֶר, KHAY-ker: "searching out, deep inquiry") is a free word-study Bible app for anyone, powered by Ailura. It began with a men's church group; the public app, its store listings, and the AI prompts speak to every reader, so no user-facing text or prompt should mention the group. Tap any word in the biblical text and see its original Hebrew or Greek lemma, morphology, every occurrence across Scripture, how translators render it, and (later phases) how the Septuagint, Dead Sea Scrolls, and Second Temple literature use the same term. Owner: Owen Eskew (github.com/ONSQ). This may also become a UTSA independent study on cross-corpus lemma retrieval.

## Branding

- App name: **Cheqer** (full name "Cheqer Word Study Bible" on both store listings and wherever the app needs its long name; a word study of the Bible, which is what sets it apart from general Bible apps)
- Byline: "powered by Ailura" (About screen, splash, store listings; link ailura.net)
- Tagline: Proverbs 25:2 — "It is the glory of God to conceal a matter, but the glory of kings is to search out a matter."
- The Phase 3/4 period-witness panel is named **Sod** (the deeper counsel: Jer 23:18, Ps 25:14)
- Responsible party: ONSQ Enterprises, contact onsq@onsq.net. Use these on the privacy policy (`app/src/lib/links.ts`), the store listings, and anywhere the app must name who answers for it.
- Keep Ailura as byline branding only. The app itself is a free ministry/personal project; this matters for the ETCBC non-commercial data constraint below.
- Identifiers: Android package and iOS bundle `net.onsq.cheqer`, Expo slug `cheqer`, EAS owner `onsq27`
- Logo: the gold Q emblem and the "Cheqer" wordmark. Masters live in `app/assets/brand/`; every icon, the splash image, the favicon, and the in-app logos are derived from them by `python tools/make_brand_assets.py` (re-run it after changing a master, never edit the derived PNGs by hand). The wordmark's letters are navy, so dark surfaces use the reversed cut (`BrandHeader` in `app/src/components/brand.tsx` picks it).

## Current state

Phase 1 is complete and verified:
- `schema.sql` — Postgres schema for Supabase (word tokens, lexemes, translations, period_docs with pgvector, shared word_studies)
- `ingest/ingest_stepbible.py` — parses STEPBible TAHOT (Hebrew OT) and TAGNT (Greek NT) into SQLite or Postgres
- Verified locally: 447,748 word tokens, 13,940 lexemes. H0430 elohim returns 2,603 occurrences; John 1:1 renders as a full interlinear with Robinson morphology.

## Architecture

```
Expo React Native app (Android first via EAS internal testing, iOS/TestFlight later, same codebase)
        |
Supabase: Postgres + pgvector + Auth + Row Level Security
        |
  ol_words / lexemes   <- STEPBible TAHOT/TAGNT (done)
  translations         <- helloao Free Use Bible API import (phase 2)
  period_docs          <- LXX, Sefaria, Perseus, Pseudepigrapha, DSS (phase 3)
  word_studies         <- readers' notes, RLS: each user sees published + own (phase 2)
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
3. RLS on word_studies: owner can CRUD own rows; signed-in users can read rows where is_shared = true. No public access.
4. Keep the ingestion scripts idempotent (safe to re-run: truncate-and-load or upsert).
5. Support: buymeacoffee.com/ONSQ (About screen only; shown as a prominent button near the top at Owen's request; never gate any content or feature behind it, especially anything touching the CC BY-NC Dead Sea Scrolls data).

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

# Proper-name entities (who/where cards; docs/historical-context.md)
mkdir -p data/TIPNR
curl -sL -o data/TIPNR/TIPNR.txt "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Proper%20Nouns/TIPNR%20-%20Translators%20Individualised%20Proper%20Names%20with%20all%20References%20-%20STEPBible.org%20CC%20BY.txt"
python3 ingest/ingest_tipnr.py --file data/TIPNR/TIPNR.txt --sqlite wordstudy.db

# LXX verse alignment (after ingest_stepbible.py and ingest_lxx.py; then
# run "select rebuild_lxx_equivalents();" on Supabase once it is loaded)
python3 ingest/build_lxx_map.py --sqlite wordstudy.db

# Load Supabase (run schema.sql in Supabase SQL editor first)
export DATABASE_URL="postgresql://postgres:...@db.<project>.supabase.co:5432/postgres"
python3 ingest/ingest_stepbible.py --data-dir "data/STEPBible-Data/Translators Amalgamated OT+NT" --postgres

# App (once scaffolded)
cd app && npx expo start
eas build --platform android --profile preview   # APK testers can install from a link
eas build --platform ios --profile production && eas submit --platform ios   # TestFlight
eas update --channel production --environment production --message "..."     # OTA: JS-only changes, no rebuild
```

## Releases (read before shipping a change to phones)

- JS-only change (screens, text, logic): publish with `eas update` on the `production` channel. No build, no store upload.
- Native change (new Expo library, icon, splash, permissions, anything in `app.json` that affects the binary): bump `version` in `app/app.json`, then build and upload to both stores. The runtime version follows `version` (`appVersion` policy), so skipping the bump would send new JS to old binaries that cannot run it.
- iOS submissions need the App Store Connect key file; EAS has no stored key. Android uploads to Play are manual until a Play service-account key is added.

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

- `select count(*) from ol_words;` expect ~448k
- `select occurrences from lexemes where strongs='H0430';` expect ~2,603
- `select count(distinct chapter) from ol_words where book='Psa';` expect 150 (dual-versification refs like Psa.18.1(18.2) must not be dropped)
- John 1:1 should return 17 word rows ordered by word_num
- G3056 top gloss should be "word"
- `tools/accuracy_checks.sql` runs these and the rest (lexeme definitions, English/original verse alignment, LXX and Targum verse alignment) in one read-only query; every row should come back `ok = true`. Run it before each release.

## Versification (read before touching refs)

- ol_words and translations use English verse refs. TAHOT gives the Hebrew ref in round brackets and TAGNT the KJV ref in square brackets where they differ.
- Targum Onkelos follows the Hebrew numbering; the LXX follows Rahlfs. Never join a witness on the English ref: go through `witness_refs()`, which reads `verse_map` (Hebrew refs) and `lxx_verse_map` (LXX refs, built by `ingest/build_lxx_map.py`).
- Words numbered WWXX in TAHOT (LXX additions, restored text) are inserted after word WW; the ingest renumbers the verse so every word has its own slot in reading order.

## Editions (read before touching counts)

- TAHOT and TAGNT are amalgamated: they carry every word a major translation renders, including Greek words absent from NA28 and Hebrew words supplied from the LXX. `word_variant()` in schema.sql is the one rule for which words those are. The Reader brackets them, the word sheet names the editions, and occurrence counts show the base-text figure beside the total ("992 occurrences (915 in NA28)"). Do not filter them out of counts or text silently.
- Brenton's English is aligned to the Greek LXX rows by `ingest/ingest_witness_en.py` before it is attached; his verse numbers differ from Rahlfs in places.
