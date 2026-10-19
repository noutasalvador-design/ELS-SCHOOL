import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "./_lib/db.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    await db.query("SELECT 1");
    return res.status(200).json({ ok: true, service: "els-school-manager", database: "connected" });
  } catch (error) {
    // Do not return connection strings or raw database errors to public clients.
    console.error("Health check database connection failed:", error);
    return res.status(503).json({ ok: false, service: "els-school-manager", database: "unavailable" });
  }
}
