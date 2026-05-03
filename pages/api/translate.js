export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { blocks, langLabel, glossary } = req.body;

  if (!blocks || !langLabel) {
    return res.status(400).json({ error: 'Missing blocks or langLabel' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const textOnly = blocks.map((b, i) => `[${i}] ${b.text}`).join('\n---\n');

  let glossarySection = '';
  if (glossary && glossary.length > 0) {
    const glossaryText = glossary
      .filter(g => g.term && g.term.trim())
      .map(g => {
        const rule = g.keepAsIs
          ? `Keep as "${g.term}" — do NOT translate`
          : g.translation
            ? `Translate to "${g.translation}"`
            : `Keep as "${g.term}"`;
        const note = g.notes ? ` (${g.notes})` : '';
        return `- "${g.term}": ${rule}${note}`;
      })
      .join('\n');

    if (glossaryText) {
      glossarySection = `\n\nMANDATORY BRAND GLOSSARY — these terms MUST follow these rules in every segment:\n${glossaryText}\n`;
    }
  }

  const prompt = `You are a professional subtitle translator for BilAraby, an Arabic Islamic content channel. Translate the following subtitle text segments from Arabic to ${langLabel}.

CRITICAL RULES:
- Preserve the [INDEX] markers exactly as-is
- Keep the --- separators between segments
- Translate ONLY the text after [INDEX], not the markers themselves
- Preserve line breaks within each segment
- Keep natural, colloquial tone suitable for YouTube captions
- Maintain religious and cultural respect for Islamic terminology
- Do NOT add explanations or notes${glossarySection}

SUBTITLE SEGMENTS:
${textOnly}

Return ONLY the translated segments in the exact same format.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err?.error?.message || 'Claude API error' });
    }

    const data = await response.json();
    const translated = data.content[0].text;
    const segments = translated.split(/\n---\n/);

    const translatedBlocks = blocks.map((block, i) => {
      const seg = segments[i] || '';
      const text = seg.replace(/^\[\d+\]\s*/, '').trim();
      return { ...block, text: text || block.text };
    });

    return res.status(200).json({ blocks: translatedBlocks });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
