-- =============================================================
-- Word Study Spine: Supabase schema
-- Source data: STEPBible TAHOT + TAGNT (CC BY 4.0, Tyndale House)
-- Attribution required: "Tyndale House, Cambridge" (TyndaleHouse.com)
-- and "STEP Bible" (STEPBible.org)
-- =============================================================

-- pgvector for period_docs embeddings (Phase 3/4 RAG)
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- One row per original-language word token (Hebrew OT + Greek NT)
create table if not exists ol_words (
    id            bigserial primary key,
    corpus        text not null check (corpus in ('OT','NT')),
    book          text not null,          -- e.g. 'Gen', 'Mat'
    chapter       int  not null,
    verse         int  not null,
    word_num      int  not null,          -- position within verse
    source_tag    text,                   -- TAHOT text type (L/Q/K/R/X) or TAGNT editions (NKO etc.)
    surface       text not null,          -- pointed Hebrew / accented Greek as written
    translit      text,
    gloss         text,                   -- context-sensitive English gloss
    strongs       text,                   -- simple Strong's, zero-padded (H0430, G3056)
    dstrongs      text,                   -- disambiguated Strong's (H0430G)
    dstrongs_raw  text,                   -- full multi-tag string incl. prefixes/suffixes
    lemma         text,                   -- dictionary form (Greek only in TAGNT; Hebrew via lexeme table)
    morph         text,                   -- ETCBC-based (Heb) / Robinson-based (Grk) morphology code
    editions      text,                   -- Greek: which editions contain the word (NA28,TR,Byz...)
    unique (corpus, book, chapter, verse, word_num, source_tag)
);

create index if not exists idx_ol_words_strongs  on ol_words (strongs);
create index if not exists idx_ol_words_dstrongs on ol_words (dstrongs);
create index if not exists idx_ol_words_ref      on ol_words (book, chapter, verse);
create index if not exists idx_ol_words_lemma    on ol_words (lemma);

-- One row per lexeme (aggregated during ingestion)
create table if not exists lexemes (
    strongs      text primary key,        -- H0430, G3056
    language     text not null check (language in ('heb','grk','arc')),
    lemma        text,                    -- אֱלֹהִים / λόγος
    gloss        text,                    -- short definition
    occurrences  int default 0
);

-- English (and future) translations, verse-per-row
create table if not exists translations (
    id       bigserial primary key,
    version  text not null,               -- 'BSB', 'KJV', 'WEB', ...
    book     text not null,
    chapter  int not null,
    verse    int not null,
    text     text not null,
    unique (version, book, chapter, verse)
);
create index if not exists idx_translations_ref on translations (book, chapter, verse);

-- Period documents (DSS, LXX, Pseudepigrapha, Josephus, Philo, Targumim...)
create table if not exists period_docs (
    id        bigserial primary key,
    corpus    text not null,              -- 'DSS', 'LXX', 'OTP', 'Josephus', 'Philo', 'Sefaria'
    work      text not null,              -- '1QS', '1 Enoch', 'Antiquities'
    ref       text not null,              -- native reference (col/line, chapter.verse)
    language  text,
    content   text not null,
    license   text,                       -- track per-source licensing (e.g. CC BY-NC for ETCBC DSS)
    strongs   text[],                     -- exact-match arm of hybrid retrieval (tagged corpora)
    lemmas    text[],
    embedding vector(1536)                -- pgvector, for RAG over period witnesses
);
create index if not exists idx_period_docs_work on period_docs (corpus, work);
create index if not exists idx_period_docs_strongs on period_docs using gin (strongs);
create unique index if not exists idx_period_docs_key on period_docs (corpus, work, ref);

-- Period-witness hits for a Strong's number (Sod panel), as one JSON value.
create or replace function period_usage(p_strongs text, p_limit int, p_offset int)
returns jsonb
language sql stable
set search_path = public
as $$
    with hits as (
        select id, corpus, work, ref, language, content
        from period_docs
        where strongs @> array[p_strongs]
        order by id
        limit p_limit offset p_offset
    )
    select jsonb_build_object(
        'total', (select count(*) from period_docs where strongs @> array[p_strongs]),
        'rows', coalesce((select jsonb_agg(to_jsonb(h)) from hits h), '[]'::jsonb)
    )
