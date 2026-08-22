// Entity brief: who this person or place is and why they matter, written
// under the sod-brief rule — strictly from retrieved evidence, a citation
// per claim, cached one per entity. The model summarizes the verses and
// witnesses; it never generates doctrine or unsupported biography.
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
      if (typeof o.work === 'string') out.add(`${o.work} ${o.ref}`);
    }
    if (typeof o.book === 'string' && o.chapter != null && o.verse != null) {
      out.add(`${o.book} ${o.chapter}:${o.verse}`);
    }
    for (const v of Object.values(o)) collectRefs(v, out);
  }
}

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'sections'],
  properties: {
    summary: { type: 'string', description: '2-3 sentence overview: who or what this is and why it matters in the biblical story' },
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

const SYSTEM = `You write person-and-place briefs for Cheqer, a Bible study app used by a men's church group. You receive retrieved evidence about one biblical person, place, or named thing: its curated identity data (era, family relations, name forms in Hebrew and Greek, tribal or regional setting), the full list of chapters where it is named with mention counts, SCENES (windows of English BSB verses around each appearance, sampled where the mentions concentrate, at least one per book), and (where available) related passages from Second Temple writings (Josephus, Philo, and others).

Hard rules:
1. Every claim must be traceable to the evidence you were given. Cite the exact reference strings provided: "Exo 4:14" style (3-letter book code, chapter:verse) for Bible verses and the given refs for Second Temple passages ("Ant. 15.380", "Opif. 26-27"). Each section's citations array lists the references that section relies on.
2. Write about what the person DOES and what happens to them: their acts, words, decisions, encounters, and turning points as the scenes show them. Quote short phrases from the verses. A brief that only describes where a name occurs has failed; the reader wants to know who this is and what they did.
3. Stay inside the scenes. They are windows, not the whole story: if an episode is not among them, do not narrate it from memory. You may note that the story continues in chapters listed in the distribution without describing what happens there.
4. Second Temple passages are historical witnesses, not Scripture: always attribute them by author or work ("Josephus records...", "Philo writes..."), never blend them into scriptural claims. They were retrieved by meaning, so weigh whether each actually concerns this person or place before using it.
5. Significance means significance in the text: the roles the person plays, the moments the story turns on them, the relationships that shape the narrative, and how later books refer back to them. Not devotional application, not doctrinal conclusions.
6. If the evidence is thin, say so plainly; for minor figures a short brief is the right brief.
7. Write for thoughtful laymen: plain, warm, precise English. Give the original-language name with its forms on first use.
8. Never mention your inputs or process. Do not write "the bundle", "the scenes provided", "this dataset", "the JSON", or similar. Speak of "the verses", "the passages", or simply state the facts with their citations.

Structure: for major figures, 3-6 sections following the arc of their story (who they are and how they enter; what they do, episode by episode as the passages show; their key words or encounters; how later books remember them; what the period witnesses add). For minor figures, one or two short sections that still say what they did. Keep the whole brief readable in about two minutes.`;

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

    const { ustrong } = await req.json();
    if (!/^[HG]\d{4}[A-Za-z]*$/.test(ustrong ?? '')) return json({ error: 'bad ustrong' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: cached } = await supabase
      .from('entity_briefs').select('brief, model, created_at')
      .eq('ustrong', ustrong).maybeSingle();
    if (cached) return json({ ...cached, cached: true });

    if (!(await gate(supabase, 'entity-brief', req, 6, 60))) {
      return json({ error: 'rate limit reached, try again later' }, 429);
    }

    const { data: bundle, error: bundleErr } = await supabase.rpc('entity_bundle', {
      p_ustrong: ustrong,
    });
    if (bundleErr || !bundle?.entity) return json({ error: 'unknown entity' }, 404);

    // Period witnesses by semantic retrieval (best effort: the brief still
    // writes from the canon evidence if this arm is unavailable).
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiKey) {
      try {
        const e = bundle.entity as Record<string, unknown>;
        const field = `${e.name}: ${e.description ?? e.etype ?? ''}`;
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
            p_k: 6,
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
        max_tokens: 12000,
        output_config: { format: { type: 'json_schema', schema: BRIEF_SCHEMA }, effort: 'medium' },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `Write the brief for ${ustrong} from this evidence:\n\n${JSON.stringify(bundle)}`,
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
    // Structural guarantee: citations must trace to the evidence bundle.
    const valid = new Set<string>();
    collectRefs(bundle, valid);
    const bundleText = JSON.stringify(bundle);
    for (const s of brief.sections ?? []) {
      s.citations = (s.citations ?? []).filter(
        (c: string) => valid.has(c) || bundleText.includes(c),
      );
    }

    await supabase.from('entity_briefs').upsert({ ustrong, brief, model: msg.model });
    return json({ brief, model: msg.model, cached: false });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
