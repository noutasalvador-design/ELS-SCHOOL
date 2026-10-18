export type AppUser = { id: string; email: string; user_metadata?: { full_name?: string } };
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const response = await fetch(path, { ...options, credentials: "same-origin", headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "La requête n’a pas abouti.");
  return payload as T;
}
