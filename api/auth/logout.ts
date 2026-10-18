import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearSession, methodNotAllowed } from "../_lib/auth";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  clearSession(res);
  return res.status(200).json({ ok: true });
}
