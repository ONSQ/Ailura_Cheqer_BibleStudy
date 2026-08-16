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
5. In the verses list, use the exact 3-letter book codes from the search results (Gen, Exo, Psa, Mat, Jhn...). List 3-8 of the most relevant verses, not every hit.`;

async function callClaude(messages: unknown[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: SYSTEM,
      tools: TOOLS,
      output_config: { format: { type: 'json_schema', schema: ANSWER_SCHEMA }, effort: 'medium' },
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
      return { error: 'unknown tool' };
    };

    const messages: unknown[] = [{ role: 'user', content: question.trim() }];
    for (let i = 0; i < 6; i++) {
      const msg = await callClaude(messages);
      if (msg.stop_reason === 'refusal') return json({ error: 'model declined' }, 502);

      if (msg.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: msg.content });
        const results = [];
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            const result = await runTool(block.name, block.input);
            results.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }
        messages.push({ role: 'user', content: results });
        continue;
      }

      const text = (msg.content as Array<{ type: string; text?: string }>)
        .find((b) => b.type === 'text')?.text;
      if (!text) return json({ error: 'empty response' }, 502);
      return json({ result: JSON.parse(text), model: msg.model });
    }
    return json({ error: 'too many search rounds' }, 502);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
