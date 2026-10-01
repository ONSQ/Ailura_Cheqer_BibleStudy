-- Cheqer accuracy checks. Run in the Supabase SQL editor (or psql) after any
-- ingestion or schema change and before each release. Read-only. Every row
-- should come back with ok = true; a false row names what drifted.

with checks (name, expected, actual) as (
    -- Data spine -----------------------------------------------------------
    select 'ol_words rows', '447748', (select count(*)::text from ol_words)
    union all
    select 'books', '66', (select count(distinct book)::text from ol_words)
    union all
    select 'psalms', '150', (select count(distinct chapter)::text from ol_words where book = 'Psa')
    union all
    select 'John 1:1 words', '17',
           (select count(*)::text from ol_words where book = 'Jhn' and chapter = 1 and verse = 1)
    union all
    select 'H0430 occurrences', '2603',
           (select occurrences::text from lexemes where strongs = 'H0430')
    union all
    select 'lexeme counts that disagree with ol_words', '0',
           (select count(*)::text
            from lexemes l
            left join (select strongs, count(*) n from ol_words group by strongs) a using (strongs)
            where coalesce(a.n, 0) <> l.occurrences)
    union all
    select 'word slots holding two words', '0',
           (select count(*)::text
            from (select 1 from ol_words
                  group by book, chapter, verse, word_num having count(*) > 1) d)

    -- Words outside the base text are labelled, and counted both ways ---------
    union all
    select 'words outside the base text (NA28 / Hebrew text)', '4329',
           (select count(*)::text from ol_words
            where word_variant(corpus, source_tag, editions) is not null)
    union all
    select 'G2424 Jesus: all editions / NA28', '992 / 915',
           (select (p ->> 'total') || ' / ' || (p ->> 'base_total')
            from occurrences_page('G2424', 0, 0) p)
    union all
    select 'glosses that open with a verse-number marker', '0',
           (select count(*)::text from ol_words where gloss ~ '^\[[0-9]+(\.[0-9]+)?\]\s')

    -- Lexeme definitions come from the lexicon, not from one occurrence ------
    union all
    select 'lexeme glosses G1722 / G2316 / G3056 / H3318 / H7307',
           'in/on/among / God / word / to come out / spirit',
           (select string_agg(gloss, ' / ' order by strongs)
            from lexemes where strongs in ('G3056', 'G2316', 'G1722', 'H7307', 'H3318'))
    union all
    select 'lexeme glosses with source markup or none', '0',
           (select count(*)::text from lexemes
            where gloss is null or gloss = '' or gloss ~ '[»@]')
    union all
    select 'Aramaic lexemes', '678', (select count(*)::text from lexemes where language = 'arc')
    union all
    select 'G3056 top contextual gloss', 'word',
           (select gloss from gloss_distribution('G3056') limit 1)

    -- English text lines up with the original-language words -----------------
    union all
    select 'BSB verses with no original-language words', '0',
           (select count(*)::text
            from translations t
            where t.version = 'BSB'
              and not exists (select 1 from ol_words w
                              where w.book = t.book and w.chapter = t.chapter and w.verse = t.verse))
    union all
    -- 116 psalm titles (verse 0) and 16 verses the BSB leaves to its footnotes
    select 'original-language verses with no BSB text', '132',
           (select count(*)::text
            from (select distinct book, chapter, verse from ol_words) w
            where not exists (select 1 from translations t
                              where t.version = 'BSB' and t.book = w.book
                                and t.chapter = w.chapter and t.verse = w.verse))
    union all
    select '2 Corinthians 13 verses', '14',
           (select count(distinct verse)::text from ol_words where book = '2Co' and chapter = 13)
    union all
    select '2Co 13:14 opens with', 'grace',
           (select gloss from ol_words
            where book = '2Co' and chapter = 13 and verse = 14 and word_num = 2)

    -- Witnesses are looked up by their own numbering -------------------------
    union all
    select 'verse_map rows', '2094', (select count(*)::text from verse_map)
    union all
    select 'lxx_verse_map rows', '4584', (select count(*)::text from lxx_verse_map)
    union all
    select 'LXX behind Jer 31:31 (new covenant)', 'Jer 38:31',
           (select string_agg(work || ' ' || ref, ', ') from witness_refs('Jer', 31, 31) where corpus = 'LXX')
    union all
    select 'LXX behind Psa 51:1', 'Ps 50:3',
           (select string_agg(work || ' ' || ref, ', ') from witness_refs('Psa', 51, 1) where corpus = 'LXX')
    union all
    select 'LXX behind Mal 4:5 (Elijah)', 'Mal 3:22',
           (select string_agg(work || ' ' || ref, ', ') from witness_refs('Mal', 4, 5) where corpus = 'LXX')
    union all
    select 'Targum behind Gen 32:1', 'Onkelos Gen 32:2',
           (select string_agg(work || ' ' || ref, ', ') from witness_refs('Gen', 32, 1) where corpus = 'Targum')
    union all
    select 'witness refs that name a missing LXX verse', '0',
           (select count(*)::text
            from lxx_verse_map x
            join lxx_book_map m on m.ot_book = x.book
            where x.lxx_chapter is not null
              and not exists (select 1 from period_docs p
                              where p.corpus = 'LXX' and p.work = m.lxx_work
                                and p.ref = x.lxx_chapter || ':' || x.lxx_verse))
    union all
    select 'top LXX rendering of H2617 (chesed)', 'G1656',
           (select lxx_renderings('H2617') -> 0 ->> 'grk_strongs')

    -- The AI functions see whole verses --------------------------------------
    union all
    select 'verse_words keeps the Qere (Rut 3:14)',
           (select count(*)::text from ol_words where book = 'Rut' and chapter = 3 and verse = 14),
           jsonb_array_length(verse_words('Rut', 3, 14))::text

    union all
    select 'English search for "love" samples the whole canon', 'Gen to 1Jn',
           (select (nl_search_verses('love') -> 0 ->> 'book') || ' to ' ||
                   (nl_search_verses('love') -> -1 ->> 'book'))

    -- Entities ---------------------------------------------------------------
    union all
    -- two TIPNR refs point at verses that do not exist (Mat 15:42, Psa 68:36)
    select 'entity refs to verses that do not exist', '2',
           (select count(distinct (r.book, r.chapter, r.verse))::text
            from entity_refs r
            where not exists (select 1 from ol_words w
                              where w.book = r.book and w.chapter = r.chapter and w.verse = r.verse))
)
select name, expected, actual, expected = actual as ok
from checks
order by ok, name;
