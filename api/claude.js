// api/claude.js — Vercel Serverless Function
// Proxies requests to Anthropic API securely (clé jamais exposée côté client)

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const { prompt } = req.body
  if (!prompt) return res.status(400).json({ error: "Prompt manquant" })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY non configurée" })

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || ""
    res.status(200).json({ text })
  } catch (err) {
    res.status(500).json({ error: "Erreur API Anthropic", detail: err.message })
  }
}