$$;

-- Group features (men's group layer, wired to Supabase auth later)
create table if not exists word_studies (
    id          bigserial primary key,
    owner       uuid,                     -- auth.users reference when auth is enabled
    strongs     text references lexemes (strongs),
    ref         text,                     -- passage anchor, e.g. 'Gen 1:2' or 'Gen 1:1-5'
    title       text,
    notes       text,
    is_shared   boolean default false,
    created_at  timestamptz default now()
);

-- App API helpers (queried by the Expo app through PostgREST).
-- security_invoker so the caller's RLS applies, not the view owner's.
create or replace view v_books with (security_invoker = on) as
select book, corpus, max(chapter) as chapters, min(id) as ord
from ol_words
group by book, corpus;

create or replace view v_versions with (security_invoker = on) as
select distinct version from translations;

create or replace function gloss_distribution(p_strongs text)
returns table (gloss text, count bigint)
language sql stable
set search_path = public
as $$
    select gloss, count(*)
    from ol_words
    where strongs = p_strongs and gloss is not null and gloss <> ''
    group by gloss
    order by count(*) desc
    limit 15
$$;

-- Whole chapter as one JSON value: PostgREST row caps do not apply,
-- and word order is preserved server-side.
create or replace function chapter_words(p_book text, p_chapter int)
returns jsonb
language sql stable
set search_path = public
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'verse', verse, 'word_num', word_num,
        'source_tag', source_tag, 'surface', surface, 'translit', translit,
        'gloss', gloss, 'strongs', strongs, 'morph', morph, 'corpus', corpus
    ) order by verse, word_num, id), '[]'::jsonb)
    from ol_words
    where book = p_book and chapter = p_chapter
$$;

-- Occurrence page in canonical book order with total count, as one JSON value.
create or replace function occurrences_page(p_strongs text, p_limit int, p_offset int)
returns jsonb
language sql stable
set search_path = public
as $$
    with ordered as (
        select book, chapter, verse, word_num, surface, translit, gloss
        from ol_words
        where strongs = p_strongs
        order by array_position(array[
            'Gen','Exo','Lev','Num','Deu','Jos','Jdg','Rut','1Sa','2Sa','1Ki','2Ki',
            '1Ch','2Ch','Ezr','Neh','Est','Job','Psa','Pro','Ecc','Sng','Isa','Jer',
            'Lam','Ezk','Dan','Hos','Jol','Amo','Oba','Jon','Mic','Nam','Hab','Zep',
            'Hag','Zec','Mal','Mat','Mrk','Luk','Jhn','Act','Rom','1Co','2Co','Gal',
            'Eph','Php','Col','1Th','2Th','1Ti','2Ti','Tit','Phm','Heb','Jas','1Pe',
            '2Pe','1Jn','2Jn','3Jn','Jud','Rev'], book), chapter, verse, word_num
        limit p_limit offset p_offset
    )
    select jsonb_build_object(
        'total', (select count(*) from ol_words where strongs = p_strongs),
        'rows', coalesce((select jsonb_agg(to_jsonb(o)) from ordered o), '[]'::jsonb)
    )
$$;

-- =============================================================
-- Hebrew -> LXX bridge (Phase 3). No external alignment data:
-- OT verses carry Hebrew Strong's, LXX verses carry Greek Strong's,
-- and they share versification. Verse-level co-occurrence recovers
-- translation equivalents; a lift filter (>= 2 vs corpus baseline)
-- keeps Greek function words from dominating. Rebuild lxx_equivalents
-- after reloading either corpus (see migration hebrew_lxx_bridge).
-- =============================================================

create table if not exists lxx_book_map (
    ot_book  text primary key,
    lxx_work text not null
);
-- Values: 38 OT books mapped (Neh omitted; LXX 2Esdras shifts chapters).
-- Psalms chapters remapped through lxx_ps_chapter() during the build.

-- lxx_equivalents (heb_strongs, grk_strongs, pair_count, share, lift):
-- materialized by the hebrew_lxx_bridge migration from ol_words x
-- period_docs. RLS: world-readable like the other text tables.

