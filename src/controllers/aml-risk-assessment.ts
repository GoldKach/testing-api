import { db } from "@/db/db";
import { Request, Response } from "express";

/* GET /api/v1/aml-risk-assessment/:userId */
export async function getAMLRiskAssessment(req: Request, res: Response) {
  const { userId } = req.params;
  try {
    const record = await db.aMLRiskAssessment.findUnique({ where: { userId } });
    return res.json({ success: true, data: record ?? null });
  } catch (error) {
    console.error("getAMLRiskAssessment error:", error);
    return res.status(500).json({ success: false, data: null, error: "Server error." });
  }
}

async function generateAssessmentRef(): Promise<string> {
  // Find the highest existing ref number
  const all = await db.aMLRiskAssessment.findMany({ select: { data: true } });
  let max = 0;
  for (const row of all) {
    const ref = (row.data as any)?.assessmentRef as string | undefined;
    if (ref) {
      const match = ref.match(/^AML-CDD-(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
  }
  return `AML-CDD-${String(max + 1).padStart(3, "0")}`;
}

/* PUT /api/v1/aml-risk-assessment/:userId */
export async function upsertAMLRiskAssessment(req: Request, res: Response) {
  const { userId } = req.params;
  const { data, updatedBy } = req.body as { data?: Record<string, any>; updatedBy?: string };

  if (!userId) {
    return res.status(400).json({ success: false, data: null, error: "userId is required." });
  }

  try {
    const userExists = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!userExists) {
      return res.status(404).json({ success: false, data: null, error: "User not found." });
    }

    const existing = await db.aMLRiskAssessment.findUnique({ where: { userId } });

    let finalData: Record<string, any> = data ?? {};

    if (!existing) {
      // First save — generate a new sequential ref
      finalData = { ...finalData, assessmentRef: await generateAssessmentRef() };
    } else {
      // Subsequent saves — preserve the original ref regardless of what the client sends
      const existingRef = (existing.data as any)?.assessmentRef;
      if (existingRef) {
        finalData = { ...finalData, assessmentRef: existingRef };
      } else {
        // Edge case: existing record has no ref yet (created before this feature)
        finalData = { ...finalData, assessmentRef: await generateAssessmentRef() };
      }
    }

    const record = await db.aMLRiskAssessment.upsert({
      where: { userId },
      create: { userId, data: finalData, updatedBy: updatedBy ?? null },
      update: { data: finalData, updatedBy: updatedBy ?? null },
    });

    return res.json({ success: true, data: record });
  } catch (error) {
    console.error("upsertAMLRiskAssessment error:", error);
    return res.status(500).json({ success: false, data: null, error: "Server error." });
  }
}
