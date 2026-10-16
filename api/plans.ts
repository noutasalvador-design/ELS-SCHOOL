import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "./_lib/db";

const fallbackPlans = [
  { code: "essentiel", name: "Essentiel", monthlyPriceXof: 5000, studentLimit: 100, unlimited: false },
  { code: "standard", name: "Standard", monthlyPriceXof: 10000, studentLimit: 300, unlimited: false },
  { code: "illimite", name: "Illimité", monthlyPriceXof: 25000, studentLimit: null, unlimited: true },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const result = await db.query(
      "SELECT code, name, monthly_price_xof, student_limit FROM subscription_plans WHERE active = true ORDER BY monthly_price_xof ASC"
    );
    const plans = result.rows.map((row) => ({
      code: row.code,
      name: row.name,
      monthlyPriceXof: Number(row.monthly_price_xof),
      studentLimit: row.student_limit === null ? null : Number(row.student_limit),
      unlimited: row.student_limit === null,
    }));
    return res.status(200).setHeader("Cache-Control", "public, max-age=300").json({ plans });
  } catch {
    // Avoid leaking database details; fallback catalog is informational only.
    return res.status(200).setHeader("Cache-Control", "no-store").json({ plans: fallbackPlans, source: "fallback" });
  }
}