-- Top LXX renderings of a Hebrew lemma, with the Greek lexeme joined in.
create or replace function lxx_renderings(p_strongs text)
returns jsonb
language sql stable
set search_path = public
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'grk_strongs', e.grk_strongs,
        'lemma', l.lemma,
        'gloss', l.gloss,
        'pair_count', e.pair_count,
        'share', e.share,
        'lift', e.lift
    ) order by e.pair_count desc), '[]'::jsonb)
    from (
        select * from lxx_equivalents
        where heb_strongs = p_strongs
        order by pair_count desc
        limit 8
    ) e
    left join lexemes l on l.strongs = e.grk_strongs
$$;

-- Period witnesses for one MT verse: Targum Onkelos shares refs directly,
-- the LXX joins through the book map (with the psalm-chapter remap).
create or replace function verse_witnesses(p_book text, p_chapter int, p_verse int)
returns jsonb
language sql stable
set search_path = public
as $$
    with refs as (
        select 'Targum'::text as corpus, 'Onkelos ' || p_book as work,
               p_chapter || ':' || p_verse as ref
        union all
        select 'LXX', m.lxx_work,
               (case when p_book = 'Psa' then lxx_ps_chapter(p_chapter) else p_chapter end)
                 || ':' || p_verse
        from lxx_book_map m where m.ot_book = p_book
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'corpus', p.corpus, 'work', p.work, 'ref', p.ref,
        'language', p.language, 'content', p.content
    ) order by p.corpus), '[]'::jsonb)
    from period_docs p
    join refs r on p.corpus = r.corpus and p.work = r.work and p.ref = r.ref
$$;

-- =============================================================
-- Sod brief (Phase 4, layer 2): AI word-study synthesis, grounded
-- in retrieved passages with a citation per claim. Written only by
-- the sod-brief edge function (service role) using claude-opus-5;
-- one cached brief per lexeme, world-readable.
-- =============================================================

create table if not exists sod_briefs (
    strongs     text primary key references lexemes (strongs),
    brief       jsonb not null,
    model       text,
    created_at  timestamptz default now()
);
alter table sod_briefs enable row level security;
drop policy if exists sod_briefs_read on sod_briefs;
create policy sod_briefs_read on sod_briefs for select using (true);

-- Everything the brief writer needs, in one round trip. All content here is
-- retrievable-by-citation: MT refs, LXX refs, BSB text. (Full definition in
-- migration sod_brief_infrastructure; summarized here.)
-- study_bundle(p_strongs) returns jsonb with: lexeme, glosses, book_counts,
-- representative_verses (first occurrence per book + BSB text), and for
-- Hebrew lemmas lxx_renderings + sample LXX verses of the top equivalent,
-- for Greek lemmas the LXX verses of the lemma itself.

-- Reassembled verse text for quick interlinear display
create or replace view v_verse_interlinear with (security_invoker = on) as
select corpus, book, chapter, verse,
       string_agg(surface, ' ' order by word_num)                          as original_text,
       string_agg(coalesce(gloss,''), ' | ' order by word_num)             as gloss_line,
       array_agg(strongs order by word_num)                                as strongs_list
from ol_words
where source_tag is null or source_tag in ('L','Q','R','X') or corpus = 'NT'
group by corpus, book, chapter, verse;

-- =============================================================
-- Row Level Security
-- Text data is world-readable; writes happen only through the
-- service-role ingest scripts (which bypass RLS). word_studies:
-- owner CRUDs own rows, signed-in group members read shared rows,
-- no public access.
-- =============================================================

alter table ol_words      enable row level security;
alter table lexemes       enable row level security;
alter table translations  enable row level security;
alter table period_docs   enable row level security;
alter table word_studies  enable row level security;

drop policy if exists ol_words_read      on ol_words;
drop policy if exists lexemes_read       on lexemes;
drop policy if exists translations_read  on translations;
drop policy if exists period_docs_read   on period_docs;
create policy ol_words_read     on ol_words     for select using (true);
create policy lexemes_read      on lexemes      for select using (true);
create policy translations_read on translations for select using (true);
create policy period_docs_read  on period_docs  for select using (true);

alter table word_studies alter column owner set default auth.uid();

drop policy if exists word_studies_select on word_studies;
drop policy if exists word_studies_insert on word_studies;
drop policy if exists word_studies_update on word_studies;
drop policy if exists word_studies_delete on word_studies;
create policy word_studies_select on word_studies for select
    to authenticated
    using (owner = (select auth.uid()) or is_shared = true);
