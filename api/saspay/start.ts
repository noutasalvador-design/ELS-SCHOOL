import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  authenticatedUser,
  bearerToken,
  methodNotAllowed,
  PLAN_CATALOG,
  publicOrigin,
  serverSupabase,
  SASPAY_API_BASE,
  type PlanCode,
} from "./_lib/saspay";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");

  const apiKey = process.env.SASPAY_API_KEY;
  const webhookSecret = process.env.SASPAY_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    return res.status(503).json({
      ok: false,
      message: "SasPay n’est pas encore configuré dans les variables privées de Vercel.",
    });
  }

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ ok: false, message: "Connexion requise." });

  let admin;
  try {
    admin = serverSupabase();
  } catch {
    return res.status(503).json({ ok: false, message: "Le backend de facturation n’est pas configuré." });
  }

  const user = await authenticatedUser(admin, token);
  if (!user) return res.status(401).json({ ok: false, message: "Session expirée. Reconnecte-toi." });

  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const schoolId = typeof body.school_id === "string" ? body.school_id : "";
  const planCode = typeof body.plan_code === "string" ? body.plan_code as PlanCode : null;
  if (!schoolId || !planCode || !(planCode in PLAN_CATALOG)) {
    return res.status(400).json({ ok: false, message: "Établissement ou forfait invalide." });
  }
  const plan = PLAN_CATALOG[planCode];

  const { data: membership, error: membershipError } = await admin
    .from("school_memberships")
    .select("school_id,role,active")
    .eq("school_id", schoolId)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (membershipError) return res.status(500).json({ ok: false, message: "Impossible de vérifier les droits de cet établissement." });
  if (!membership || membership.role !== "school_director") {
    return res.status(403).json({ ok: false, message: "Seule la direction de l’établissement peut payer l’abonnement." });
  }

  const { data: school, error: schoolError } = await admin
    .from("schools")
    .select("id,name")
    .eq("id", schoolId)
    .maybeSingle();
  if (schoolError || !school) return res.status(404).json({ ok: false, message: "Établissement introuvable." });

  const localReference = `ELS-SCHOOL-${randomUUID()}`;
  const { data: payment, error: insertError } = await admin
    .from("school_payment_transactions")
    .insert({
      school_id: schoolId,
      created_by: user.id,
      plan_code: plan.code,
      amount_xof: plan.amount,
      currency: "XOF",
      reference: localReference,
      status: "pending",
      payload: { purpose: "school_subscription", plan_code: plan.code },
    })
    .select("id")
    .single();

  if (insertError || !payment) {
    console.error("ELS SasPay transaction insert failed", insertError?.code);
    return res.status(500).json({ ok: false, message: "Impossible de préparer le paiement. Vérifie que la migration SasPay a été exécutée." });
  }

  try {
    const origin = publicOrigin(req);
    const response = await fetch(`${SASPAY_API_BASE}/checkout-sessions/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        amount: plan.amount.toFixed(2),
        currency: "XOF",
        customer_email: user.email,
        customer_name: user.user_metadata?.full_name || school.name,
        country: "BJ",
        description: `ELS SCHOOL MANAGER — forfait ${plan.name} (30 jours)`,
        reference: localReference,
        return_url: `${origin}/?paiement=retour`,
        metadata: {
          local_reference: localReference,
          school_id: schoolId,
          plan_code: plan.code,
          purpose: "school_subscription",
        },
      }),
      cache: "no-store",
    });

    const result = await response.json().catch(() => ({})) as Record<string, any>;
    const session = result?.data && typeof result.data === "object" ? result.data : result;
    const checkoutUrl = [result?.checkout_url, session?.checkout_url, session?.checkoutUrl, session?.payment_url, session?.url]
      .find((value) => typeof value === "string") as string | undefined;
    const sessionId = [result?.id, session?.id, session?.session_id, session?.checkout_session_id]
      .find((value) => typeof value === "string") as string | undefined;

    if (!response.ok || !checkoutUrl || !sessionId || !/^https:\/\//i.test(checkoutUrl)) {
      await admin.from("school_payment_transactions").update({
        status: "failed",
        payload: { error_code: response.status, response_fields: Object.keys(result || {}) },
      }).eq("id", payment.id);
      console.error("ELS SasPay checkout creation failed", { http_status: response.status, response_fields: Object.keys(result || {}) });
      return res.status(502).json({
        ok: false,
        message: response.status === 403
          ? "SasPay a refusé la clé API. Vérifie que son périmètre autorise les encaissements (PAYIN ou BOTH)."
          : "SasPay n’a pas pu créer le lien de paiement. Vérifie les identifiants et la configuration du compte marchand.",
      });
    }

    const { error: updateError } = await admin.from("school_payment_transactions").update({
      provider_session_id: sessionId,
      payload: { checkout_session_id: sessionId, checkout_status: session?.status ?? result?.status ?? "PENDING" },
    }).eq("id", payment.id);
    if (updateError) {
      console.error("ELS SasPay session persistence failed", updateError.code);
      return res.status(500).json({ ok: false, message: "Le lien a été créé mais son suivi n’a pas été enregistré. Contacte le support avant de payer." });
    }

    return res.status(200).json({ ok: true, checkout_url: checkoutUrl });
  } catch {
    await admin.from("school_payment_transactions").update({ status: "failed" }).eq("id", payment.id);
    return res.status(502).json({ ok: false, message: "Connexion à SasPay impossible. Réessaie dans quelques instants." });
  }
}
