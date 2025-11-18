import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const {
      parcel_or_address,
      jurisdiction,
      project_type,
      forms_expected,
      extra_context
    } = req.body;

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const prompt = `
You are PermitBot Pro — an expert in permits for Volusia County and Flagler County
(plus the cities Daytona Beach, Ormond Beach, Palm Coast, Port Orange, and New Smyrna Beach).

Your job is to output **clean JSON ONLY** describing the exact forms, applications, checklists, civil engineering sheets, stormwater requirements, and FDEP forms needed for the described job.

The region you serve has these rules:
- Volusia County: septic common, stormwater review heavy, septic routing required
- Daytona Beach: utility apps required, STOP permit, driveway/ROW separate
- Ormond Beach: utility checklists, water/sewer availability, stormwater & grading sheet
- Palm Coast: heavy on utility apps + stormwater
- Port Orange: ROW separate, utility availability, stormwater form
- New Smyrna Beach: strict driveway rules, separate ROW
- Flagler County: lots of septic, well, flood zone areas

FDEP Notes:
- Potable water form required for new SFR on public water
- Sewer collection/transmission form required for any new sewer connection
- NPDES/Notice of Intent required only for >1 acre disturbance

Civil / Site Specific Rules:
- New SFR requires site plan, utility plan, grading, erosion control, driveway plan
- Stormwater analysis required if >10% impervious increase or local city rule
- Flood zones require elevation cert
- Wetlands require delineation + possibly SJRWMD ERP triggers (rare for single lots)

Building Permit Triggers:
- New SFR = building permit app + survey + energy calcs + truss + site plan
- Pools = site plan + engineered drawings + safety barrier form + electrical/mech
- Additions = updated survey + site plan + building app + energy calcs
- TIs = floor plan + MEP sheets + fire review if applicable

Return JSON with the following EXACT shape:

{
  "jurisdiction_interpretation": "...",
  "project_classification": "...",
  "permit_packet": {
    "civil_engineering": [],
    "building_department": [],
    "utility_and_fdep": [],
    "stormwater": [],
    "row_or_driveway": [],
    "other_reviews": []
  },
  "recommended_order": [],
  "notes": "..."
}

Fill each array with objects shaped like:
{
  "name": "",
  "jurisdiction": "",
  "category": "",
  "description": "",
  "required_if": ""
}

User Input:
Parcel/address: ${parcel_or_address || "None provided"}
Jurisdiction: ${jurisdiction}
Project Type: ${project_type}
User-listed forms: ${forms_expected || "None provided"}
Extra context: ${extra_context || "None provided"}

Output clean JSON only — NO commentary.
    `;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });

    let text = completion.choices?.[0]?.message?.content || "{}";

    // Attempt to parse JSON safely
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      return res.status(200).json({
        error: "Invalid JSON received from AI",
        raw: text
      });
    }

    return res.status(200).json(json);

  } catch (error) {
    console.error("API error:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
}
