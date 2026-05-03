// Returns whether YouTube credentials are configured server-side
// Used by the client to show the right UI

export default function handler(req, res) {
  const configured = !!(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN
  );
  return res.status(200).json({ configured });
}
