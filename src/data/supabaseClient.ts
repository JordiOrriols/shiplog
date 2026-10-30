import {
  createSharedSupabaseClient,
  redirectAuthCallback,
  takeAuthCallback,
} from "@jordiorriols/ui";

const redirecting = redirectAuthCallback("shiplog");
export const authCallback = redirecting ? null : takeAuthCallback();
const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as
  string | undefined;
export const supabase =
  url && key && !redirecting ? createSharedSupabaseClient(url, key) : null;
