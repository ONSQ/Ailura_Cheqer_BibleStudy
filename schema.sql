-- =============================================================
-- Word Study Spine: Supabase schema
-- Source data: STEPBible TAHOT + TAGNT (CC BY 4.0, Tyndale House)
-- Attribution required: "Tyndale House, Cambridge" (TyndaleHouse.com)
-- and "STEP Bible" (STEPBible.org)
-- =============================================================

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

-- App API helpers (queried by the Expo app through PostgREST)
create or replace view v_books as
select book, corpus, max(chapter) as chapters, min(id) as ord
from ol_words
group by book, corpus;

create or replace view v_versions as
select distinct version from translations;

create or replace function gloss_distribution(p_strongs text)
returns table (gloss text, count bigint)
language sql stable as $$
    select gloss, count(*)
    from ol_words
    where strongs = p_strongs and gloss is not null and gloss <> ''
    group by gloss
    order by count(*) desc
    limit 15
$$;

-- Reassembled verse text for quick interlinear display
create or replace view v_verse_interlinear as
select corpus, book, chapter, verse,
       string_agg(surface, ' ' order by word_num)                          as original_text,
       string_agg(coalesce(gloss,''), ' | ' order by word_num)             as gloss_line,
       array_agg(strongs order by word_num)                                as strongs_list
from ol_words
where source_tag is null or source_tag in ('L','Q','R','X') or corpus = 'NT'
group by corpus, book, chapter, verse;
