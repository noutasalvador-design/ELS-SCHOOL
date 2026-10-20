import type { VercelRequest, VercelResponse } from "@vercel/node";
import { currentUser, methodNotAllowed } from "./_lib/auth.js";
import { db } from "./_lib/db.js";

async function ensureAdminSchema() {
  await db.query(`
    create table if not exists platform_admin_audit (
      id bigserial primary key,
      actor_email text not null,
      action text not null,
      school_id uuid references schools(id) on delete set null,
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create index if not exists platform_admin_audit_created_idx on platform_admin_audit(created_at desc);
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
  `);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, "GET, POST");
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ ok: false, message: "Session expirée. Reconnecte-toi." });
  const allowedEmail = (process.env.ELS_PLATFORM_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!allowedEmail || user.email.toLowerCase() !== allowedEmail) {
    return res.status(403).json({ ok: false, message: "Accès réservé à l’administrateur de la plateforme." });
  }
  try {
    await ensureAdminSchema();
    if (req.method === "GET") {
      const [summary, schools, payments, audit, schoolActivity] = await Promise.all([
        db.query(`select
          (select count(*)::int from schools) as schools_total,
          (select count(*)::int from schools where status <> 'suspended') as schools_active,
          (select count(*)::int from app_users) as users_total,
          (select count(*)::int from students where status='active') as students_total,
          (select coalesce(sum(amount_xof),0)::bigint from school_payment_transactions where status='paid' and paid_at >= date_trunc('month',now())) as revenue_month_xof,
          (select count(*)::int from school_payment_transactions where status='pending') as payments_pending`),
        db.query(`select s.id,s.name,s.status as school_status,s.created_at,
          ss.plan_code,ss.status as subscription_status,ss.monthly_price_xof,ss.student_limit,ss.current_period_end,
          (select count(*)::int from students st where st.school_id=s.id and st.status='active') as active_students,
          (select count(*)::int from school_memberships m where m.school_id=s.id and m.active=true) as members_count
          from schools s left join school_subscriptions ss on ss.school_id=s.id
          order by s.created_at desc limit 500`),
        db.query(`select p.id,p.school_id,s.name as school_name,p.plan_code,p.amount_xof,p.currency,p.reference,p.status,p.created_at,p.paid_at
          from school_payment_transactions p join schools s on s.id=p.school_id
          order by p.created_at desc limit 100`),
        db.query(`select id,actor_email,action,school_id,details,created_at from platform_admin_audit order by created_at desc limit 100`),
        db.query("select l.id,l.actor_email,l.action,l.school_id,s.name as school_name,l.details,l.created_at from school_activity_log l join schools s on s.id=l.school_id order by l.created_at desc limit 100")
      ]);
      return res.status(200).json({ ok:true, isPlatformAdmin:true, summary:summary.rows[0], schools:schools.rows, payments:payments.rows, audit:audit.rows, schoolActivity:schoolActivity.rows });
    }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const action = typeof body.action === "string" ? body.action : "";
    const schoolId = typeof body.school_id === "string" ? body.school_id : "";
    if (!schoolId || !["suspendSchool","reactivateSchool"].includes(action)) {
      return res.status(400).json({ok:false,message:"Action ou établissement invalide."});
    }
    const client = await db.connect();
    try {
      await client.query("begin");
      const target = await client.query("select id,name from schools where id=$1 for update",[schoolId]);
      if (!target.rowCount) { await client.query("rollback"); return res.status(404).json({ok:false,message:"Établissement introuvable."}); }
      if (action === "suspendSchool") {
        await client.query("update schools set status='suspended' where id=$1",[schoolId]);
        await client.query("update school_subscriptions set status='suspended',updated_at=now() where school_id=$1",[schoolId]);
      } else {
        await client.query("update schools set status='active' where id=$1",[schoolId]);
        await client.query("update school_subscriptions set status=case when current_period_end > now() then 'active' else 'past_due' end,updated_at=now() where school_id=$1",[schoolId]);
      }
      await client.query("insert into platform_admin_audit(actor_email,action,school_id,details) values($1,$2,$3,$4::jsonb)",
        [user.email,action,schoolId,JSON.stringify({school_name:target.rows[0].name})]);
      await client.query("commit");
      return res.status(200).json({ok:true,message:action==="suspendSchool"?"Établissement suspendu.":"Établissement réactivé selon l’état de son abonnement."});
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  } catch (error) {
    console.error("Platform admin API failed",(error as {code?:string})?.code);
    return res.status(500).json({ok:false,message:"Impossible de charger l’administration. Vérifie les migrations Neon."});
  }
}
