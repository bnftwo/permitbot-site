// api/ai-permit-suggest.js
// Vercel serverless function to call OpenAI and return JSON for permit suggestions

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
You are an assistant helping contractors and civil engineers determine which permit forms are needed for a job in Florida.

Return ONLY valid JSON in this format:

{
  "forms": [
    {
      "name": string,
      "level": "city" | "county" | "state" | "other",
      "description": string,
      "who_signs": string,
      "key_fields": string[]
    }
  ],
  "notes": string
}

Jurisdiction: ${jurisdiction}
Project type: ${project_type}
Parcel or address: ${parcel_or_address || "N/A"}
Forms user expects: ${forms_expected || "N/A"}
Extra context: ${extra_context || "N/A"}
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
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("OpenAI error:", text);
      return response.status(500).json({ error: "AI request failed" });
    }

    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      parsed = { raw: content };
    }

    return response.status(200).json(parsed);
  } catch (err) {
    console.error("Server error:", err);
    return response.status(500).json({ error: "Server error" });
  }
}
