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
    embedding vector(1536)                -- pgvector, for RAG over period witnesses
);
create index if not exists idx_period_docs_work on period_docs (corpus, work);

-- Group features (men's group layer, wired to Supabase auth later)
create table if not exists word_studies (
    id          bigserial primary key,
    owner       uuid,                     -- auth.users reference when auth is enabled
    strongs     text references lexemes (strongs),
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
