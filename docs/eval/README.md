# Retrieval evaluation (AI layer 4)

The research question, per the independent-study framing: how well does
embedding-based semantic retrieval surface passages that use a given
lemma, compared against concordance-style lookup as the baseline?

## Design

The tagged Septuagint doubles as an automatic gold standard. Every LXX
passage in `period_docs` carries the Strong's numbers of its words, so
for a test lemma g the relevant set is exactly the passages whose
tagging contains g. Both retrieval systems run blind to the tags:

- **Semantic**: the lexeme's semantic field (lemma plus its distinct
  gloss senses, the same recipe the production `sod-search` function
  uses) is embedded with `text-embedding-3-small` and LXX passages are
  ranked by cosine distance over pgvector.
- **Keyword**: LXX passages are ranked by how many of the lemma's gloss
  terms appear in their English translation. This models what a
  careful reader with a concordance and no tagging could do.
- **Random floor**: expected precision equals the lemma's base rate
  (relevant passages over 29,659 LXX passages), computed analytically.

Test set: 25 Greek lemmas across frequency bands (from ~40 to ~7,000
tagged passages) and semantic domains: theological abstractions
(righteousness, grace, covenant), concrete cultic terms (sacrifice,
priest, bread), persons (king, angel, shepherd), and nature/body terms
(water, light, heart). Listed with rationale in `eval_retrieval.py`.

Metrics: precision@10, precision@25, recall@50 per lemma; macro
averages across lemmas; lift of P@10 over the random base rate.

## Honest limitations

- The gold standard is surface occurrence: a passage can concern a
  concept without using the word (missed by the standard) or use the
  word incidentally (counted as relevant). Occurrence is still the
  right target for the concordance-replacement question, and it is the
  only standard available at this scale without expert annotation.
- The semantic field is built from English glosses, which favors the
  keyword baseline slightly: both systems draw on the same gloss
  vocabulary.
- One embedding model so far. The harness isolates the model behind
  one function; comparing a second model (e.g. text-embedding-3-large
  or a multilingual model over the Greek text itself) is a planned
  extension.

## Reproducing

```bash
export OPENAI_API_KEY=sk-...
python docs/eval/eval_retrieval.py
```

Requires only the app's public anon key (already in the script) and an
OpenAI key for the 25 query embeddings (fractions of a cent). Results
land in `results.json` and `results.md` beside the script. The three
`eval_*` RPCs it calls are defined in `schema.sql` and are read-only
over world-readable data.
