import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

const noopPromise = () => Promise.resolve({ data: {}, error: null });
const mock = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signUp: noopPromise,
    signInWithPassword: noopPromise,
    signOut: noopPromise,
  },
};

export const supabase = (url && key) ? createClient(url, key) : mock;
