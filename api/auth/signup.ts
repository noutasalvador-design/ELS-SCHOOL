import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "../_lib/db.js";
import { hashPassword, issueSession, methodNotAllowed } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) return res.status(503).json({ ok: false, message: "Le backend doit être configuré avec AUTH_SECRET dans Vercel." });
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (fullName.length < 2 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || password.length > 200) {
    return res.status(400).json({ ok: false, message: "Indique un nom, un e-mail valide et un mot de passe d’au moins 10 caractères." });
  }
  try {
    const result = await db.query(
      "insert into app_users(full_name,email,password_hash) values($1,$2,$3) returning id,email,full_name",
      [fullName, email, hashPassword(password)]
    );
    const user = result.rows[0];
    issueSession(res, user);
    return res.status(201).json({ ok: true, user: { id: user.id, email: user.email, user_metadata: { full_name: user.full_name } } });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") return res.status(409).json({ ok: false, message: "Un compte utilise déjà cette adresse e-mail." });
    console.error("Neon signup failed", (error as { code?: string })?.code);
    return res.status(500).json({ ok: false, message: "Création du compte impossible pour le moment." });
  }
}