create policy word_studies_insert on word_studies for insert
    to authenticated
    with check (owner = (select auth.uid()));
create policy word_studies_update on word_studies for update
    to authenticated
    using (owner = (select auth.uid()))
    with check (owner = (select auth.uid()));
create policy word_studies_delete on word_studies for delete
    to authenticated
    using (owner = (select auth.uid()));

-- Semantic arm of hybrid retrieval: nearest period passages by embedding.
-- Exact-lemma matches stay with period_usage(); this covers untagged corpora
-- (Josephus, Philo, Second Temple apocrypha). plpgsql so ivfflat.probes can
-- be raised per call (the function SET clause is not permitted on Supabase).
create index if not exists idx_period_docs_embedding
  on period_docs using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 200);

create or replace function semantic_period_search(
  p_embedding extensions.vector(1536),
  p_corpora text[] default null,
  p_k int default 8
) returns jsonb
language plpgsql stable
as $$
begin
  perform set_config('ivfflat.probes', '12', true);
  return (
    select coalesce(jsonb_agg(row_json), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'corpus', corpus,
        'work', work,
        'ref', ref,
        'language', language,
        'content', left(content, 1200),
        'content_en', left(content_en, 1200),
        'similarity', round((1 - (embedding <=> p_embedding))::numeric, 4)
      ) as row_json
      from period_docs
      where embedding is not null
        and (p_corpora is null or corpus = any(p_corpora))
      order by embedding <=> p_embedding
      limit least(p_k, 25)
    ) t
  );
end;
$$;

grant execute on function semantic_period_search(extensions.vector, text[], int) to anon, authenticated;

-- Bulk-write embeddings from the embed batch loader (service role only).
create or replace function set_embeddings(p jsonb)
returns int
language sql
security definer
set search_path = public, extensions
as $$
  with updated as (
    update period_docs d
    set embedding = (e->>'embedding')::extensions.vector(1536)
    from jsonb_array_elements(p) e
    where d.id = (e->>'id')::bigint
    returning 1
  )
  select count(*)::int from updated;
$$;

revoke execute on function set_embeddings(jsonb) from public, anon, authenticated;

-- Library: browse the period corpora as books.
create or replace function library_works()
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(row_json order by corpus, work), '[]'::jsonb)
  from (
    select corpus, work,
      jsonb_build_object(
        'corpus', corpus,
        'work', work,
        'passages', count(*),
        'language', min(language)
      ) as row_json
    from period_docs
    where corpus in ('Josephus', 'Philo', 'Second Temple')
    group by corpus, work
  ) t;
$$;

create or replace function library_passages(
  p_corpus text,
  p_work text,
  p_limit int default 40,
  p_offset int default 0
) returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'total', (select count(*) from period_docs where corpus = p_corpus and work = p_work),
    'rows', coalesce(jsonb_agg(row_json), '[]'::jsonb)
  )
  from (
    select jsonb_build_object(
      'id', id,
      'ref', ref,
      'language', language,
      'content', content,
      'content_en', content_en
    ) as row_json
    from period_docs
    where corpus = p_corpus and work = p_work
    order by id
    limit least(p_limit, 100) offset greatest(p_offset, 0)
  ) t;
$$;

grant execute on function library_works() to anon, authenticated;
grant execute on function library_passages(text, text, int, int) to anon, authenticated;

-- First-run email capture with explicit marketing consent. The table has
-- RLS with no policies; the only path in is the capture_email RPC, which
-- stores nothing without consent.
create table if not exists email_signups (
  id bigint generated always as identity primary key,
  email text not null unique,
  consented boolean not null default false,
  source text,
  created_at timestamptz not null default now()
);

alter table email_signups enable row level security;

create or replace function capture_email(p_email text, p_consent boolean, p_source text default 'app')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or length(p_email) > 320 then
    return false;
  end if;
  if not coalesce(p_consent, false) then
    return false;
  end if;
  insert into email_signups (email, consented, source)
  values (lower(trim(p_email)), true, left(coalesce(p_source, 'app'), 40))
  on conflict (email) do update set consented = true;
  return true;
end;
$$;

