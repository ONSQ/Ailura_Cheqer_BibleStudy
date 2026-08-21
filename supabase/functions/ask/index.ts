// Natural-language front door (Phase 4, layer 3): the user asks a plain
// question; Claude searches the English text, the lexicon, and per-verse
// tagging, then answers with lemma chips and verse refs — every reference
// retrieved, never invented. Users never need Strong's numbers.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const CLIENT_KEY = 'sb_publishable_mPC9RUurQIxHzR6ESYwgPw_TRAhzBIs';

async function gate(supa: ReturnType<typeof createClient>, fn: string, req: Request, perHour: number, perDay: number): Promise<boolean> {
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim().slice(0, 64);
    const { data, error } = await supa.rpc('ai_gate', {
      p_fn: fn, p_ip: ip, p_per_ip_hour: perHour, p_per_day: perDay,
    });
    if (error) return true; // fail open: a gate outage must not take the app down
    return data === true;
  } catch {
    return true;
  }
}

// Deterministic citation check: collect every reference string derivable
// from the retrieved evidence, so model output can be filtered to it.
function collectRefs(node: unknown, out: Set<string>) {
  if (Array.isArray(node)) {
    for (const n of node) collectRefs(n, out);
    return;
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.ref === 'string') {
      out.add(o.ref);
      if (typeof o.work === 'string') {
        out.add(`${o.work} ${o.ref}`);
        out.add(`LXX ${o.work} ${o.ref}`);
        out.add(`Targum ${o.work} ${o.ref}`);
      }
      if (typeof o.corpus === 'string') out.add(`${o.corpus} ${o.ref}`);
    }
    if (typeof o.book === 'string' && o.chapter != null && o.verse != null) {
      out.add(`${o.book} ${o.chapter}:${o.verse}`);
    }
    for (const v of Object.values(o)) collectRefs(v, out);
  }
}

const TOOLS = [
  {
    name: 'search_verses',
    description:
      'Search the English Bible text (BSB) for a word or short phrase. Returns up to 20 matching verses with references and text. Use short, distinctive phrases; try variants if a phrase misses.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'word or short phrase' } },
      required: ['query'],
    },
  },
  {
    name: 'search_lexemes',
    description:
      'Find Hebrew/Greek lexemes whose English glosses match a term. Returns lemma, Strong s id, language, and total occurrences. Use single English words (e.g. "spirit", "covenant").',
    input_schema: {
      type: 'object',
      properties: { term: { type: 'string' } },
      required: ['term'],
    },
  },
  {
    name: 'verse_words',
    description:
      'List the original-language words of one verse (surface, transliteration, gloss, Strong s id) to identify which Hebrew/Greek words underlie an English phrase. Book codes are STEPBible 3-letter forms (Gen, Exo, Psa, Mat, Jhn).',
    input_schema: {
      type: 'object',
      properties: {
        book: { type: 'string' },
        chapter: { type: 'integer' },
        verse: { type: 'integer' },
      },
      required: ['book', 'chapter', 'verse'],
    },
  },
  {
    name: 'search_witnesses',
    description:
      'Search Jewish writings from the centuries around the New Testament (Josephus, Philo, 1 Enoch, Jubilees, Testaments of the Twelve Patriarchs, Maccabees, and more) for passages related to an idea, by meaning. These are historical witnesses, NOT Scripture. Use when the question touches what Jews of the period believed or how an idea was understood in that world. Returns refs with English excerpts.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'the idea to search for, a short phrase' } },
      required: ['query'],
    },
  },
];

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'lemmas', 'verses'],
  properties: {
    answer: {
      type: 'string',
      description: 'Plain-English answer, a short paragraph or two',
    },
    lemmas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['strongs', 'lemma', 'note'],
        properties: {
          strongs: { type: 'string' },
          lemma: { type: 'string' },
          note: { type: 'string', description: 'why this word matters for the question' },
        },
      },
    },
    verses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'note'],
        properties: {
          ref: {
            type: 'string',
            description: 'Canonical 3-letter book code + chapter:verse, e.g. "Gen 6:2"',
          },
          note: { type: 'string' },
        },
      },
    },
  },
};

const SYSTEM = `You are the question box of Cheqer, a Bible word-study app for a men's church group. The user asks a plain-English question about where or how Scripture speaks of something. Your job: use the search tools to find the actual verses and the underlying Hebrew/Greek words, then answer.

Hard rules:
1. Only cite verses and lexemes you actually retrieved with the tools this turn. Never answer a "where does Scripture say" question from memory alone — verify with the tools; if searches come up empty, say so honestly.
2. You describe where and how Scripture speaks; you do not adjudicate doctrine or interpretation disputes. Where witnesses differ or a phrase is debated, note it neutrally.
3. Write for thoughtful laymen: plain, warm English. Introduce Hebrew/Greek words with transliteration. Never show Strong's numbers in the answer text (they ride along in the lemmas list for the app to link).
4. Be efficient: two to four tool calls usually suffice. Search the English text for distinctive phrases first, then use verse_words on a key verse to identify the original words.
5. In the verses list, use the exact 3-letter book codes from the search results (Gen, Exo, Psa, Mat, Jhn...). List 3-8 of the most relevant verses, not every hit.
6. search_witnesses returns Second Temple writings (Josephus, Philo, 1 Enoch, Jubilees, and others). These illuminate the world of Scripture but are not Scripture: always attribute them by name in the answer ("Josephus writes...", "1 Enoch describes...") and never present them with scriptural authority. Keep the verses list for Bible verses only.`;

