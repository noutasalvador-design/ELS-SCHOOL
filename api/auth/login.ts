import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "../_lib/db";
import { issueSession, methodNotAllowed, verifyPassword } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return res.status(400).json({ ok: false, message: "E-mail et mot de passe obligatoires." });
  try {
    const result = await db.query("select id,email,full_name,password_hash from app_users where email=$1", [email]);
    const row = result.rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) return res.status(401).json({ ok: false, message: "E-mail ou mot de passe incorrect." });
    issueSession(res, row);
    return res.status(200).json({ ok: true, user: { id: row.id, email: row.email, user_metadata: { full_name: row.full_name } } });
  } catch (error) {
    console.error("Neon login failed", (error as { code?: string })?.code);
    return res.status(503).json({ ok: false, message: "Connexion impossible. Vérifie la configuration de la base Neon." });
  }
}
