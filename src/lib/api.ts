export type AppUser = { id: string; email: string; user_metadata?: { full_name?: string } };
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "La requête n’a pas abouti.");
  return payload as T;
}
