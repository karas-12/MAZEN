// Vercel Serverless Function  ->  /api/kick
// بيرجّع: { live, viewers, game, title, followers }

const CHANNEL = process.env.KICK_CHANNEL || "zn_mazen"; // اسم القناة على كيك

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// الطريقة 1: API كيك العام (من غير مفاتيح)
async function fromPublic() {
  const r = await fetch(`https://kick.com/api/v2/channels/${CHANNEL}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!r.ok) throw new Error("public " + r.status);
  const d = await r.json();
  const ls = d.livestream;
  return {
    live: !!ls,
    viewers: ls ? ls.viewer_count : 0,
    game: ls && ls.categories && ls.categories[0] ? ls.categories[0].name : "",
    title: ls ? ls.session_title : "",
    followers: d.followers_count ?? d.followersCount ?? null,
  };
}

// الطريقة 2 (احتياطي): API كيك الرسمي — محتاج KICK_CLIENT_ID و KICK_CLIENT_SECRET
async function fromOfficial() {
  const id = process.env.KICK_CLIENT_ID;
  const secret = process.env.KICK_CLIENT_SECRET;
  if (!id || !secret) throw new Error("no official keys");

  const t = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
  });
  if (!t.ok) throw new Error("token " + t.status);
  const { access_token } = await t.json();

  const r = await fetch(
    `https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(CHANNEL)}`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (!r.ok) throw new Error("official " + r.status);
  const c = (await r.json()).data?.[0];
  if (!c) throw new Error("channel not found");
  return {
    live: !!(c.stream && c.stream.is_live),
    viewers: c.stream?.viewer_count ?? 0,
    game: c.category?.name ?? "",
    title: c.stream_title ?? "",
    followers: c.followers_count ?? null,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    let data;
    try {
      data = await fromPublic();
    } catch (e) {
      data = await fromOfficial();
    }
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "kick unavailable" });
  }
};
