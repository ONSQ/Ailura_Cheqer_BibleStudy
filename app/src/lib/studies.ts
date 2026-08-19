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
