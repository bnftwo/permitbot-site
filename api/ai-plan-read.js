// api/ai-plan-read.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    return;
  }

  try {
    const body = req.body || {};
    const {
      jurisdiction,
      project_type,
      parcel_or_address,
      plan_urls = [],
      extra_context
    } = body;

    if (!jurisdiction || !project_type) {
      res.status(400).json({ error: "jurisdiction and project_type are required" });
      return;
    }

    const plansSummary = plan_urls.length
      ? `The user has uploaded the following plan/PDF URLs for this job: ${plan_urls.join(
          ", "
        )}. At the moment you cannot open the PDFs directly, but assume these are a typical full plan set (civil, architectural, utility, etc.) for this jurisdiction and use that to infer likely conditions.`
      : "No plan/PDF URLs were provided for this job.";

    const userDescription = `
Jurisdiction: ${jurisdiction}
Project type: ${project_type}
Parcel or address: ${parcel_or_address || "N/A"}
Extra context: ${extra_context || "N/A"}

${plansSummary}
`.trim();

    const systemPrompt = `
You are PermitBot PlanReader, an assistant for civil/site + building plan review in Florida
(especially Volusia County, Flagler County, Daytona Beach, Ormond Beach, Palm Coast, Port Orange, New Smyrna Beach).

You DO NOT have the actual PDFs in front of you yet, but the user has provided URLs to plan sets.
Use your knowledge of typical plan contents to infer likely conditions and checks.

Respond in STRICT JSON with this shape:

{
  "site_summary": {
    "likely_zoning": "string",
    "likely_flood_zone": "string",
    "drainage_type": "string",
    "lot_constraints": "string"
  },
  "utilities": {
    "water": "string",
    "sewer": "string",
    "other_utilities": "string"
  },
  "key_values_to_pull_from_plans": [
    "string – e.g. building footprint square footage",
    "string – e.g. total impervious area or delta impervious",
    "string – e.g. finished floor elevation vs BFE",
    "string – e.g. SHWL or groundwater info",
    "string – e.g. driveway connection type and ROW notes"
  ],
  "recommended_plan_sheets_to_review": [
    "string – which sheets in the plans the user should look at (e.g. C1.0, C2.0, A1.1, etc.)",
    "string – and what to look for on each sheet"
  ],
  "permit_risk_flags": [
    "string – potential issues for permitting (flood zone, wetlands, buffers, driveway spacing, utilities, etc.)"
  ],
  "notes_for_eit_or_admin": "string – a short note written as if you're talking to an EIT or office admin, telling them what to double-check in the plans for this jurisdiction and project type."
}

Rules:
- Always include ALL keys, even if you have to guess and mark something as 'unknown / to confirm in plans'.
- Be realistic and conservative: if you're not sure, say what to confirm in the plans.
- Do NOT include any text outside the JSON.
`.trim();

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userDescription }
        ],
        temperature: 0.2
      })
    });

    if (!openaiRes.ok) {
      const text = await openaiRes.text();
      console.error("OpenAI error (plan-read):", text);
      res.status(500).json({ error: "OpenAI API error", details: text });
      return;
    }

    const openaiJson = await openaiRes.json();
    const rawContent = openaiJson.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        parsed = {};
      }
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error("Plan-read route error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
}
