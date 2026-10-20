import { db } from "./db.js";

let schemaReady: Promise<void> | null = null;
async function ensureSchema() {
  if (!schemaReady) schemaReady = db.query(`
    create table if not exists school_activity_log (
      id bigserial primary key,
      school_id uuid not null references schools(id) on delete cascade,
      actor_user_id uuid references app_users(id) on delete set null,
      actor_email text not null,
      action text not null,
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create index if not exists school_activity_log_school_created_idx on school_activity_log(school_id,created_at desc);
  `).then(() => undefined).catch(error => { schemaReady = null; throw error; });
  await schemaReady;
}

export async function recordSchoolAudit(userId: string, email: string, schoolId: string, action: string, details: Record<string, unknown> = {}) {
  try {
    await ensureSchema();
    await db.query(
      "insert into school_activity_log(school_id,actor_user_id,actor_email,action,details) values($1,$2,$3,$4,$5::jsonb)",
      [schoolId,userId,email,action,JSON.stringify(details)]
    );
  } catch (error) {
    // Logging must not turn a successfully saved school operation into a failed response.
    console.error("School activity audit unavailable",(error as {code?:string})?.code);
  }
}
