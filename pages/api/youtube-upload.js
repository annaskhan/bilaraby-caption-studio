import { getYouTubeAccessToken } from './_youtube-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoId, langCode, langLabel, srtContent } = req.body;
  if (!videoId || !langCode || !srtContent) {
    return res.status(400).json({ error: 'Missing videoId, langCode, or srtContent' });
  }

  try {
    const accessToken = await getYouTubeAccessToken();

    // Step 1 — create the caption resource as a draft
    const metaRes = await fetch(
      'https://www.googleapis.com/youtube/v3/captions?part=snippet',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snippet: {
            videoId,
            language: langCode,
            name: `${langLabel} (AI Draft)`,
            isDraft: true,
          },
        }),
      }
    );

    if (!metaRes.ok) {
      const err = await metaRes.json().catch(() => ({}));
      return res.status(metaRes.status).json({
        error: err?.error?.message || `Failed to create caption track (HTTP ${metaRes.status})`
      });
    }

    const meta = await metaRes.json();

    // Step 2 — upload the SRT body
    const uploadRes = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/captions?uploadType=media&id=${meta.id}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/plain; charset=utf-8' },
        body: srtContent,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      return res.status(uploadRes.status).json({
        error: `Upload failed (HTTP ${uploadRes.status})`,
        details: errText.slice(0, 200)
      });
    }

    return res.status(200).json({ captionId: meta.id, success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