async function callClaude(messages: unknown[], final = false) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 16000,
      system: SYSTEM,
      tools: TOOLS,
      ...(final ? { tool_choice: { type: 'none' } } : {}),
      output_config: { format: { type: 'json_schema', schema: ANSWER_SCHEMA } },
      messages,
    }),
  });
  const msg = await res.json();
  if (!res.ok) throw new Error(msg?.error?.message ?? 'model error');
  return msg;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const auth = req.headers.get('apikey') ?? req.headers.get('authorization') ?? '';
    if (!auth.includes(CLIENT_KEY)) return json({ error: 'unauthorized' }, 401);

    const { question } = await req.json();
    if (typeof question !== 'string' || question.trim().length < 3 || question.length > 300) {
      return json({ error: 'bad question' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (!(await gate(supabase, 'ask', req, 10, 200))) {
      return json({ error: 'rate limit reached, try again later' }, 429);
    }

    const evidence: unknown[] = [];
    const trail: { tool: string; query: string; found: number }[] = [];

    const runTool = async (name: string, input: Record<string, unknown>) => {
      if (name === 'search_verses') {
        const { data } = await supabase.rpc('nl_search_verses', { p_query: input.query });
        return data ?? [];
      }
      if (name === 'search_lexemes') {
        const { data } = await supabase.rpc('nl_search_lexemes', { p_term: input.term });
        return data ?? [];
      }
      if (name === 'verse_words') {
        const { data } = await supabase.rpc('verse_words', {
          p_book: input.book, p_chapter: input.chapter, p_verse: input.verse,
        });
        return data ?? [];
      }
      if (name === 'search_witnesses') {
        const key = Deno.env.get('OPENAI_API_KEY');
        if (!key) return { error: 'witness search unavailable' };
        const embRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: 'text-embedding-3-small', input: String(input.query).slice(0, 300) }),
        });
        if (!embRes.ok) return { error: 'witness search failed' };
        const embedding = (await embRes.json()).data[0].embedding as number[];
        const { data } = await supabase.rpc('semantic_period_search', {
          p_embedding: JSON.stringify(embedding),
          p_corpora: ['Josephus', 'Philo', 'Second Temple'],
          p_k: 6,
        });
        return ((data as Array<Record<string, unknown>>) ?? []).map((r) => ({
          work: r.work,
          ref: r.ref,
          excerpt: String(r.content_en ?? r.content ?? '').slice(0, 700),
        }));
      }
      return { error: 'unknown tool' };
    };

    const messages: unknown[] = [{ role: 'user', content: question.trim() }];
    const MAX_ROUNDS = 5;
    for (let i = 0; i <= MAX_ROUNDS; i++) {
      // Last round: no more tools — answer from what was gathered.
      const final = i === MAX_ROUNDS;
      const msg = await callClaude(messages, final);
      if (msg.stop_reason === 'refusal') return json({ error: 'model declined' }, 502);

      if (msg.stop_reason === 'tool_use' && !final) {
        messages.push({ role: 'assistant', content: msg.content });
        const results = [];
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            const result = await runTool(block.name, block.input);
            evidence.push(result);
            trail.push({
              tool: block.name,
              query: String(
                block.input.query ?? block.input.term ??
                (block.input.book ? `${block.input.book} ${block.input.chapter}:${block.input.verse}` : ''),
              ),
              found: Array.isArray(result) ? result.length : 0,
            });
            results.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }
        messages.push({ role: 'user', content: results });
        if (i === MAX_ROUNDS - 1) {
          messages.push({
            role: 'user',
            content:
              'That is enough searching. Answer the question now using only what your searches already returned.',
          });
        }
        continue;
      }

      const text = (msg.content as Array<{ type: string; text?: string }>)
        .find((b) => b.type === 'text')?.text;
      if (!text) return json({ error: 'empty response' }, 502);
      const result = JSON.parse(text);
      // Structural guarantee: only references that appeared in retrieved
      // evidence this request survive to the client.
      const valid = new Set<string>();
      collectRefs(evidence, valid);
      const evidenceText = JSON.stringify(evidence);
      const before = (result.verses?.length ?? 0) + (result.lemmas?.length ?? 0);
      result.verses = (result.verses ?? []).filter(
        (v: { ref: string }) => valid.has(v.ref) || evidenceText.includes(v.ref),
      );
      result.lemmas = (result.lemmas ?? []).filter(
        (l: { strongs: string }) => evidenceText.includes(l.strongs),
      );
      const kept = result.verses.length + result.lemmas.length;
      return json({
        result,
        model: msg.model,
        trail,
        citations: { kept, dropped: before - kept },
      });
    }
    return json({ error: 'too many search rounds' }, 502);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
