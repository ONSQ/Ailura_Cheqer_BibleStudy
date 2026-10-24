/**
 * Auth + shared word studies. Always Supabase (never the dev bridge):
 * RLS gives each signed-in member his own rows plus anything shared.
 */
import { APP_URL } from './share';
import { supabase } from './supabase';

export interface WordStudy {
  id: number;
  owner: string;
  strongs: string | null;
  ref: string | null;
  title: string | null;
  notes: string | null;
  is_shared: boolean;
  created_at: string;
}

export async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  // Confirmation links should land on the deployed app, or wherever the
  // user is signing up from during development, never a hardcoded host.
  const redirectTo =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : APP_URL;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Erase the signed-in account: the delete_my_account RPC removes the
 * user's studies, any mailing-list row under the same address, and the
 * auth user. The server session is gone with it, so only the local one
 * is cleared here.
 */
export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}

/**
 * The signed-in user's own saved study of one word, if there is one, so the
 * Save button can say "Saved" on every visit instead of saving again.
 */
export async function findMyStudy(strongs: string): Promise<WordStudy | null> {
  const owner = await getUserId();
  if (!owner) return null;
  const { data, error } = await supabase
    .from('word_studies')
    .select('*')
    .eq('owner', owner)
    .eq('strongs', strongs)
    .is('ref', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface UsageReport {
  generated_at: string;
  totals: Record<
    | 'accounts' | 'accounts_active_7d' | 'accounts_active_30d' | 'accounts_new_30d'
    | 'email_signups' | 'email_signups_30d' | 'tester_requests' | 'tester_requests_30d'
    | 'studies' | 'studies_30d' | 'studies_published'
    | 'ai_requests_7d' | 'ai_requests_30d' | 'ai_requests_all' | 'ai_people_7d' | 'ai_people_30d'
    | 'word_briefs' | 'entity_briefs',
    number
  >;
  ai_by_feature_30d: { feature: string; requests: number }[];
  weeks: {
    week_of: string;
    ai_requests: number;
    ai_people: number;
    new_accounts: number;
    new_signups: number;
    studies: number;
  }[];
  accounts: {
    email: string;
    joined: string;
    last_seen: string | null;
    confirmed: boolean;
    studies: number;
    published: number;
  }[];
  email_signups: { email: string; joined: string; source: string | null; has_account: boolean }[];
  tester_requests: { email: string; platform: 'ios' | 'android'; status: string; requested: string }[];
}

/** True only for an account listed in app_admins (checked on the server). */
export async function isAppAdmin(): Promise<boolean> {
  if (!(await getUserId())) return false;
  const { data, error } = await supabase.rpc('is_app_admin');
  if (error) return false;
  return data === true;
}

/** The owner's usage report. The server refuses every other account. */
export async function getUsageReport(): Promise<UsageReport> {
  const { data, error } = await supabase.rpc('usage_report');
  if (error) throw error;
  return data as UsageReport;
}

export async function getStudy(id: number): Promise<WordStudy | null> {
  const { data, error } = await supabase
    .from('word_studies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** "3d ago" style relative dates for study cards. */
export function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}

export async function listStudies(): Promise<WordStudy[]> {
  const { data, error } = await supabase
    .from('word_studies')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createStudy(input: {
  strongs?: string;
  ref?: string;
  title: string;
  notes?: string;
  is_shared?: boolean;
}): Promise<WordStudy> {
  const { data, error } = await supabase
    .from('word_studies')
    .insert({
      strongs: input.strongs ?? null,
      ref: input.ref ?? null,
      title: input.title,
      notes: input.notes ?? '',
      is_shared: input.is_shared ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStudy(
  id: number,
  patch: Partial<Pick<WordStudy, 'title' | 'notes' | 'is_shared'>>,
): Promise<WordStudy> {
  const { data, error } = await supabase
    .from('word_studies')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStudy(id: number) {
  const { error } = await supabase.from('word_studies').delete().eq('id', id);
  if (error) throw error;
}
