import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Client app uses the anon key + RLS only. Never put service keys here.
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey;

if (!url || !anonKey) {
  throw new Error('Supabase env vars missing (EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY).');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Web uses localStorage automatically; native needs AsyncStorage.
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
