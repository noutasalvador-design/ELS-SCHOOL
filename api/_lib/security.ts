import { createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "./db.js";

let schemaReady: Promise<void> | null = null;
async function ensureSchema() {
  if (!schemaReady) schemaReady = db.query(`
    create table if not exists auth_rate_limits (
      id bigserial primary key,
      action text not null,
      ip_hash text not null,
      identity_hash text not null,
      created_at timestamptz not null default now()
    );
    create index if not exists auth_rate_limits_lookup_idx on auth_rate_limits(action,ip_hash,identity_hash,created_at desc);
    delete from auth_rate_limits where created_at < now() - interval '2 days';
  `).then(() => undefined).catch(error => { schemaReady = null; throw error; });
  await schemaReady;
}
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function enforceAuthRateLimit(req: VercelRequest, res: VercelResponse, action: "login" | "signup", identity: string) {
  try {
    await ensureSchema();
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (typeof forwarded === "string" ? forwarded.split(",")[0] : Array.isArray(forwarded) ? forwarded[0] : "") || "unknown";
    const ipHash = digest(ip.trim().slice(0, 100));
    const identityHash = digest(identity.trim().toLowerCase().slice(0, 254));
    const result = await db.query(
      "select count(*)::int as attempts from auth_rate_limits where action=$1 and created_at > now()-interval '15 minutes' and (ip_hash=$2 or identity_hash=$3)",
      [action, ipHash, identityHash]
    );
    const attempts = Number(result.rows[0]?.attempts || 0);
    const limit = action === "login" ? 10 : 5;
    if (attempts >= limit) {
      res.setHeader("Retry-After", "900");
      res.setHeader("Cache-Control", "no-store");
      res.status(429).json({ok:false,message:"Trop de tentatives. Attends 15 minutes avant de réessayer."});
      return false;
    }
    await db.query("insert into auth_rate_limits(action,ip_hash,identity_hash) values($1,$2,$3)",[action,ipHash,identityHash]);
    return true;
  } catch (error) {
    console.error("Auth rate limit unavailable",(error as {code?:string})?.code);
    res.status(503).json({ok:false,message:"La protection de connexion est indisponible. Réessaie dans un instant."});
    return false;
  }
}

export async function clearAuthRateLimit(req: VercelRequest, action: "login" | "signup", identity: string) {
  try {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (typeof forwarded === "string" ? forwarded.split(",")[0] : Array.isArray(forwarded) ? forwarded[0] : "") || "unknown";
    await ensureSchema();
    await db.query("delete from auth_rate_limits where action=$1 and (ip_hash=$2 or identity_hash=$3)",
      [action,digest(ip.trim().slice(0,100)),digest(identity.trim().toLowerCase().slice(0,254))]);
  } catch { /* Never turn a successful authentication into a failure. */ }
}
