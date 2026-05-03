// Fetches the Arabic caption track from a YouTube video URL/ID
// Uses the YouTube timedtext endpoint which is publicly accessible for videos with captions

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoUrl } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'Missing videoUrl' });

  // Extract video ID from various YouTube URL formats
  const videoId = extractVideoId(videoUrl);
  if (!videoId) return res.status(400).json({ error: 'Could not extract video ID from URL' });

  try {
    // Step 1: Get the list of available caption tracks
    const listUrl = `https://video.google.com/timedtext?type=list&v=${videoId}`;
    const listRes = await fetch(listUrl);
    const listXml = await listRes.text();

    // Find Arabic track (lang_code="ar")
    const arabicMatch = listXml.match(/<track[^>]*lang_code="ar"[^>]*\/>/);
    let trackParams = '';

    if (arabicMatch) {
      const nameMatch = arabicMatch[0].match(/name="([^"]*)"/);
      const trackName = nameMatch ? nameMatch[1] : '';
      trackParams = `&lang=ar${trackName ? `&name=${encodeURIComponent(trackName)}` : ''}`;
    } else {
      // Fall back to auto-generated Arabic captions
      trackParams = `&lang=ar&kind=asr`;
    }

    // Step 2: Fetch the actual captions in SRT format
    const captionUrl = `https://video.google.com/timedtext?v=${videoId}${trackParams}&fmt=srt`;
    const captionRes = await fetch(captionUrl);
    const srtContent = await captionRes.text();

    if (!srtContent || srtContent.trim().length < 10) {
      // Try alternative endpoint
      const altUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=ar&fmt=srt`;
      const altRes = await fetch(altUrl);
      const altSrt = await altRes.text();
      if (!altSrt || altSrt.trim().length < 10) {
        return res.status(404).json({
          error: 'No Arabic captions found on this video. Please download the SRT manually from YouTube Studio and upload it.',
          videoId
        });
      }
      return res.status(200).json({ srtContent: altSrt, videoId });
    }

    return res.status(200).json({ srtContent, videoId });
  } catch (error) {
    return res.status(500).json({ error: error.message, hint: 'YouTube may be blocking automated access. Try downloading the SRT manually from YouTube Studio.' });
  }
}

function extractVideoId(input) {
  if (!input) return null;
  const trimmed = input.trim();

  // Already an ID (11 characters, alphanumeric + - + _)
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  // Standard watch URL: youtube.com/watch?v=ID
  let match = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (match) return match[1];

  // Short URL: youtu.be/ID
  match = trimmed.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (match) return match[1];

  // Embed URL: youtube.com/embed/ID
  match = trimmed.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/);
  if (match) return match[1];

  // Shorts: youtube.com/shorts/ID
  match = trimmed.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (match) return match[1];

  return null;
}
