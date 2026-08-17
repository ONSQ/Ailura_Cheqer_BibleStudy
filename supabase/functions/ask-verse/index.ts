// Ask-verse v2: direct questions on a verse or passage ("what is it really
// saying?", "what are the themes?", "how does this connect with the rest of
// Scripture?"). Grounded in the passage's tagged words, context, and ancient
// witnesses; correlation questions can search the wider canon with tools.
// Application is framed as reflection, never authority.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const CLIENT_KEY = 'sb_publishable_mPC9RUurQIxHzR6ESYwgPw_TRAhzBIs';
const MAX_RANGE = 15;

const TOOLS = [
  {
    name: 'search_verses',
    description:
      'Search the whole English Bible (BSB) for a word or short phrase, to find related passages elsewhere in Scripture. Returns up to 20 verses with references. Use short, distinctive phrases; try variants if one misses.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'search_lexemes',
    description:
      'Find Hebrew/Greek lexemes whose English glosses match a term, to trace a theme by its original words across Scripture. Returns lemma, Strong s id, language, occurrences.',
    input_schema: {
      type: 'object',
      properties: { term: { type: 'string' } },
      required: ['term'],
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
  required: ['answer', 'refs'],
  properties: {
    answer: { type: 'string', description: 'The answer, plain warm English' },
    refs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'note'],
        properties: {
          ref: {
            type: 'string',
            description:
              'A reference from the provided material or retrieved with tools, e.g. "Gen 1:2", "Psa 104:30", "LXX Gen 1:2"',
          },
          note: { type: 'string' },
        },
      },
    },
  },
};

const SYSTEM = `You answer questions about one specific Bible passage for Cheqer, a word-study app used by a men's church group. You receive the passage's evidence: the verses in immediate context (English text), the KJV wording, the tagged original-language words with transliterations and glosses, ancient witnesses (Septuagint, Targum) with English where available, and the lexemes behind the passage. You also have search tools over the whole Bible.

Rules:
1. Ground every answer in the provided material and, where you search, in what the searches actually return. When explaining what the text "is really saying", work from the original-language words and their glosses. Quote Hebrew/Greek with transliteration.
2. Theme and big-idea questions: name the passage's themes from its own words and structure — repeated words, contrasts, movement of thought — not from a commentary tradition.
3. Correlation questions ("how does this connect with the rest of Scripture?", "where else does this idea appear?"): use the search tools to find related passages by their distinctive words and phrases. Cite only verses the searches returned. Budget your searching: at most four searches total, run in parallel where possible, then answer from what you have — a few well-chosen connections beat an exhaustive hunt. If a connection did not surface in your searches, do not cite it.
4. Where faithful readers genuinely differ, present the main readings fairly. You describe; you do not adjudicate doctrinal disputes.
4b. The search_witnesses tool returns Second Temple writings (Josephus, Philo, 1 Enoch, Jubilees, and others). These illuminate the passage's world but are not Scripture: always attribute them by name ("Josephus writes...", "Jubilees retells this...") and never present them with scriptural authority. Their refs may appear in refs (e.g. "Ant. 1.27-33", "1 Enoch 6:1-4").
5. Application questions are welcome, handled humbly: draw only on what the passage emphasizes, offer observations and questions worth pondering rather than personal directives, mark where the text ends and reflection begins ("Worth pondering:"), and for weighty personal matters suggest the group or a pastor.
6. Plain, warm, precise English. No Strong's numbers in prose. Never mention your inputs, tools, or process — speak of the passage, the words, the witnesses, Scripture.
7. refs: the references your answer leans on — from the passage material and from search results. Use exact reference strings (3-letter book codes like Gen, Psa, Jhn).`;

async function callClaude(messages: unknown[], final = false) {
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
      ...(final ? { tool_choice: { type: 'none' } } : {}),
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

    const { book, chapter, verse, verseEnd, question, history } = await req.json();
    if (
      typeof book !== 'string' || !/^[1-3]?[A-Za-z]{2,3}$/.test(book) ||
      !Number.isInteger(chapter) || !Number.isInteger(verse) ||
      typeof question !== 'string' || question.trim().length < 3 || question.length > 300
    ) {
      return json({ error: 'bad request' }, 400);
    }
    const v1 = verse;
    const v2 = Number.isInteger(verseEnd)
      ? Math.min(Math.max(verseEnd, v1), v1 + MAX_RANGE - 1)
      : v1;
    const turns: { question: string; answer: string }[] = Array.isArray(history)
      ? history.slice(-4)
      : [];

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: context, error: ctxErr } = await supabase.rpc('passage_context', {
      p_book: book, p_chapter: chapter, p_v1: v1, p_v2: v2,
    });
    if (ctxErr || !context) return json({ error: 'no context' }, 404);
    if (!Array.isArray(context.words) || context.words.length === 0) {
      return json({ error: 'unknown passage' }, 404);
    }

    const runTool = async (name: string, input: Record<string, unknown>) => {
      if (name === 'search_verses') {
        const { data } = await supabase.rpc('nl_search_verses', { p_query: input.query });
        return data ?? [];
      }
      if (name === 'search_lexemes') {
        const { data } = await supabase.rpc('nl_search_lexemes', { p_term: input.term });
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

    const historyText = turns.length
      ? `\n\nEarlier in this conversation about the same passage:\n${turns
          .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
          .join('\n\n')}`
      : '';

    const messages: unknown[] = [{
      role: 'user',
      content: `Passage evidence for ${context.ref}:\n\n${JSON.stringify(context)}${historyText}\n\nQuestion about this passage: ${question.trim()}`,
    }];

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
            results.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(await runTool(block.name, block.input)),
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
      return json({ result: JSON.parse(text), model: msg.model });
    }
    return json({ error: 'no answer produced' }, 502);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
