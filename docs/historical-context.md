# Historical context: sources and phase plan

How Cheqer gains historical context: who a person is, where a place is,
when a passage sits in history, and what the surrounding world looked
like. Everything below is openly licensed and joins onto data structures
the app already has.

## Ground rule (Owen, 2026-08-21): no interpretive commentary

Cheqer shows evidence, not opinion. Sources must be one of: linguistic
data (tags, glosses, morphology), primary sources clearly attributed to
their era (Josephus, Philo, LXX...), structured curated facts (TIPNR
family/refs/coordinates), or auditable synthesis under the sod-brief
rule (written only from retrieved passages, a citation per claim,
labeled AI). Modern editorial commentary fails this test. Consequences:

- Tyndale Open Study Notes are OUT (formerly phase B). They are the NLT
  Study Bible apparatus: an editorial voice explaining what passages
  mean. Well made, but there is no citation trail to audit.
- The AI-written TIPNR description fields (@Brief/@Short/@Article) are
  not ingested or displayed; only TIPNR's curated structure ships.
- If the Theographic timeline is ever added, it shows relative sequence
  and named periods only, never asserted year dates (chronology is
  itself contested interpretation).

## Sources

| Source | Content | License | Join key |
|---|---|---|---|
| STEPBible TIPNR | ~4,200 disambiguated people/places/other with family trees, exhaustive refs, place coordinates | CC BY 4.0 | dStrongs -> ol_words.dstrongs |
| Tyndale Open Study Notes | Verse-level study notes, book intros, ~200 profiles, theme articles, Bible Dictionary (NLT Study Bible apparatus) | CC BY-SA 4.0 | verse refs |
| OpenBible.info Geocoding | ancient/modern/geometry JSONL for every place in the Protestant Bible | CC BY 4.0 | place names (TIPNR geo is derived from it) |
| Theographic Bible Metadata | Knowledge graph: periods and dated events tied to passages | CC BY-SA 4.0 | verse refs |
| Easton's + Smith's dictionaries | ~6,000 public-domain entries, structured JSON | Public domain | entry headword |

Notes:

- TIPNR lives in the same STEPBible-Data repo the word ingest already
  clones and carries the same attribution we already show (Tyndale House,
  Cambridge + STEPBible.org). Its `@Brief/@Short/@Article` descriptions
  were AI-written (Claude 3 Opus, April 2024, adapted by STEPBible);
  Cheqer stores them but the UI should label them as convenience
  summaries, not scholarship. The structured fields (family, refs,
  coordinates, tribe, type) are curated data.
- TIPNR place records embed OpenBible-derived lat/lng in their map URLs,
  so phase A alone gives us mappable places; the OpenBible JSONL is only
  needed later for regions/rivers geometry and photos.
- Tyndale Open Study Notes and Theographic are Share-Alike. Fine for a
  free ministry app; any derivative dataset built from them must remain
  CC BY-SA. Keep their ingests isolated the same way the ETCBC DSS data
  is, and add their attributions to the About screen when they ship.
- STEPBible asks that we not redistribute their raw files; the ingest
  downloads from their repo at run time (same rule as phase 1).

## Phases

A. **TIPNR ingest + entity layer** (shipped 2026-08-21). `entities`,
   `entity_names`, `entity_refs`, `entity_links` tables; verse-anchored
   RPCs; entity chips on the word sheet, Who & where on Word Study, and
   the /entity/[ustrong] card. Curated structure only (see ground rule).
B. ~~Tyndale Open Study Notes~~ — dropped per the ground rule above.
C. **Theographic periods/events** (optional): relative-sequence
   timeline only, no asserted dates. Low priority.
D. **Grounded historical brief** (sod-brief pattern): retrieve
   period_docs witnesses for a passage, synthesize with citations,
   cache per chapter. Sod synergy: entity cards for NT-era figures
   (Herod, Pilate) can pull Josephus passages through the existing
   semantic_period_search.
E. **Entity-retrieval eval** (UTSA): TIPNR refs as ground truth for
   whether semantic search recovers passages about a person in the
   untagged corpora; entity-alias query expansion vs plain semantic
   field. Reuses the docs/eval/ harness.

## TIPNR format notes (for the ingest)

One file: `Proper Nouns/TIPNR - Translators Individualised Proper Names
with all References - STEPBible.org CC BY.txt`. Records separated by
`$========== PERSON(s)|PLACE|OTHER` lines. Top line is the individual
(tab-separated; layout differs per kind), then one `– <Significance>`
line per name form carrying `dStrong«eStrong=original-script form`, the
ESV/KJV/NIV renderings, and an exhaustive ref list, then a `– Total`
line and `@Briefest/@Brief/@Short/@Article` description lines.

- uStrong uniquely identifies the individual (it is the dStrong of
  their most common name form); dStrong joins ol_words.dstrongs.
- Refs like `Exo.7.10a` mark multiple hits in one verse (suffix
  dropped); refs prefixed `LXX` exist only in the Septuagint (skipped).
- Place coordinates parse out of the Google Maps URL
  (`@lat,lng,zoom`); `@0,` or a single number means unlocated.
- `>` appears as a continuation marker in some fields; treat as empty.
