// api/ai-permit-suggest.js
// Smarter AI endpoint focused on Volusia/Flagler/Daytona/Ormond region

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const {
    parcel_or_address,
    jurisdiction,
    project_type,
    forms_expected,
    extra_context,
  } = request.body || {};

  if (!jurisdiction || !project_type) {
    return response
      .status(400)
      .json({ error: "jurisdiction and project_type are required" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return response
      .status(500)
      .json({ error: "OPENAI_API_KEY is not set on the server" });
  }

  try {
    const prompt = `
You are PermitBot Pro — an expert in permits and civil/site workflows
for Volusia County and Flagler County Florida and the cities:
- Daytona Beach
- Ormond Beach
- Palm Coast
- Port Orange
- New Smyrna Beach

You help civil engineers, surveyors, and small GCs mostly doing:
- Single-family residential (SFR) new builds
- Pools
- Additions
- Small tenant improvements (TI)
- Civil site work (site plan, grading, drainage, utilities, stormwater)

Your job is to output CLEAN JSON ONLY describing the permit packet.

REGIONAL NOTES (use these as hints, not strict law):
- Volusia County: lots of septic, stormwater reviews, septic routing.
- Daytona Beach: city utilities common, utility apps, driveway/ROW separate.
- Ormond Beach: utility checklists, stormwater/grading sheets.
- Palm Coast: strong utility + stormwater workflows.
- Port Orange: ROW and utility availability separate, stormwater form.
- New Smyrna Beach: strict driveway/ROW, coastal/flood possible.
- Flagler County: more well/septic, flood zones, some wetlands.

FDEP NOTES:
- Potable water form: new SFR on public water.
- Sewer collection/transmission: any new sewer connection.
- NPDES/Notice of Intent: if site disturbance > 1 acre.

CIVIL/SITE:
- New SFR: site plan, utility plan, grading & drainage, erosion control, driveway.
- Stormwater analysis: required if local rule triggers (impervious increase, etc).
- Flood zones: need elevation cert.
- Wetlands: delineation + potential SJRWMD ERP (rare for single lots but note it).

BUILDING:
- New SFR: building permit app, survey, site plan, energy calcs, truss, driveway/utility as needed.
- Pools: pool app, engineered pool plans, site plan, barrier form, electrical/mech.
- Additions: updated survey/site plan, building app, energy calcs.
- TI: floor plan, MEP sheets, fire review if needed.

Return JSON with this EXACT outer shape:

{
  "jurisdiction_interpretation": string,
  "project_classification": string,
  "permit_packet": {
    "civil_engineering": [],
    "building_department": [],
    "utility_and_fdep": [],
    "stormwater": [],
    "row_or_driveway": [],
    "other_reviews": []
  },
  "recommended_order": [],
  "notes": string
}

Each array inside "permit_packet" must contain objects shaped like:

{
  "name": string,
  "jurisdiction": string,
  "category": string,
  "description": string,
  "required_if": string
}

"recommended_order" is an array of strings, describing the order the user should tackle these items in.

Now use this specific job info:

Parcel/address: ${parcel_or_address || "None provided"}
Jurisdiction: ${jurisdiction}
Project Type: ${project_type}
User-listed forms: ${forms_expected || "None provided"}
Extra context: ${extra_context || "None provided"}

Return ONLY valid JSON. No backticks, no markdown, no commentary.
    `.trim();

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a helpful permitting assistant." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("OpenAI error:", text);
      return response.status(500).json({
        error: "AI request failed",
        status: aiRes.status,
        detail: text,
      });
    }

    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("JSON parse error:", e, content);
      parsed = { error: "Invalid JSON from model", raw: content };
    }

    return response.status(200).json(parsed);
  } catch (err) {
    console.error("Server error:", err);
    return response.status(500).json({ error: "Server error", detail: err.message });
  }
}
