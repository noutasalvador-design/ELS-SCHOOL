import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const SASPAY_API_BASE = "https://api.saspay.me/api/v1";
export const PLAN_CATALOG = {
  essentiel: { code: "essentiel", name: "Essentiel", amount: 5000, studentLimit: 100 },
  standard: { code: "standard", name: "Standard", amount: 10000, studentLimit: 300 },
  illimite: { code: "illimite", name: "Illimité", amount: 25000, studentLimit: null },
} as const;

export type PlanCode = keyof typeof PLAN_CATALOG;

export function serverSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

export async function authenticatedUser(
  admin: SupabaseClient,
  token: string,
): Promise<User | null> {
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

export function methodNotAllowed(res: VercelResponse, method: string) {
  res.setHeader("Allow", method);
  return res.status(405).json({ ok: false, message: "Méthode non autorisée." });
}

export function publicOrigin(req: VercelRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || "https";
  if (typeof host === "string" && host.length > 0) return `${protocol}://${host}`;
  throw new Error("Public site URL is not configured");
}

