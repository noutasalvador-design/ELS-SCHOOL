import type { VercelRequest, VercelResponse } from "@vercel/node";
import { currentUser, methodNotAllowed } from "../_lib/auth";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const user = await currentUser(req);
    return res.status(200).setHeader("Cache-Control", "no-store").json({ ok: true, user: user ? { id: user.id, email: user.email, user_metadata: { full_name: user.full_name } } : null });
  } catch { return res.status(503).json({ ok: false, user: null }); }
}