grant execute on function capture_email(text, boolean, text) to anon, authenticated;

-- Evaluation harness (AI layer 4, docs/eval/): the tagged LXX as ground
-- truth for retrieval experiments. Read-only over world-readable data.
create or replace function eval_lxx_truth(p_strongs text)
returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'total_lxx', (select count(*) from period_docs where corpus = 'LXX'),
    'truth_ids', coalesce(jsonb_agg(id), '[]'::jsonb)
  )
  from period_docs
  where corpus = 'LXX' and strongs @> array[p_strongs];
$$;

create or replace function eval_semantic_lxx(
  p_embedding extensions.vector(1536),
  p_k int default 50
) returns jsonb
language plpgsql stable
as $$
begin
  perform set_config('ivfflat.probes', '20', true);
  return (
    select coalesce(jsonb_agg(id order by rank), '[]'::jsonb)
    from (
      select id, row_number() over (order by embedding <=> p_embedding) as rank
      from period_docs
      where corpus = 'LXX' and embedding is not null
      order by embedding <=> p_embedding
      limit least(p_k, 200)
    ) t
  );
end;
$$;

create or replace function eval_keyword_lxx(
  p_terms text[],
  p_k int default 50
) returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(id order by score desc, id), '[]'::jsonb)
  from (
    select id,
      (select count(*) from unnest(p_terms) term
       where content_en ilike '%' || term || '%') as score
    from period_docs
    where corpus = 'LXX' and content_en is not null
    order by score desc, id
    limit least(p_k, 200)
  ) t
  where score > 0;
$$;

grant execute on function eval_lxx_truth(text) to anon, authenticated;
grant execute on function eval_semantic_lxx(extensions.vector, int) to anon, authenticated;
grant execute on function eval_keyword_lxx(text[], int) to anon, authenticated;

