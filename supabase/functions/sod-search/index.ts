// Sod semantic search: given a lexeme, find conceptually related passages
// in the untagged period witnesses (Josephus, Philo, Second Temple
// apocrypha). The lexeme's semantic field (lemma + glosses) is embedded
// and matched against pre-embedded passages via pgvector. This is the
// semantic arm of hybrid retrieval; exact lemma matches in tagged corpora
// (LXX, Targum) come from period_usage.
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.headers.get('apikey') !== CLIENT_KEY && !req.headers.get('authorization')) {
    return json({ error: 'unauthorized' }, 401);
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return json({ error: 'semantic search not configured yet' }, 503);

  const { strongs, k } = await req.json();
  if (typeof strongs !== 'string' || !/^[HG]\d{4}$/.test(strongs)) {
    return json({ error: 'bad strongs' }, 400);
  }

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  if (!(await gate(supa, 'sod-search', req, 60, 2000))) {
    return json({ error: 'rate limit reached, try again later' }, 429);
  }

  // Semantic field of the lemma: the lemma plus its distinct gloss senses
  // across all occurrences, so the embedding covers the word's whole range
  // (λόγος: word, account, saying...) rather than a single head gloss.
  const { data: lex } = await supa
    .from('lexemes')
    .select('lemma, gloss, language')
    .eq('strongs', strongs)
    .maybeSingle();
  if (!lex) return json({ error: 'unknown lexeme' }, 404);

  const STOP = new Set(['and', 'the', 'a', 'of', 'my', 'his', 'your', 'their', 'i', 'he', 'you', 'they', 'who', 'm', 're', 'y', 'have', 'been', 'were', 'was', 'are', 'is', 'to', 'about']);
  const clean = (g: string) =>
    g
      .split('@')[0]
      .split('»')[0]
      .replace(/[\[\]\/,]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOP.has(w.toLowerCase()))
      .join(' ');

  const { data: glosses } = await supa.rpc('gloss_distribution', { p_strongs: strongs });
  const senses = [
    ...new Set(
      [...((glosses as { gloss: string }[]) ?? []).map((g) => clean(g.gloss)), clean(lex.gloss ?? '')]
        .filter(Boolean),
    ),
  ].slice(0, 8);
  const field = `${lex.lemma ?? ''}: ${senses.join(', ')}`;

  const embRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: field }),
  });
  if (!embRes.ok) return json({ error: `embedding failed: ${embRes.status}` }, 502);
  const embedding = (await embRes.json()).data[0].embedding as number[];

  const { data, error } = await supa.rpc('semantic_period_search', {
    p_embedding: JSON.stringify(embedding),
    p_corpora: ['Josephus', 'Philo', 'Second Temple'],
    p_k: Math.min(Number(k) || 6, 12),
  });
  if (error) return json({ error: error.message }, 500);
  return json({ field, results: data });
});
