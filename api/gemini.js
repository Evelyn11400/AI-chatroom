/**
 * Vercel Serverless Function — POST /api/gemini
 * Variables: Vercel → Project → Settings → Environment Variables
 *   GEMINI_API_KEY (required), GEMINI_MODEL (optional, default gemini-2.5-flash)
 */

/** @param {string} text @param {number} maxWords */
function trimToMaxWords(text, maxWords) {
  var s = String(text).trim();
  if (!s) return s;
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    var parts = s.split(/\s+/).filter(Boolean);
    if (parts.length <= maxWords) return s;
    return parts.slice(0, maxWords).join(" ");
  }
  var segmenter = new Intl.Segmenter("und", { granularity: "word" });
  var n = 0;
  var end = s.length;
  for (var seg of segmenter.segment(s)) {
    if (seg.isWordLike) {
      n++;
      if (n >= maxWords) {
        end = seg.index + seg.segment.length;
        break;
      }
    }
  }
  return s.slice(0, end).trim();
}

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

  const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();

  const systemText =
    "You are replying in a public group chat (MQTT). The user message is their instruction or question to you.\n\n" +
    "Tone (always):\n" +
    "- Everyday casual chat: loose relaxed informal like texting a friend\n" +
    "- Shortcuts and abbreviations are fine when they feel natural in chat\n" +
    "- Do not use punctuation no periods commas question marks exclamation marks colons semicolons dashes or quotes " +
    "write as one unpunctuated flow like quick DMs only break this if the user clearly needs a URL code snippet or exact numbers\n\n" +
    "Rules:\n" +
    "- Write ONLY that chat bubble no meta no lecture\n" +
    "- Do NOT show your thinking planning step by step reasoning or analysis\n" +
    "- Do NOT use robotic openers over polite filler apologies or meta talk about being an assistant\n" +
    "- No markdown headings or bullet lists unless the user clearly wants that in chat\n" +
    "- Hard length cap: your entire reply must be 10 words or fewer count each word like segmenting for English spaces and for Chinese each 词 as one unit stop at 10\n" +
    "- Plain text only ready to broadcast as one chat line";

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
        generationConfig: { maxOutputTokens: 80 },
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

    var out = trimToMaxWords(text, 10);
    if (!String(out).trim()) {
      return res.status(502).json({ error: "Empty model response" });
    }

    return res.status(200).json({ text: out, model: model });
  } catch (e) {
    return res.status(502).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
