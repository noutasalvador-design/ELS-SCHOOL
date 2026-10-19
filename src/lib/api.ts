export type AppUser = {
  id: string;
  email: string;
  user_metadata?: { full_name?: string };
};

export async function api<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers,
    });
  } catch {
    throw new Error(
      "Impossible de joindre le serveur. Vérifie ta connexion Internet puis réessaie."
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : {};

  if (!response.ok || payload?.ok === false) {
    if (typeof payload?.message === "string" && payload.message) {
      throw new Error(payload.message);
    }

    throw new Error(
      "Erreur HTTP " +
        response.status +
        " sur " +
        path +
        ". Vérifie les journaux Runtime de Vercel."
    );
  }

  return payload as T;
}
