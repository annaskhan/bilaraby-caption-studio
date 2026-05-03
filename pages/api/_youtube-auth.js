// Shared utility — exchanges YouTube OAuth refresh token for fresh access token
// Uses Google's standard OAuth2 token endpoint

let cachedToken = null;
let cachedExpiry = 0;

export async function getYouTubeAccessToken() {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedExpiry - 60000) {
    return cachedToken;
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('YouTube credentials not configured. Admin must set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN in Vercel environment variables.');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    throw new Error(err?.error_description || err?.error || 'Failed to refresh YouTube token');
  }

  const data = await tokenRes.json();
  cachedToken = data.access_token;
  cachedExpiry = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}
