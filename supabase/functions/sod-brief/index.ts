// Sod brief: grounded AI word-study synthesis (Phase 4, layer 2).
// Retrieves the evidence bundle server-side, has Claude write a brief where
// every claim cites a retrievable reference, caches one brief per lexeme.
// The model summarizes witnesses; it never generates doctrine.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const CLIENT_KEY = 'sb_publishable_mPC9RUurQIxHzR6ESYwgPw_TRAhzBIs';

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'sections'],
  properties: {
    summary: { type: 'string', description: '2-3 sentence overview of the word and its range of meaning' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'body', 'citations'],
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          citations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exact reference strings from the evidence supporting this section',
          },
        },
      },
    },
  },
};

const SYSTEM = `You write word-study briefs for Cheqer, a Bible study app used by a men's church group. You receive retrieved evidence about one Hebrew or Greek word: its lexeme, how translators render it, where it occurs across the canon, representative verses with English text, (where available) Septuagint data, and related passages from Second Temple writings (Josephus, Philo, 1 Enoch, Jubilees, and others).

Hard rules:
1. Every claim must be traceable to the evidence you were given. Cite the exact reference strings provided: "Gen 1:2" for Bible verses, "LXX Gen 1:2" style (LXX + work + ref) for Septuagint verses, and the given refs for Second Temple passages ("Ant. 1.27-33", "Opif. 26-27", "1 Enoch 6:1-4"). Each section's citations array lists the references that section relies on.
2. Never state anything the evidence does not support. You summarize what the witnesses say; you never generate doctrine, theological conclusions, or application beyond what the texts themselves show.
3. Second Temple passages are historical witnesses, not Scripture: always attribute them by author or work ("Philo writes...", "Jubilees retells..."), never blend them into scriptural claims. They were retrieved by meaning, so weigh whether each actually concerns this word's idea before using it.
4. If the evidence is thin for some period or claim, say so plainly.
5. Write for thoughtful laymen: plain, warm, precise English. Give the Hebrew/Greek word with transliteration on first use. No academic jargon without a one-phrase explanation.
6. Never mention your inputs or process. Do not write "the bundle", "the data provided", "this dataset", "the JSON", or similar. The reader sees only Scripture and translation data on their screen — speak of "the tagged occurrences", "the translators' glosses", "the verses", or simply state the facts with their citations.

Structure: 3-6 sections tracing how the word's usage develops (for Hebrew words typically: Torah, Prophets and Writings, the Septuagint's Greek rendering choices, how Second Temple writers use the idea, and where the Greek word then appears in the New Testament; adapt to the actual evidence). Keep the whole brief readable in about two minutes.`;

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

    const { strongs, refresh } = await req.json();
    if (!/^[HG]\d{4}$/.test(strongs ?? '')) return json({ error: 'bad strongs' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (!refresh) {
      const { data: cached } = await supabase
        .from('sod_briefs').select('brief, model, created_at')
        .eq('strongs', strongs).maybeSingle();
      if (cached) return json({ ...cached, cached: true });
    }

    const { data: bundle, error: bundleErr } = await supabase.rpc('study_bundle', {
      p_strongs: strongs,
    });
    if (bundleErr || !bundle?.lexeme) return json({ error: 'unknown lexeme' }, 404);

    // Second Temple witnesses by semantic retrieval (best effort: the brief
    // still writes from canon + LXX evidence if this arm is unavailable).
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiKey) {
      try {
        const gloss = String(bundle.lexeme.gloss ?? '').split('@')[0].split('»')[0];
        const field = `${bundle.lexeme.lemma ?? ''}: ${gloss}`;
        const embRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({ model: 'text-embedding-3-small', input: field }),
        });
        if (embRes.ok) {
          const embedding = (await embRes.json()).data[0].embedding as number[];
          const { data: witnesses } = await supabase.rpc('semantic_period_search', {
            p_embedding: JSON.stringify(embedding),
            p_corpora: ['Josephus', 'Philo', 'Second Temple'],
            p_k: 8,
          });
          bundle.second_temple_witnesses = ((witnesses as Array<Record<string, unknown>>) ?? []).map(
            (w) => ({
              work: w.work,
              ref: w.ref,
              excerpt: String(w.content_en ?? w.content ?? '').slice(0, 800),
            }),
          );
        }
      } catch {
        // leave the bundle without witnesses
      }
    }

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
        output_config: { format: { type: 'json_schema', schema: BRIEF_SCHEMA }, effort: 'medium' },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `Write the word-study brief for ${strongs} from this evidence:\n\n${JSON.stringify(bundle)}`,
        }],
      }),
    });
    const msg = await res.json();
    if (!res.ok) return json({ error: msg?.error?.message ?? 'model error' }, 502);
    if (msg.stop_reason === 'refusal') return json({ error: 'model declined' }, 502);
    if (msg.stop_reason === 'max_tokens') return json({ error: 'brief truncated' }, 502);

    const text = (msg.content as Array<{ type: string; text?: string }>)
      .find((b) => b.type === 'text')?.text;
    if (!text) return json({ error: 'empty response' }, 502);
    const brief = JSON.parse(text);

    await supabase.from('sod_briefs').upsert({ strongs, brief, model: msg.model });
    return json({ brief, model: msg.model, cached: false });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
