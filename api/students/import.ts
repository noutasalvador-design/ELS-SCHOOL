import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { currentUser, methodNotAllowed } from "../_lib/auth.js";
import { db } from "../_lib/db.js";
import { recordSchoolAudit } from "../_lib/audit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ ok: false, message: "Session expirée." });
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, any> : {};
  if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 500) {
    return res.status(400).json({ ok: false, message: "Le fichier doit contenir entre 1 et 500 élèves." });
  }
  try {
    const membership = await db.query(
      "select s.id,s.academic_year,m.role from school_memberships m join schools s on s.id=m.school_id where m.user_id=$1 and m.active=true order by m.created_at limit 1",
      [user.id]
    );
    const school = membership.rows[0];
    if (!school) return res.status(404).json({ ok: false, message: "Aucun établissement associé." });
    if (!["school_director", "secretary"].includes(school.role)) return res.status(403).json({ ok: false, message: "Ton rôle ne permet pas d’importer des élèves." });
    const subscription = await db.query("select status,current_period_end from school_subscriptions where school_id=$1",[school.id]);
    const sub = subscription.rows[0];
    const valid = sub && ((sub.status === "active" && sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now()) || (sub.status === "trial" && sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now()));
    if (!valid) return res.status(402).json({ ok: false, message: "L’abonnement ou l’essai est expiré." });
    const client = await db.connect();
    let imported = 0;
    try {
      await client.query("begin");
      for (const row of body.rows) {
        const firstName = String(row?.first_name || "").trim().slice(0,120);
        const lastName = String(row?.last_name || "").trim().slice(0,120);
        if (!firstName || !lastName) throw new Error("INVALID_ROW");
        const number = String(row?.student_number || "").trim().slice(0,80) || ("ELS-" + new Date().getFullYear() + "-" + randomUUID().slice(0,6).toUpperCase());
        const gender = row?.gender === "F" || row?.gender === "M" ? row.gender : null;
        const className = String(row?.class_name || "").trim();
        let classId: string | null = null;
        if (className) {
          const cls = await client.query("select id from classes where school_id=$1 and lower(name)=lower($2) and academic_year=$3 limit 1",[school.id,className,school.academic_year]);
          if (!cls.rowCount) throw new Error("INVALID_CLASS");
          classId = cls.rows[0].id;
        }
        await client.query("insert into students(school_id,student_number,first_name,last_name,gender,class_id,status) values($1,$2,$3,$4,$5,$6,'active')",
          [school.id,number,firstName,lastName,gender,classId]);
        imported++;
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      if ((error as Error).message === "INVALID_ROW") return res.status(400).json({ok:false,message:"Chaque ligne doit avoir un prénom et un nom. Aucun élève n’a été importé."});
      if ((error as Error).message === "INVALID_CLASS") return res.status(400).json({ok:false,message:"Une classe indiquée est introuvable dans cette école. Aucun élève n’a été importé."});
      throw error;
    } finally { client.release(); }
    await recordSchoolAudit(user.id,user.email,school.id,"bulk_import_students",{count:imported});
    return res.status(201).json({ok:true,imported,message:imported+" élève(s) importé(s)."});
  } catch (error) {
    if ((error as {code?:string})?.code === "23505") return res.status(409).json({ok:false,message:"Un matricule existe déjà. Corrige le fichier et réessaie."});
    if ((error as Error).message.includes("SUBSCRIPTION_LIMIT_REACHED")) return res.status(409).json({ok:false,message:"La limite d’élèves du forfait est atteinte. Aucun élève n’a été importé."});
    console.error("Student CSV import failed",(error as {code?:string})?.code);
    return res.status(500).json({ok:false,message:"Import impossible. Vérifie le forfait et la base Neon."});
  }
}
