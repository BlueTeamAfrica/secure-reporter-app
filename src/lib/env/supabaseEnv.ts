let supabaseStartupLogged = false;

function requireEnv(name: string, value: string): string {
  const v = value.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function validateUrl(url: string): void {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL must start with http:// or https://");
  }
}

export function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  bucket: string;
} {
  const url = requireEnv("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL ?? "");
  const anonKey = requireEnv(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );
  const bucket = requireEnv(
    "EXPO_PUBLIC_SUPABASE_BUCKET",
    process.env.EXPO_PUBLIC_SUPABASE_BUCKET ?? "reports"
  );

  validateUrl(url);

  return {
    url: url.replace(/\/+$/, ""),
    anonKey,
    bucket,
  };
}

export function logSupabaseEnvOnce(): void {
  if (supabaseStartupLogged) return;
  supabaseStartupLogged = true;

  const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const rawBucket = process.env.EXPO_PUBLIC_SUPABASE_BUCKET?.trim() ?? "";
  const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  console.log("[supabase:env] startup check", {
    EXPO_PUBLIC_SUPABASE_URL: rawUrl || "(missing)",
    EXPO_PUBLIC_SUPABASE_BUCKET: rawBucket || "(missing)",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: rawKey ? "(set, hidden)" : "(missing)",
  });
}