-- Rate limiting for the paid AI endpoints (per-IP hourly + global daily
-- caps). Checked-and-recorded in one call; service role only.
create table if not exists ai_calls (
  id bigint generated always as identity primary key,
  fn text not null,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_calls_fn_ip_time on ai_calls (fn, ip, created_at);
create index if not exists idx_ai_calls_fn_time on ai_calls (fn, created_at);
alter table ai_calls enable row level security;

create or replace function ai_gate(p_fn text, p_ip text, p_per_ip_hour int, p_per_day int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ip_n int;
  day_n int;
begin
  select count(*) into ip_n from ai_calls
    where fn = p_fn and ip = p_ip and created_at > now() - interval '1 hour';
  select count(*) into day_n from ai_calls
    where fn = p_fn and created_at > now() - interval '24 hours';
  if ip_n >= p_per_ip_hour or day_n >= p_per_day then
    return false;
  end if;
  insert into ai_calls (fn, ip) values (p_fn, p_ip);
  return true;
end;
$$;

revoke execute on function ai_gate(text, text, int, int) from public, anon, authenticated;

-- semantic_period_search gains a similarity floor (p_min_sim, default 0.30):
-- weak nearest neighbors are worse than no neighbors. Definition above is
-- superseded by the 4-argument version applied in the migrations.

-- =============================================================
-- Historical context phase A: TIPNR proper-name entities (people,
-- places, other named things). Source: STEPBible-Data "Proper Nouns"
-- (CC BY 4.0, same attribution as the word data). Loaded by
-- ingest/ingest_tipnr.py; see docs/historical-context.md.
-- =============================================================

create table if not exists entities (
    ustrong        text primary key,   -- unified Strong's: unique per individual (H0175, G2264G)
    kind           text not null check (kind in ('person','place','other')),
    etype          text,               -- Male, Female, Group, Place, Supernatural, Title...
    name           text not null,      -- most common English name (ESV)
    unified_name   text,               -- unique key incl. first-ref anchor: Aaron@Exo.4.14-Heb
    description    text,
    summary        text,               -- standard-sentence summary with <ref>/<strong> markup
    parents text, siblings text, partners text, offspring text,
    tribe          text,               -- person: Tribe of Levi; place: geographical area
    founder text, inhabitants text,
    openbible_name text,
    lat double precision, lng double precision,   -- from OpenBible via TIPNR map URLs
    brief text, short_desc text, article text,    -- ALWAYS NULL: TIPNR's AI-written blurbs are
                                                  -- deliberately not ingested (evidence, not
                                                  -- opinion; docs/historical-context.md)
    refs_count     int
);

create table if not exists entity_names (
    id bigserial primary key,
    ustrong text not null references entities (ustrong) on delete cascade,
    dstrong text,        -- joins ol_words.dstrongs; left(dstrong,5) is the simple Strong's
    estrong text,
    significance text,   -- Named, Greek, Spelled, Mentioned...
    form text,           -- Hebrew/Greek script
    translated text      -- ESV rendering (with KJV/NIV when they differ)
);
create index if not exists idx_entity_names_dstrong on entity_names (dstrong);
create index if not exists idx_entity_names_ustrong on entity_names (ustrong);

-- Exhaustive verse refs per entity. The verse anchor is what disambiguates:
-- the same dstrong can serve a name in one verse and a common noun elsewhere
-- (H3820A is "heart" in most verses but Leb-kamai = Chaldea in Jer 51:1).
create table if not exists entity_refs (
    ustrong text not null references entities (ustrong) on delete cascade,
    book text not null, chapter int not null, verse int not null,
    primary key (ustrong, book, chapter, verse)
);
create index if not exists idx_entity_refs_ref on entity_refs (book, chapter, verse);

-- Family/founder relations resolved to uStrongs at ingest (target null when
-- the relative is an unnamed genealogy placeholder).
create table if not exists entity_links (
    id bigserial primary key,
    ustrong text not null references entities (ustrong) on delete cascade,
    role text not null,  -- parent, sibling, partner, offspring, founder, inhabitant
    name text not null,
    target text
);
create index if not exists idx_entity_links_ustrong on entity_links (ustrong);

alter table entities     enable row level security;
alter table entity_names enable row level security;
alter table entity_refs  enable row level security;
alter table entity_links enable row level security;
drop policy if exists entities_read on entities;
drop policy if exists entity_names_read on entity_names;
drop policy if exists entity_refs_read on entity_refs;
drop policy if exists entity_links_read on entity_links;
create policy entities_read     on entities     for select using (true);
create policy entity_names_read on entity_names for select using (true);
create policy entity_refs_read  on entity_refs  for select using (true);
create policy entity_links_read on entity_links for select using (true);

-- Entity RPCs (verse_entities, entities_for_strongs, entity_card,
-- entity_refs_page) are defined in the tipnr_entity_rpcs migration:
-- verse-anchored lookups for the Reader word sheet, one-lemma individual
-- lists for Word Study, the full card, and a canonical-order refs page
-- joined with the BSB text.

-- Sense Drift: how a word's dominant sense shifts across canonical eras,
-- computed purely from the tagged glosses. No AI involved.
-- sense_of reduces a gloss to its head sense token; sense_drift groups
-- occurrences into eras (Torah / Prophets / Writings, Gospels & Acts /
-- Paul / General) and counts the top senses (plural-merged, min 3 hits).
-- Full definitions in the sense_drift* migrations.

create or replace function sense_of(g text)
returns text
immutable
language sql
as $fn$
  select coalesce((
    select w
    from unnest(string_to_array(
      regexp_replace(lower(split_part(split_part(coalesce(g, ''), '@', 1), chr(187), 1)), '[^a-z ]', ' ', 'g'),
      ' ')) w
    where w <> '' and w not in (
      'the','a','an','and','of','my','his','her','your','their','its','he','she','it',
      'i','you','they','who','whom','was','were','is','are','am','to','in','on','for',
      'with','shall','will','be','been','being','have','has','had','not','that','this',
      'which','them','him','me','us','we','then','when','from','by','at','as','but',
      'or','so','do','did','does','o','let','there','all','one','any','out','up',
      'into','unto','upon','over','against','before','after','through',
      'toward','towards','among','within','without','about','also','no','nor','if',
      'because','than','such','what','how','where','why','may','can','could','would',
      'should','must','more','most','very','each','every','some','both','now','here',
      'like','these','those','only','even','again','together','away','down','off',
      'back','thus','yet','still','just','same','own','other','another','under'
    )
    limit 1
  ), 'other');
$fn$;

grant execute on function sense_drift(text) to anon, authenticated;
