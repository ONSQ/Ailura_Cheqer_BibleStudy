# Cheqer

**Cheqer** (חֵקֶר, KHAY-ker: "searching out, deep inquiry") is a word-study Bible app built on open-licensed scholarly data, powered by [Ailura](https://ailura.net). Read in English, tap any word to see the Hebrew or Greek behind it, follow that word through every occurrence in Scripture, hear it pronounced, and see how the Septuagint, the Targum, Josephus, Philo, 1 Enoch, and other Second Temple writings carry the same idea.

> "It is the glory of God to conceal a matter, but the glory of kings is to search out a matter." (Proverbs 25:2)

**Live app:** https://cheqer-oweneskew-7242s-projects.vercel.app

## Using the app

### Reading

The **Reader** opens in Genesis 1 with the English text above the tagged original. The header controls, left to right:

- **‹ ›** step to the previous or next chapter (buttons also appear at the bottom of every chapter)
- **Book chip** (e.g. `Gen`) opens the book grid; picking a book opens the chapter grid, and picking a chapter opens a verse grid, so you can land on an exact verse in three taps. Each picker also has a **Go to reference** box: type `John 3:16`, `psalm 23:4`, or `1 cor 13` and press Go.
- **Version chip** (`BSB`) cycles the English translation: BSB → KJV → WEB → English off
- **Heb/Grk chip** hides or shows the original-language line

### Word study

Tap any English word in a verse. A sheet shows the original word behind it: root, gloss, morphology, and a syllable-by-syllable pronunciation with a 🔊 button that says it aloud. Tap the word again to open the full **Word Study** screen:

- **How translators render it**: every English gloss with counts
- **Sod · Word-study brief**: an AI-written summary tracing the word from the Torah through the prophets into the Septuagint, with a citation for every claim. Written once per word, then kept for everyone.
- **Sod · How the Septuagint renders it**: the Greek words the LXX translators chose for a Hebrew word; tap one to follow it into the Greek scriptures
- **Sod · Septuagint usage**: the same Greek word at work centuries before the NT
- **Sod · Second Temple usage**: passages in Josephus, Philo, 1 Enoch, Jubilees, and other period writings closest to the word's field of meaning, found by meaning rather than exact wording
- **Occurrences**: every tagged occurrence in Scripture; tap one to jump to that verse
- **Save study** keeps the word in your Studies tab

### Asking questions

- **Tap a verse** to open it in a sheet, add neighboring verses if you want a passage, and ask anything in plain English: "what is it really saying here?", "what are the themes?", "how does this connect with the rest of Scripture?", "how would this apply to me?" Answers are grounded in the passage's own words and witnesses, never in the model's memory, and every reference is tappable.
- **Ask ✨** in the header opens the general question box: "where does Scripture talk about the sons of God?" The answer comes back with the verses it found and the Hebrew/Greek words behind them.
- Both can draw on the Second Temple writings when the question touches that world. Those sources are always named ("Josephus writes...") and never treated as Scripture.
- **Save note** and **Share** under every answer keep it in your Studies tab or send it to the group.

### Library

The **Library** tab holds the period writings as readable books: Josephus (Antiquities, Jewish War, Life, Against Apion), all thirty-one works of Philo, and the Second Temple collection (1 Enoch, Jubilees, the Testaments of the Twelve Patriarchs, Ben Sira, Maccabees, the Letter of Aristeas, and more). Everything is in English with a Show original toggle where Greek or Hebrew is loaded. These are period witnesses, not Scripture, and the app labels them that way.

### Studies

The **Shared Studies** tab needs a sign-in (email and password). Saved word studies and notes live here; each note can be edited, built up over time, and either kept private or shared with the whole group. Tapping a study's reference jumps back to the verse or word it came from.

### Settings

**About** (top right of the Reader) has the appearance switch (Auto follows your device's light/dark setting), pronunciation-voice guidance for computers, and data credits.

## What is here

| Path | Purpose |
|---|---|
| `schema.sql` | Supabase Postgres schema: word tokens, lexemes, translations, period documents with pgvector, shared word studies, and the retrieval/library RPCs |
| `ingest/ingest_stepbible.py` | Parses STEPBible TAHOT (Hebrew OT) and TAGNT (Greek NT) into SQLite or Postgres |
| `ingest/ingest_helloao.py` | Imports translation text (BSB, KJV, WEB) from the helloao Free Use Bible API |
| `ingest/ingest_lxx.py` | Tagged Septuagint (CenterBLC, Rahlfs 1935) into period_docs |
| `ingest/ingest_targum.py` | Targum Onkelos via the Sefaria API |
| `ingest/ingest_josephus.py` | Josephus from Perseus TEI: Greek with Whiston's English |
| `ingest/ingest_philo.py` | Philo from First1KGreek: Cohn's Greek with Yonge's English |
| `ingest/ingest_apocrypha.py` | Second Temple works via the Sefaria API |
| `ingest/ingest_enoch.py` | 1 Enoch (Charles 1917) via Wikisource |
| `ingest/ingest_witness_en.py` | English under the witnesses: Brenton LXX and Etheridge Targum |
| `ingest/embed_period.py` | Batch-embeds period passages for semantic retrieval |
| `app/` | Expo React Native app (TypeScript, expo-router, React Query) |
| `supabase/functions/` | Edge functions: ask, ask-verse, sod-brief, sod-search |
| `tools/dev_server.py` | Local API bridge serving `wordstudy.db` during development |

## Data sources and licenses

| Source | Content | License | Status |
|---|---|---|---|
| STEPBible TAHOT/TAGNT | Tagged Hebrew OT + Greek NT | CC BY 4.0 | Loaded |
| helloao Free Use Bible API | BSB, KJV, WEB English text | Free use / public domain | Loaded |
| CenterBLC LXX (Rahlfs 1935) | Tagged Septuagint | MIT | Loaded |
| Sefaria | Targum Onkelos, Second Temple apocrypha | Public domain versions | Loaded |
| Perseus Digital Library | Josephus, Greek + Whiston English | CC BY-SA 4.0 | Loaded |
| OpenGreekAndLatin First1KGreek | Philo, Greek + Yonge English | CC BY-SA 4.0 | Loaded |
| Wikisource (Charles 1917) | 1 Enoch | Public domain | Loaded |
| ETCBC DSS | Dead Sea Scrolls transcriptions | CC BY-NC 4.0 | Planned; non-commercial only, kept isolated |

Original-language tagging data is from [Tyndale House, Cambridge](https://www.TyndaleHouse.com) and [STEP Bible](https://www.STEPBible.org), licensed CC BY 4.0. This repo does not redistribute their raw data files; the ingest script clones them from the [STEPBible-Data repo](https://github.com/STEPBible/STEPBible-Data).

## Architecture

```
Expo React Native app (web today; Android/iOS from the same codebase)
        |
Supabase: Postgres + pgvector + Auth + Row Level Security + edge functions
        |
  ol_words / lexemes   <- STEPBible tagging (425k tokens, 13.6k lexemes)
  translations         <- helloao (BSB, KJV, WEB)
  period_docs          <- LXX, Targum, Josephus, Philo, Second Temple (43k passages, embedded)
  word_studies         <- group notes behind Auth + RLS
  edge functions       <- Claude for grounded answers and briefs; OpenAI embeddings for retrieval
```

The AI layers follow one rule: no claim without a retrievable citation. Hybrid retrieval uses exact lemma matching where tagging exists (OT, NT, LXX, Targum) and semantic search over embeddings where it does not (Josephus, Philo, Second Temple). Briefs and answers are written from retrieved passages only.

## Remaining roadmap

- Android build via EAS internal testing for the group, then iOS/TestFlight
- Dead Sea Scrolls (ETCBC, non-commercial) into period_docs
- Evaluation harness (UTSA independent study): precision/recall of semantic retrieval vs. concordance baseline over a gold-standard lemma set

## UTSA independent study framing

The defensible research question is retrieval, not app-building: how well does embedding-based semantic retrieval surface diachronically related usages of a lemma across MT, LXX, DSS, and Second Temple corpora, compared against exact concordance lookup as the baseline? Deliverables map cleanly: literature review (biblical NLP, MACULA, Text-Fabric ecosystem), a gold-standard evaluation set of 20-30 lemmas with expert-verified related passages, precision/recall comparison of retrieval strategies, and the app as the working artifact. Budget is near zero: all data is free, Supabase free tier holds it, and embedding the whole period corpus cost about fifteen cents.

## Quick start (developers)

```bash
# 1. Get the data (sparse clone keeps it to ~100MB)
git clone --depth 1 --filter=blob:none --sparse https://github.com/STEPBible/STEPBible-Data.git data/STEPBible-Data
cd data/STEPBible-Data && git sparse-checkout set --no-cone "/Translators Amalgamated OT+NT" && cd ../..

# 2. Build the local database
python3 ingest/ingest_stepbible.py --data-dir "data/STEPBible-Data/Translators Amalgamated OT+NT" --sqlite wordstudy.db

# 3. Add English text
python3 ingest/ingest_helloao.py --sqlite wordstudy.db
python3 ingest/ingest_helloao.py --sqlite wordstudy.db --version eng_kjv --as KJV
python3 ingest/ingest_helloao.py --sqlite wordstudy.db --version ENGWEBP --as WEB

# 4. Period witnesses (each script prints its own source setup)
python3 ingest/ingest_josephus.py
python3 ingest/ingest_philo.py
python3 ingest/ingest_apocrypha.py
python3 ingest/ingest_enoch.py

# 5. Run the app against the local database
python3 tools/dev_server.py            # serves wordstudy.db on :8787
cd app && npm install && npm run web   # or npm start for a device

# To run against Supabase instead, set in app/.env:
#   EXPO_PUBLIC_SUPABASE_URL=...
#   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Verified queries against the built database: H0430 (elohim) returns 2,246 occurrences with pointed Hebrew and transliteration; G3056 (logos) returns 332 occurrences with per-gloss counts; John 1:1 renders as a complete interlinear with Robinson morphology codes.
