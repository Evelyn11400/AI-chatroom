/**
 * Vercel Serverless Function — POST /api/gemini
 * Variables: Vercel → Project → Settings → Environment Variables
 *   GEMINI_API_KEY (required), GEMINI_MODEL (optional, default gemini-2.0-flash)
 */

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const prompt = body && typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  if (prompt.length > 32000) {
    return res.status(400).json({ error: "Prompt too long" });
  }

  const model = (process.env.GEMINI_MODEL || "gemini-2.0-flash").trim();

  const systemText =
    "You are replying in a public group chat (MQTT). The user message is their instruction or question to you.\n\n" +
    "Rules:\n" +
    "- Write ONLY the message you would send as a chat bubble: natural, casual, human chat tone.\n" +
    "- Do NOT show your thinking, planning, step-by-step reasoning, or analysis.\n" +
    "- Do NOT use phrases like \"Here is\", \"I'll\", \"Sure, I can\", \"As an AI\", apologies, or meta talk about the task.\n" +
    "- Do NOT add unrelated filler, disclaimers, or closing remarks unless they fit normal chat.\n" +
    "- No markdown headings or lecture format unless the user clearly wants that in a chatty way.\n" +
    "- Keep it concise like instant messaging unless the user explicitly asks for a longer answer.\n" +
    "- Plain text only, ready to broadcast as one chat line.";

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey.trim());

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });

    const data = await r.json().catch(function () {
      return {};
    });

    if (!r.ok) {
      const msg =
        (data.error && data.error.message) || data.message || "Gemini HTTP " + r.status;
      return res.status(502).json({ error: msg });
    }

    const parts =
      data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = Array.isArray(parts)
      ? parts
          .map(function (p) {
            return typeof p.text === "string" ? p.text : "";
          })
          .join("")
      : "";

    if (!String(text).trim()) {
      return res.status(502).json({ error: "Empty model response" });
    }

    return res.status(200).json({ text: text, model: model });
  } catch (e) {
    return res.status(502).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
