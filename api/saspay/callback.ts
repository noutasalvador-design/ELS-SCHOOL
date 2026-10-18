import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "../_lib/db";
import { PLAN_CATALOG, SASPAY_API_BASE } from "../_lib/saspay";

export const config = { api: { bodyParser: false } };
async function rawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
function verifySignature(timestamp: string, raw: string, signature: string, secret: string): boolean {
  if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now()/1000)-seconds)>300) return false;
  const expected = createHmac("sha256",secret).update(`${timestamp}.${raw}`).digest();
  const received = Buffer.from(signature,"hex");
  return received.length===expected.length && timingSafeEqual(received,expected);
}
export default async function handler(req: VercelRequest,res: VercelResponse) {
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({ok:false});}
  const secret=process.env.SASPAY_WEBHOOK_SECRET||process.env.SASPAY_CALLBACK_SECRET;
  const apiKey=process.env.SASPAY_API_KEY;
  if(!secret||!apiKey)return res.status(503).json({ok:false});
  const signature=req.headers["x-webhook-signature"], timestamp=req.headers["x-webhook-timestamp"], eventHeader=req.headers["x-webhook-event"];
  if(typeof signature!=="string"||typeof timestamp!=="string"||typeof eventHeader!=="string")return res.status(401).json({ok:false});
  let raw:string,event:Record<string,any>;
  try { raw=await rawBody(req); if(!verifySignature(timestamp,raw,signature,secret))return res.status(401).json({ok:false}); event=JSON.parse(raw); }
  catch{return res.status(400).json({ok:false});}
  const eventName=event.event??event.type??eventHeader;
  if(eventName!==eventHeader)return res.status(400).json({ok:false});
  if(eventName!=="transaction.success")return res.status(200).json({ok:true,ignored:true});
  const data=event.data&&typeof event.data==="object"?event.data:{};
  const nested=data.checkout_session&&typeof data.checkout_session==="object"?data.checkout_session:data;
  const sessionId=nested.checkout_session_id??nested.session_id??nested.checkoutSessionId??nested.checkout_session?.id??(typeof nested.id==="string"&&/^(cs_|sess_|checkout_)/i.test(nested.id)?nested.id:undefined);
  const reference=nested.metadata?.local_reference??nested.metadata?.localReference??data.metadata?.local_reference??data.metadata?.localReference??nested.local_reference??nested.localReference??nested.reference??data.reference;
  if(typeof reference!=="string"&&typeof sessionId!=="string")return res.status(400).json({ok:false});
  try {
    const found=typeof reference==="string"&&reference
      ? await db.query("select * from school_payment_transactions where reference=$1 limit 1",[reference])
      : await db.query("select * from school_payment_transactions where provider_session_id=$1 limit 1",[sessionId]);
    const payment=found.rows[0];
    if(!payment)return res.status(503).json({ok:false,message:"Transaction non corrélée."});
    if(typeof sessionId==="string"&&payment.provider_session_id&&payment.provider_session_id!==sessionId)return res.status(400).json({ok:false});
    if(payment.currency!=="XOF")return res.status(400).json({ok:false});
    const verifiedId=payment.provider_session_id||(typeof sessionId==="string"?sessionId:null);
    if(!verifiedId)return res.status(503).json({ok:false});
    const statusResponse=await fetch(`${SASPAY_API_BASE}/checkout-sessions/${encodeURIComponent(verifiedId)}/status/`,{headers:{Authorization:`Bearer ${apiKey}`,Accept:"application/json"},cache:"no-store"});
    if(!statusResponse.ok)return res.status(502).json({ok:false});
    const statusJson=await statusResponse.json() as Record<string,any>;
    const status=statusJson?.data&&typeof statusJson.data==="object"?statusJson.data:statusJson;
    const normalized=String(status?.status??status?.payment_status??"").toUpperCase();
    const transaction=String(status?.transaction_status??status?.transactionStatus??"").toUpperCase();
    const paid=["PAID","SUCCESS","SUCCEEDED","COMPLETED"].includes(normalized)&&(!transaction||["SUCCESS","SUCCEEDED","COMPLETED","PAID"].includes(transaction));
    if(!paid)return res.status(200).json({ok:true,activated:false});
    const amount=status?.amount??status?.requested_amount??status?.amounts?.requested;
    if(amount!==undefined&&Number(amount)!==Number(payment.amount_xof))return res.status(400).json({ok:false});
    if(status?.currency&&String(status.currency).toUpperCase()!=="XOF")return res.status(400).json({ok:false});
    const plan=PLAN_CATALOG[payment.plan_code as keyof typeof PLAN_CATALOG];
    if(!plan||plan.amount!==Number(payment.amount_xof))return res.status(400).json({ok:false});

    const client=await db.connect();
    try {
      await client.query("begin");
      const locked=await client.query("select * from school_payment_transactions where id=$1 for update",[payment.id]);
      const current=locked.rows[0];
      if(!current){await client.query("rollback");return res.status(503).json({ok:false});}
      if(current.subscription_activated_at){await client.query("commit");return res.status(200).json({ok:true,activated:true,alreadyProcessed:true});}
      const existing=await client.query("select status,provider_subscription_id,current_period_start from school_subscriptions where school_id=$1 for update",[current.school_id]);
      const subscription=existing.rows[0];
      if(current.status==="paid"&&subscription?.status==="active"&&subscription.current_period_start&&new Date(subscription.current_period_start).getTime()>new Date(current.created_at).getTime()){
        await client.query("commit");return res.status(200).json({ok:true,activated:false,ignored:true,reason:"superseded_payment"});
      }
      if(current.status!=="paid"){
        await client.query("update school_payment_transactions set status='paid',paid_at=coalesce(paid_at,now()),provider_session_id=$2,payload=$3::jsonb where id=$1",[current.id,verifiedId,JSON.stringify({verified_status:status,webhook_event:eventName})]);
      }
      const now=new Date(),end=new Date(now.getTime()+30*24*60*60*1000);
      await client.query(`insert into school_subscriptions(school_id,plan_code,status,monthly_price_xof,student_limit,currency,current_period_start,current_period_end,provider,provider_customer_id,provider_subscription_id,updated_at)
        values($1,$2,'active',$3,$4,'XOF',$5,$6,'SasPay',null,$7,$5)
        on conflict(school_id) do update set plan_code=excluded.plan_code,status='active',monthly_price_xof=excluded.monthly_price_xof,student_limit=excluded.student_limit,currency='XOF',current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,provider='SasPay',provider_customer_id=null,provider_subscription_id=excluded.provider_subscription_id,updated_at=excluded.updated_at`,
        [current.school_id,plan.code,plan.amount,plan.studentLimit,now.toISOString(),end.toISOString(),verifiedId]);
      await client.query("update school_payment_transactions set subscription_activated_at=now() where id=$1",[current.id]);
      await client.query("commit");
      return res.status(200).json({ok:true,activated:true});
    } catch(error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  } catch(error) {
    console.error("Neon SasPay callback failed",(error as {code?:string})?.code);
    return res.status(500).json({ok:false});
  }
}
