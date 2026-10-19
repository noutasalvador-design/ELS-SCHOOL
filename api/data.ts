import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { db } from "./_lib/db.js";
import { currentUser, methodNotAllowed } from "./_lib/auth.js";

const planDefaults = [
  { code: "essentiel", name: "Essentiel", monthly_price_xof: 5000, student_limit: 100 },
  { code: "standard", name: "Standard", monthly_price_xof: 10000, student_limit: 300 },
  { code: "illimite", name: "Illimité", monthly_price_xof: 25000, student_limit: null },
];
function bad(res: VercelResponse, message: string, status = 400) { return res.status(status).json({ ok: false, message }); }
async function schoolFor(userId: string) {
  const result = await db.query(
    `select s.id,s.name,s.academic_year,m.role from school_memberships m join schools s on s.id=m.school_id
     where m.user_id=$1 and m.active=true order by m.created_at asc limit 1`, [userId]);
  return result.rows[0] ?? null;
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, "GET, POST");
  const user = await currentUser(req);
  if (!user) return bad(res, "Session expirée. Reconnecte-toi.", 401);
  try {
    if (req.method === "GET") {
      const action = String(req.query.action || "overview");
      if (action === "plans") {
        const result = await db.query("select code,name,monthly_price_xof,student_limit from subscription_plans where active=true order by monthly_price_xof");
        return res.status(200).json({ ok: true, plans: result.rows.length ? result.rows : planDefaults });
      }
      const school = await schoolFor(user.id);
      if (action === "overview") {
        if (!school) return res.status(200).json({ ok: true, school: null, students: [], classes: [], grades: [], payments: [], subscription: null, plans: planDefaults });
        const [students, classes, grades, payments, subscription, plans] = await Promise.all([
          db.query("select id,student_number,first_name,last_name,gender,class_id,status from students where school_id=$1 order by last_name,first_name", [school.id]),
          db.query("select id,name,level,academic_year from classes where school_id=$1 order by level", [school.id]),
          db.query("select id,student_id,subject,term,score,coefficient,comment,created_at from grades where school_id=$1 order by created_at desc limit 100", [school.id]),
          db.query("select id,student_id,receipt_number,amount_xof,payment_method,paid_at,note from fee_payments where school_id=$1 order by paid_at desc limit 100", [school.id]),
          db.query("select plan_code,status,monthly_price_xof,student_limit,current_period_end from school_subscriptions where school_id=$1", [school.id]),
          db.query("select code,name,monthly_price_xof,student_limit from subscription_plans where active=true order by monthly_price_xof")
        ]);
        return res.status(200).json({ ok: true, school: { id: school.id, name: school.name, academic_year: school.academic_year }, students: students.rows, classes: classes.rows, grades: grades.rows, payments: payments.rows, subscription: subscription.rows[0] ?? null, plans: plans.rows.length ? plans.rows : planDefaults });
      }
      if (!school) return bad(res, "Crée d’abord l’établissement.", 404);
      if (action === "attendance") {
        const date = String(req.query.date || new Date().toISOString().slice(0,10));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad(res, "Date invalide.");
        const rows = await db.query("select id,student_id,attendance_date,status,note from attendance where school_id=$1 and attendance_date=$2 order by created_at", [school.id,date]);
        return res.status(200).json({ ok:true, rows: rows.rows });
      }
      if (action === "bulletin") {
        const studentId = String(req.query.student_id || "");
        const term = String(req.query.term || "");
        const rows = await db.query("select id,student_id,subject,term,score,coefficient,comment,created_at from grades where school_id=$1 and student_id=$2 and term=$3 order by subject", [school.id,studentId,term]);
        return res.status(200).json({ ok:true, rows: rows.rows });
      }
      return bad(res, "Action inconnue.");
    }

    const body = req.body && typeof req.body === "object" ? req.body as Record<string, any> : {};
    const action = String(body.action || "");
    if (action === "createSchool") {
      const name = typeof body.school_name === "string" ? body.school_name.trim() : "";
      if (name.length < 3 || name.length > 120) return bad(res, "Le nom de l’établissement doit contenir entre 3 et 120 caractères.");
      if (await schoolFor(user.id)) return bad(res, "Ce compte est déjà associé à un établissement.", 409);
      const client = await db.connect();
      try {
        await client.query("begin");
        const slugBase = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60) || "ecole";
        const slug = slugBase + "-" + randomUUID().slice(0,8);
        const created = await client.query("insert into schools(name,slug) values($1,$2) returning id,name,academic_year", [name,slug]);
        const school = created.rows[0];
        await client.query("insert into school_memberships(school_id,user_id,role,active) values($1,$2,'school_director',true)", [school.id,user.id]);
        await client.query("insert into school_subscriptions(school_id,plan_code,status,monthly_price_xof,student_limit,current_period_start,current_period_end) values($1,'essentiel','trial',5000,100,now(),now()+interval '14 days') on conflict(school_id) do update set current_period_start=coalesce(school_subscriptions.current_period_start,now()),current_period_end=coalesce(school_subscriptions.current_period_end,now()+interval '14 days')", [school.id]);
        await client.query("commit");
        return res.status(201).json({ok:true,school});
      } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
    }
    const school = await schoolFor(user.id);
    if (!school) return bad(res, "Crée d’abord l’établissement.", 404);
    const trialCheck = await db.query("select status,current_period_end from school_subscriptions where school_id=$1", [school.id]);
    const currentSubscription = trialCheck.rows[0];
    if (currentSubscription?.status === "trial" && currentSubscription.current_period_end && new Date(currentSubscription.current_period_end).getTime() <= Date.now()) return bad(res, "Votre essai gratuit de 14 jours est terminé. Choisissez un abonnement dans la rubrique Abonnement pour continuer.", 402);
    if (school.role !== "school_director" && !["teacher","accountant","secretary"].includes(school.role)) return bad(res,"Accès refusé.",403);

    if (action === "updateAcademicYear") {
      if (school.role !== "school_director") return bad(res, "Seule la direction peut modifier l’année scolaire.", 403);
      const academicYear = String(body.academic_year || "").trim();
      if (!/^\d{4}-\d{4}$/.test(academicYear)) return bad(res, "Format invalide. Utilise par exemple 2026-2027.");
      const [start, end] = academicYear.split("-").map(Number);
      if (end !== start + 1) return bad(res, "L’année de fin doit suivre l’année de début.");
      const updated = await db.query("update schools set academic_year=$1 where id=$2 returning id,name,academic_year", [academicYear, school.id]);
      await db.query("update classes set academic_year=$1 where school_id=$2", [academicYear, school.id]);
      return res.status(200).json({ ok: true, school: updated.rows[0] });
    }
    if (action === "addStudent") {
      if (!["school_director","secretary"].includes(school.role)) return bad(res,"Ton rôle ne permet pas d’inscrire des élèves.",403);
      const studentNumber = String(body.student_number || "").trim();
      const firstName = String(body.first_name || "").trim();
      const lastName = String(body.last_name || "").trim();
      const gender = body.gender === "F" || body.gender === "M" ? body.gender : null;
      const classId = typeof body.class_id === "string" && body.class_id ? body.class_id : null;
      if (!studentNumber || !firstName || !lastName) return bad(res,"Matricule, prénom et nom sont obligatoires.");
      if (classId) {
        const classCheck = await db.query("select id from classes where id=$1 and school_id=$2",[classId,school.id]);
        if (!classCheck.rowCount) return bad(res,"La classe sélectionnée n’appartient pas à cet établissement.",403);
      }
      const result = await db.query("insert into students(school_id,student_number,first_name,last_name,gender,class_id,status) values($1,$2,$3,$4,$5,$6,'active') returning id", [school.id,studentNumber,firstName,lastName,gender,classId]);
      return res.status(201).json({ok:true,id:result.rows[0].id});
    }
    if (action === "addClass") {
      if (!["school_director","secretary"].includes(school.role)) return bad(res,"Ton rôle ne permet pas de créer des classes.",403);
      const name = String(body.name || "").trim();
      const level = String(body.level || "CI");
      if (!name || !["CI","CP","CE1","CE2","CM1","CM2"].includes(level)) return bad(res,"Nom ou niveau de classe invalide.");
      const result = await db.query("insert into classes(school_id,name,level,academic_year) values($1,$2,$3,$4) returning id", [school.id,name,level,school.academic_year]);
      return res.status(201).json({ok:true,id:result.rows[0].id});
    }
    if (action === "saveAttendance") {
      if (!["school_director","teacher","secretary"].includes(school.role)) return bad(res,"Ton rôle ne permet pas de gérer les présences.",403);
      if (!Array.isArray(body.rows) || body.rows.length > 300) return bad(res,"Liste de présences invalide.");
      const client = await db.connect();
      try {
        await client.query("begin");
        for (const row of body.rows) {
          const status = ["present","absent","late","excused"].includes(row.status) ? row.status : "present";
          const owned = await client.query("select id from students where id=$1 and school_id=$2 and status='active'",[row.student_id,school.id]);
          if (!owned.rowCount) throw new Error("STUDENT_SCOPE");
          await client.query(`insert into attendance(school_id,student_id,attendance_date,status,recorded_by) values($1,$2,$3,$4,$5)
            on conflict(school_id,student_id,attendance_date) do update set status=excluded.status,recorded_by=excluded.recorded_by`,
            [school.id,row.student_id,row.attendance_date,status,user.id]);
        }
        await client.query("commit");
        return res.status(200).json({ok:true});
      } catch(e) { await client.query("rollback"); if ((e as Error).message==="STUDENT_SCOPE") return bad(res,"Un élève n’appartient pas à cet établissement.",403); throw e; } finally { client.release(); }
    }
    if (action === "addGrade") {
      if (!["school_director","teacher"].includes(school.role)) return bad(res,"Ton rôle ne permet pas de saisir des notes.",403);
      const score = Number(body.score), coefficient = Number(body.coefficient);
      if (!body.student_id || !String(body.subject||"").trim() || !Number.isFinite(score) || score<0 || score>20 || !Number.isFinite(coefficient) || coefficient<=0) return bad(res,"Note ou coefficient invalide.");
      const student = await db.query("select id from students where id=$1 and school_id=$2",[body.student_id,school.id]);
      if (!student.rowCount) return bad(res,"Élève introuvable dans cet établissement.",403);
      await db.query("insert into grades(school_id,student_id,subject,term,score,coefficient,comment,recorded_by) values($1,$2,$3,$4,$5,$6,$7,$8)",
        [school.id,body.student_id,String(body.subject).trim(),String(body.term||"Trimestre 1"),score,coefficient,String(body.comment||"").trim()||null,user.id]);
      return res.status(201).json({ok:true});
    }
    if (action === "addPayment") {
      if (!["school_director","accountant"].includes(school.role)) return bad(res,"Ton rôle ne permet pas d’enregistrer des paiements.",403);
      const amount = Number(body.amount_xof);
      if (!body.student_id || !Number.isSafeInteger(amount) || amount<=0 || !["cash","mobile_money","bank_transfer","other"].includes(body.payment_method)) return bad(res,"Données de paiement invalides.");
      const student = await db.query("select id from students where id=$1 and school_id=$2",[body.student_id,school.id]);
      if (!student.rowCount) return bad(res,"Élève introuvable dans cet établissement.",403);
      const receipt = "ELS-" + new Date().toISOString().slice(0,10).replace(/-/g,"") + "-" + randomUUID().slice(0,6).toUpperCase();
      await db.query("insert into fee_payments(school_id,student_id,receipt_number,amount_xof,payment_method,note,recorded_by) values($1,$2,$3,$4,$5,$6,$7)",
        [school.id,body.student_id,receipt,amount,body.payment_method,String(body.note||"").trim()||null,user.id]);
      return res.status(201).json({ok:true,receipt});
    }
    return bad(res,"Action inconnue.");
  } catch (error) {
    const code = (error as {code?:string})?.code;
    if (code === "23505") return bad(res,"Cette référence existe déjà. Vérifie les informations saisies.",409);
    if (code === "P0001" || String((error as Error)?.message).includes("SUBSCRIPTION_LIMIT_REACHED")) return bad(res,"La limite d’élèves de ton forfait est atteinte. Choisis un forfait supérieur.",409);
    console.error("Neon data API failed", code || (error as Error)?.message);
    return res.status(500).json({ok:false,message:"Opération impossible. Vérifie la configuration de la base Neon."});
  }
}
