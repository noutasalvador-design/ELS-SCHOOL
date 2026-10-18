import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { currentUser } from "../_lib/auth";
import { db } from "../_lib/db";
import { methodNotAllowed, PLAN_CATALOG, publicOrigin, SASPAY_API_BASE, type PlanCode } from "../_lib/saspay";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  const apiKey = process.env.SASPAY_API_KEY;
  const webhookSecret = process.env.SASPAY_WEBHOOK_SECRET || process.env.SASPAY_CALLBACK_SECRET;
  if (!apiKey || !webhookSecret) return res.status(503).json({ ok:false, message:"SasPay n’est pas encore configuré dans les variables privées de Vercel." });
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ok:false,message:"Session expirée. Reconnecte-toi."});
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const schoolId = typeof body.school_id === "string" ? body.school_id : "";
  const planCode = typeof body.plan_code === "string" ? body.plan_code as PlanCode : null;
  if (!schoolId || !planCode || !(planCode in PLAN_CATALOG)) return res.status(400).json({ok:false,message:"Établissement ou forfait invalide."});
  const plan = PLAN_CATALOG[planCode];
  try {
    const membership = await db.query("select m.role,s.id,s.name from school_memberships m join schools s on s.id=m.school_id where m.school_id=$1 and m.user_id=$2 and m.active=true limit 1",[schoolId,user.id]);
    if (!membership.rowCount || membership.rows[0].role !== "school_director") return res.status(403).json({ok:false,message:"Seule la direction de l’établissement peut payer l’abonnement."});
    const reference = "ELS-SCHOOL-" + randomUUID();
    const payment = await db.query(
      "insert into school_payment_transactions(school_id,created_by,plan_code,amount_xof,currency,reference,status,payload) values($1,$2,$3,$4,'XOF',$5,'pending',$6::jsonb) returning id",
      [schoolId,user.id,plan.code,plan.amount,reference,JSON.stringify({purpose:"school_subscription",plan_code:plan.code})]
    );
    let origin: string;
    try { origin = publicOrigin(req); } catch { return res.status(503).json({ok:false,message:"Configure NEXT_PUBLIC_SITE_URL dans Vercel."}); }
    const response = await fetch(`${SASPAY_API_BASE}/checkout-sessions/`, {
      method:"POST",
      headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({
        amount:plan.amount.toFixed(2),currency:"XOF",customer_email:user.email,
        customer_name:user.full_name || membership.rows[0].name,country:"BJ",
        description:`ELS SCHOOL MANAGER — forfait ${plan.name} (30 jours)`,reference,
        return_url:`${origin}/?paiement=retour`,
        metadata:{local_reference:reference,school_id:schoolId,plan_code:plan.code,purpose:"school_subscription"}
      }),cache:"no-store"
    });
    const result = await response.json().catch(()=>({})) as Record<string, any>;
    const session = result?.data && typeof result.data === "object" ? result.data : result;
    const checkoutUrl = [result?.checkout_url,session?.checkout_url,session?.checkoutUrl,session?.payment_url,session?.url].find(v=>typeof v==="string") as string|undefined;
    const sessionId = [result?.id,session?.id,session?.session_id,session?.checkout_session_id].find(v=>typeof v==="string") as string|undefined;
    if (!response.ok || !checkoutUrl || !sessionId || !/^https:\/\//i.test(checkoutUrl)) {
      await db.query("update school_payment_transactions set status='failed',payload=$2::jsonb where id=$1",[payment.rows[0].id,JSON.stringify({error_code:response.status,response_fields:Object.keys(result||{})})]);
      console.error("SasPay checkout creation failed",{http_status:response.status,response_fields:Object.keys(result||{})});
      return res.status(502).json({ok:false,message:response.status===403?"SasPay a refusé la clé API. Vérifie les autorisations d’encaissement.":"SasPay n’a pas pu créer le lien de paiement. Vérifie les identifiants du compte marchand."});
    }
    await db.query("update school_payment_transactions set provider_session_id=$2,payload=$3::jsonb where id=$1",[payment.rows[0].id,sessionId,JSON.stringify({checkout_session_id:sessionId,checkout_status:session.status??result.status??"PENDING"})]);
    return res.status(200).json({ok:true,checkout_url:checkoutUrl});
  } catch (error) {
    console.error("Neon SasPay start failed",(error as {code?:string})?.code);
    return res.status(500).json({ok:false,message:"Impossible de préparer le paiement. Vérifie que la migration Neon des paiements a été exécutée."});
  }
}
