import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PLAN_CATALOG, serverSupabase, SASPAY_API_BASE } from "./_lib/saspay";

export const config = { api: { bodyParser: false } };

async function rawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function verifySignature(timestamp: string, raw: string, signature: string, secret: string): boolean {
  if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }

  const secret = process.env.SASPAY_WEBHOOK_SECRET || process.env.SASPAY_CALLBACK_SECRET;
  const apiKey = process.env.SASPAY_API_KEY;
  if (!secret || !apiKey) return res.status(503).json({ ok: false });

  const signature = req.headers["x-webhook-signature"];
  const timestamp = req.headers["x-webhook-timestamp"];
  const eventHeader = req.headers["x-webhook-event"];
  if (typeof signature !== "string" || typeof timestamp !== "string" || typeof eventHeader !== "string") {
    return res.status(401).json({ ok: false });
  }

  let raw: string;
  let event: Record<string, any>;
  try {
    raw = await rawBody(req);
    if (!verifySignature(timestamp, raw, signature, secret)) return res.status(401).json({ ok: false });
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ ok: false });
  }

  const eventName = event.event ?? event.type ?? eventHeader;
  if (eventName !== eventHeader) return res.status(400).json({ ok: false });
  if (eventName !== "transaction.success") return res.status(200).json({ ok: true, ignored: true });

  const data = event.data && typeof event.data === "object" ? event.data : {};
  const nested = data.checkout_session && typeof data.checkout_session === "object" ? data.checkout_session : data;
  const sessionId = nested.checkout_session_id ?? nested.session_id ?? nested.checkoutSessionId ??
    nested.checkout_session?.id ?? (typeof nested.id === "string" ? nested.id : undefined);
  const localReference = nested.metadata?.local_reference ?? nested.metadata?.localReference ??
    data.metadata?.local_reference ?? data.metadata?.localReference ?? nested.local_reference ??
    nested.localReference ?? nested.reference ?? data.reference;

  if (typeof localReference !== "string" && typeof sessionId !== "string") {
    return res.status(400).json({ ok: false });
  }

  try {
    const admin = serverSupabase();
    let query = admin.from("school_payment_transactions")
      .select("id,school_id,plan_code,amount_xof,currency,reference,provider_session_id,status,created_at,paid_at,subscription_activated_at")
      .limit(1);
    if (typeof localReference === "string" && localReference) query = query.eq("reference", localReference);
    else query = query.eq("provider_session_id", sessionId);
    const { data: payment, error: lookupError } = await query.maybeSingle();

    if (lookupError) return res.status(500).json({ ok: false });
    if (!payment) return res.status(503).json({ ok: false, message: "Transaction non corrélée." });
    if (typeof sessionId === "string" && payment.provider_session_id && payment.provider_session_id !== sessionId) {
      return res.status(400).json({ ok: false });
    }
    if (payment.currency !== "XOF") return res.status(400).json({ ok: false });

    const verifiedSessionId = payment.provider_session_id || (typeof sessionId === "string" ? sessionId : null);
    if (!verifiedSessionId) return res.status(503).json({ ok: false });

    // Ne jamais activer à partir du webhook seul : relecture du statut directement auprès de SasPay.
    const statusResponse = await fetch(
      `${SASPAY_API_BASE}/checkout-sessions/${encodeURIComponent(verifiedSessionId)}/status/`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store" },
    );
    if (!statusResponse.ok) return res.status(502).json({ ok: false });
    const statusJson = await statusResponse.json() as Record<string, any>;
    const status = statusJson?.data && typeof statusJson.data === "object" ? statusJson.data : statusJson;
    const normalizedStatus = String(status?.status ?? status?.payment_status ?? "").toUpperCase();
    const transactionStatus = String(status?.transaction_status ?? status?.transactionStatus ?? "").toUpperCase();
    const paid = ["PAID", "SUCCESS", "SUCCEEDED", "COMPLETED"].includes(normalizedStatus) &&
      (!transactionStatus || ["SUCCESS", "SUCCEEDED", "COMPLETED", "PAID"].includes(transactionStatus));
    if (!paid) return res.status(200).json({ ok: true, activated: false });

    const amountFromProvider = status?.amount ?? status?.requested_amount ?? status?.amounts?.requested;
    if (amountFromProvider !== undefined && Number(amountFromProvider) !== Number(payment.amount_xof)) {
      console.error("ELS SasPay amount mismatch", { payment_id: payment.id });
      return res.status(400).json({ ok: false });
    }
    const currencyFromProvider = status?.currency;
    if (currencyFromProvider && String(currencyFromProvider).toUpperCase() !== "XOF") return res.status(400).json({ ok: false });

    const plan = PLAN_CATALOG[payment.plan_code as keyof typeof PLAN_CATALOG];
    if (!plan || plan.amount !== Number(payment.amount_xof)) return res.status(400).json({ ok: false });

    if (payment.subscription_activated_at) {
      return res.status(200).json({ ok: true, activated: true, alreadyProcessed: true });
    }

    const { data: existingSubscription, error: existingSubscriptionError } = await admin
      .from("school_subscriptions")
      .select("status,provider_subscription_id,current_period_start")
      .eq("school_id", payment.school_id)
      .maybeSingle();
    if (existingSubscriptionError) return res.status(500).json({ ok: false });

    // If the same successful checkout already activated the plan, mark it processed
    // without extending the 30-day period on duplicate webhook delivery.
    if (existingSubscription?.status === "active" && existingSubscription.provider_subscription_id === verifiedSessionId) {
      const { error: markError } = await admin.from("school_payment_transactions")
        .update({ subscription_activated_at: new Date().toISOString() })
        .eq("id", payment.id);
      if (markError) return res.status(500).json({ ok: false });
      return res.status(200).json({ ok: true, activated: true, alreadyProcessed: true });
    }

    // A delayed duplicate for an older payment must not replace a newer active plan.
    if (payment.status === "paid" && existingSubscription?.status === "active" &&
        existingSubscription.current_period_start &&
        new Date(existingSubscription.current_period_start).getTime() > new Date(payment.created_at).getTime()) {
      return res.status(200).json({ ok: true, activated: false, ignored: true, reason: "superseded_payment" });
    }

    if (payment.status !== "paid") {
      const { data: updated, error: paymentUpdateError } = await admin
        .from("school_payment_transactions")
        .update({ status: "paid", paid_at: new Date().toISOString(), provider_session_id: verifiedSessionId,
          payload: { verified_status: status, webhook_event: eventName } })
        .eq("id", payment.id).eq("status", "pending").select("id").maybeSingle();
      if (paymentUpdateError) return res.status(500).json({ ok: false });
      if (!updated) {
        const { data: latest, error: latestError } = await admin.from("school_payment_transactions")
          .select("status").eq("id", payment.id).maybeSingle();
        if (latestError || latest?.status !== "paid") return res.status(503).json({ ok: false });
      }
    }

    // Upsert is idempotent at school level; never trust a client-side return URL to activate.
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { error: subscriptionError } = await admin.from("school_subscriptions").upsert({
      school_id: payment.school_id,
      plan_code: plan.code,
      status: "active",
      monthly_price_xof: plan.amount,
      student_limit: plan.studentLimit,
      currency: "XOF",
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
      provider: "SasPay",
      provider_customer_id: null,
      provider_subscription_id: verifiedSessionId,
      updated_at: now.toISOString(),
    }, { onConflict: "school_id" });
    if (subscriptionError) {
      console.error("ELS SasPay subscription activation failed", subscriptionError.code);
      return res.status(500).json({ ok: false });
    }

    const { error: markActivatedError } = await admin.from("school_payment_transactions")
      .update({ subscription_activated_at: new Date().toISOString() })
      .eq("id", payment.id);
    if (markActivatedError) {
      // A retry will recognize provider_subscription_id on the school subscription
      // and mark the transaction without extending the period a second time.
      console.error("ELS SasPay activation marker failed", markActivatedError.code);
      return res.status(500).json({ ok: false });
    }

    return res.status(200).json({ ok: true, activated: true });
  } catch {
    return res.status(502).json({ ok: false });
  }
}
