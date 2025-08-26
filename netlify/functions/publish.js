// Publica public/catalogo.json en GitHub (crea o actualiza el archivo)

// Env vars (Netlify → Project configuration → Environment variables):
// GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, CATALOG_PATH, PUBLISH_PASSWORD

const GITHUB_API = "https://api.github.com";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "OPTIONS, POST",
      ...extra,
    },
  });
}

const toB64 = (s) => Buffer.from(s, "utf8").toString("base64");

export default async function handler(req) {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth simple: Authorization: Bearer <PUBLISH_PASSWORD>
  const auth = req.headers.get("authorization") || "";
  const pass = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!pass || pass !== process.env.PUBLISH_PASSWORD) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { settings = {}, products } = payload || {};
  if (!Array.isArray(products)) return json({ error: "Missing products[]" }, 400);

  const bodyPretty = JSON.stringify({ settings, products }, null, 2);

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const path = process.env.CATALOG_PATH || "public/catalogo.json";
  const token = process.env.GITHUB_TOKEN;

  // Busca SHA actual (si el archivo existe)
  const getUrl = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
  let sha = null;
  try {
    const r = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "netlify-fn" },
    });
    if (r.ok) {
      const data = await r.json();
      sha = data.sha;
    }
  } catch (_) {}

  // PUT contents
  const putUrl = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const message = sha ? "chore: update catalogo.json" : "chore: create catalogo.json";

  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "netlify-fn",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: toB64(bodyPretty),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    return json({ error: "GitHub PUT failed", detail: err }, 500);
  }

  return json({ ok: true, path, branch });
}
