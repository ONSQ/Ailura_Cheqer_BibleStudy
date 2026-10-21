// Cheqer front page. Three things live here: the tap-a-word sample (real
// rows from the app's lexicon, copied in so the page needs no API call), the
// letters form (the same consent-gated capture_email RPC the app uses, with
// the public key the app ships), and the app links, which move to
// app.cheqer.io once that name is live.

const APP_URL = 'https://app.cheqer.io';
const SUPABASE_URL = 'https://sprykzqdpybiyqzbiybr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mPC9RUurQIxHzR6ESYwgPw_TRAhzBIs';

// Genesis 1:1, from lexicon_entries and word_forms() on 2026-10-20.
const WORDS = {
  bara: {
    strongs: 'H1254', lemma: 'בָּרָא', pron: 'ba·Ra', gloss: 'to create',
    root: 'ברא, itself a root',
    family: 'בְּרִיאָה (a creation)',
    forms: 'Qal 39 · Niphal 10 · Piel 5 · Hiphil 1',
    lxx: 'ποιέω (make) 18 · κτίζω (create) 16',
    senses: 'BDB: shape, create\n[Qal] shape, fashion, create\n[Niphal] be created; of birth; of something new, astonishing\n[Piel] cut down, cut out',
    source: 'Brown-Driver-Briggs (1906), via OpenScriptures · forms from the STEP Bible tagging',
  },
  elohim: {
    strongs: 'H0430', lemma: 'אֱלֹהִים', pron: "'E·lo·Him", gloss: 'God',
    root: 'אלה',
    family: 'אֵל (god) · אֱלֹהַּ (god)',
    forms: 'noun, masculine plural · 2,603 occurrences',
    lxx: 'θεός (God) 2,026 · κύριος (Lord) 1,233',
    senses: 'BDB: n.m.pl.\n1. plural in number: rulers, judges; divine ones; angels; gods\n2. plural intensive: god or goddess; godlike one; God\n3. הָאֱלֹהִים the (true) God',
    source: 'Brown-Driver-Briggs (1906), via OpenScriptures',
  },
  shamayim: {
    strongs: 'H8064', lemma: 'שָׁמַיִם', pron: 'sha·Ma·yim', gloss: 'heaven',
    root: 'שׁמה',
    family: 'none listed',
    forms: 'noun, masculine, only in the plural · 421 occurrences',
    lxx: 'οὐρανός (heaven) 384',
    senses: 'BDB: heavens, sky\n1. the visible heavens, sky, where the stars are\n2. as the abode of God\n3. personified in various relations',
    source: 'Brown-Driver-Briggs (1906), via OpenScriptures',
  },
};

function showWord(key, button) {
  const w = WORDS[key];
  const sheet = document.getElementById('word-sheet');
  if (!w || !sheet) return;
  document.querySelectorAll('.word').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('ws-lemma', w.lemma);
  set('ws-pron', `${w.pron} · ${w.strongs}`);
  set('ws-gloss', w.gloss);
  set('ws-root', w.root);
  set('ws-family', w.family);
  set('ws-forms', w.forms);
  set('ws-lxx', w.lxx);
  set('ws-senses', w.senses);
  set('ws-source', w.source);
  const link = document.getElementById('ws-link');
  if (link) link.href = `${APP_URL}/study/${w.strongs}`;
  sheet.hidden = false;
}

document.querySelectorAll('.word').forEach((b) => {
  b.addEventListener('click', () => showWord(b.dataset.word, b));
});

// ------------------------------------------------------------ letters
const form = document.getElementById('letter-form');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('letter-email');
    const consent = document.getElementById('letter-consent');
    const status = document.getElementById('letter-status');
    const value = (email.value || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(value)) { status.textContent = 'Please enter a valid email address.'; email.focus(); return; }
    if (!consent.checked) { status.textContent = 'Tick the box so we know you want the letters.'; consent.focus(); return; }
    status.textContent = 'Sealing the letter…';
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/capture_email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ p_email: value, p_consent: true, p_source: 'cheqer.io' }),
      });
      const ok = res.ok && (await res.json()) === true;
      status.textContent = ok ? 'You are on the list. Thank you for searching with us.' : 'That did not go through. Try again in a moment.';
      if (ok) form.reset();
    } catch {
      status.textContent = 'That did not go through. Try again in a moment.';
    }
  });
}
