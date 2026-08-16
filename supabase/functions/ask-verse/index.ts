// Ask-verse: direct questions on a highlighted passage ("what is it really
// saying here?", "are there other readings?", "how might this apply?").
// Grounded in the verse's tagged words, surrounding context, and ancient
// witnesses; application is framed as reflection, never authority.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const CLIENT_KEY = 'sb_publishable_mPC9RUurQIxHzR6ESYwgPw_TRAhzBIs';

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'refs'],
  properties: {
    answer: { type: 'string', description: 'The answer, plain warm English, a paragraph or two' },
    refs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'note'],
        properties: {
          ref: { type: 'string', description: 'Reference from the provided material, e.g. "Gen 1:2" or "LXX Gen 1:2"' },
          note: { type: 'string' },
        },
      },
    },
  },
};

const SYSTEM = `You answer questions about one specific Bible passage for Cheqer, a word-study app used by a men's church group. You receive the passage's evidence: the verse in its immediate context (English text of surrounding verses), the KJV wording, the tagged original-language words with transliterations and glosses, ancient witnesses (Septuagint, Targum) with English where available, and the lexemes behind the verse.

Rules:
1. Ground every answer in the provided material. When explaining what the text "is really saying", work from the original-language words and their glosses — that is what this app exists for. Quote the Hebrew/Greek with transliteration.
2. Where faithful readers genuinely differ on a verse's meaning, present the main readings fairly and note what the words themselves do and do not settle. You describe; you do not adjudicate doctrinal disputes or speak for any church.
3. Application questions ("how does this apply to me?") are welcome, handled humbly: draw only on what the passage itself emphasizes, offer observations and questions worth pondering rather than personal directives, and for weighty personal matters suggest bringing it to the group or a pastor. Mark clearly where the text ends and reflection begins (e.g. "Worth pondering:").
4. Plain, warm, precise English for thoughtful laymen. No Strong's numbers in the prose. No academic jargon without a one-phrase explanation. Keep answers to one or two solid paragraphs unless the question demands more.
5. Never mention your inputs or process ("the data", "the context provided"). Speak of the verse, the words, the witnesses.
6. refs: list the references from the provided material your answer leans on (the verse itself, neighboring verses, witness refs). Use the exact reference strings given.`;

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

    const { book, chapter, verse, question, history } = await req.json();
    if (
      typeof book !== 'string' || !/^[1-3]?[A-Za-z]{2,3}$/.test(book) ||
      !Number.isInteger(chapter) || !Number.isInteger(verse) ||
      typeof question !== 'string' || question.trim().length < 3 || question.length > 300
    ) {
      return json({ error: 'bad request' }, 400);
    }
    const turns: { question: string; answer: string }[] = Array.isArray(history)
      ? history.slice(-4)
      : [];

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: context, error: ctxErr } = await supabase.rpc('verse_context', {
      p_book: book, p_chapter: chapter, p_verse: verse,
    });
    if (ctxErr || !context) return json({ error: 'no context' }, 404);
    if (!Array.isArray(context.words) || context.words.length === 0) {
      return json({ error: 'unknown verse' }, 404);
    }

    const historyText = turns.length
      ? `\n\nEarlier in this conversation about the same verse:\n${turns
          .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
          .join('\n\n')}`
      : '';

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
        output_config: { format: { type: 'json_schema', schema: ANSWER_SCHEMA }, effort: 'medium' },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `Passage evidence for ${context.ref}:\n\n${JSON.stringify(context)}${historyText}\n\nQuestion about this verse: ${question.trim()}`,
        }],
      }),
    });
    const msg = await res.json();
    if (!res.ok) return json({ error: msg?.error?.message ?? 'model error' }, 502);
    if (msg.stop_reason === 'refusal') return json({ error: 'model declined' }, 502);

    const text = (msg.content as Array<{ type: string; text?: string }>)
      .find((b) => b.type === 'text')?.text;
    if (!text) return json({ error: 'empty response' }, 502);
    return json({ result: JSON.parse(text), model: msg.model });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
