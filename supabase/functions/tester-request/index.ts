// "Get the app" requests from the web page. Stores the email and platform
// in tester_requests, then does what each store allows:
//   ios      -> adds the address to the TestFlight external group through
//               the App Store Connect API, which makes Apple send the invite.
//   android  -> Google has no API for email tester lists, so the reply carries
//               the Play opt-in link (PLAY_TEST_URL) for the page to show.
//               Leave it unset while the track is a closed test: the link only
//               works for addresses already on the Play tester list, so the
//               request stays "received" until the address is added by hand.
// Secrets: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY (the .p8 contents),
// ASC_BETA_GROUP_ID; PLAY_TEST_URL. Any of them missing leaves the request
// stored as "received" so nothing is lost while setup finishes.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SignJWT, importPKCS8 } from 'npm:jose@5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const CLIENT_KEY = 'sb_publishable_mPC9RUurQIxHzR6ESYwgPw_TRAhzBIs';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const ASC = 'https://api.appstoreconnect.apple.com/v1';

type Supa = ReturnType<typeof createClient>;

async function gate(supa: Supa, req: Request, perHour: number, perDay: number): Promise<boolean> {
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim().slice(0, 64);
    const { data, error } = await supa.rpc('ai_gate', {
      p_fn: 'tester-request', p_ip: ip, p_per_ip_hour: perHour, p_per_day: perDay,
    });
    if (error) return true; // fail open, as the AI endpoints do
    return data === true;
  } catch {
    return true;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Short-lived App Store Connect token signed with the team API key.
async function ascToken(): Promise<string | null> {
  const kid = Deno.env.get('ASC_KEY_ID');
  const iss = Deno.env.get('ASC_ISSUER_ID');
  const pem = Deno.env.get('ASC_PRIVATE_KEY');
  if (!kid || !iss || !pem) return null;
  const key = await importPKCS8(pem.replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
    .setIssuer(iss)
    .setIssuedAt()
    .setExpirationTime('10m')
    .setAudience('appstoreconnect-v1')
    .sign(key);
}

async function asc(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${ASC}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

// Add the address to the external group. A tester who already exists on
// the team (any app) is attached to the group instead of created again.
async function inviteToTestFlight(email: string): Promise<{ ok: boolean; detail: string }> {
  const group = Deno.env.get('ASC_BETA_GROUP_ID');
  const token = await ascToken();
  if (!token || !group) return { ok: false, detail: 'not configured' };

  const created = await asc(token, 'POST', '/betaTesters', {
    data: {
      type: 'betaTesters',
      attributes: { email },
      relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group }] } },
    },
  });
  if (created.status === 201) return { ok: true, detail: 'created' };

  if (created.status === 409) {
    const found = await asc(token, 'GET', `/betaTesters?filter[email]=${encodeURIComponent(email)}&limit=1`);
    const id = (found.data as { data?: { id: string }[] })?.data?.[0]?.id;
    if (!id) return { ok: false, detail: `exists but not found: ${JSON.stringify(found.data).slice(0, 200)}` };
    const linked = await asc(token, 'POST', `/betaGroups/${group}/relationships/betaTesters`, {
      data: [{ type: 'betaTesters', id }],
    });
    if (linked.status === 204) return { ok: true, detail: 'added existing tester' };
    // Apple answers 409 when the tester is already in the group; confirm
    // that is the reason before calling it a failure.
    const groups = await asc(token, 'GET', `/betaTesters/${id}/betaGroups?limit=200`);
    const inGroup = ((groups.data as { data?: { id: string }[] })?.data ?? []).some((g) => g.id === group);
    if (inGroup) return { ok: true, detail: 'already in group' };
    return { ok: false, detail: `link ${linked.status}: ${JSON.stringify(linked.data).slice(0, 300)}` };
  }
  return { ok: false, detail: `create ${created.status}: ${JSON.stringify(created.data).slice(0, 200)}` };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.headers.get('apikey') !== CLIENT_KEY && !req.headers.get('authorization')) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let body: { email?: unknown; platform?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;
  if (!EMAIL_RE.test(email) || email.length > 320 || !platform) {
    return json({ error: 'Enter a valid email address and choose a phone.' }, 400);
  }

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  if (!(await gate(supa, req, 5, 200))) {
    return json({ error: 'Too many requests from this connection. Try again in an hour.' }, 429);
  }

  let status = 'received';
  let detail: string | null = null;
  let url: string | null = null;

  if (platform === 'ios') {
    const r = await inviteToTestFlight(email);
    status = r.ok ? 'invited' : r.detail === 'not configured' ? 'received' : 'failed';
    detail = r.detail;
  } else {
    url = Deno.env.get('PLAY_TEST_URL') ?? null;
    status = url ? 'linked' : 'received';
  }

  const { error } = await supa
    .from('tester_requests')
    .upsert({ email, platform, status, detail, updated_at: new Date().toISOString() }, { onConflict: 'email,platform' });
  if (error) console.error('tester_requests upsert failed', error.message);

  // The page never sees the failure detail; the row keeps it for follow-up.
  return json({ ok: true, status: status === 'failed' ? 'received' : status, url });
});
