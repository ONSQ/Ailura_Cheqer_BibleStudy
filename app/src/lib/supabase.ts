import { createClient } from '@supabase/supabase-js';

// Client app uses the anon key + RLS only. Never put service keys here.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Supabase env vars missing; the data layer should have used the dev bridge instead.',
  );
}

export const supabase = createClient(url, anonKey);
