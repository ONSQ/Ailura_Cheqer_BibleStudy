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

  // Semantic field of the lemma: lemma, transliteration, glosses.
  const { data: lex } = await supa
    .from('lexemes')
    .select('lemma, translit, gloss, language')
    .eq('strongs', strongs)
    .maybeSingle();
  if (!lex) return json({ error: 'unknown lexeme' }, 404);

  const gloss = (lex.gloss ?? '').split('@')[0].split('»')[0];
  const field = `${lex.lemma ?? ''} (${lex.translit ?? ''}): ${gloss}`;

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
