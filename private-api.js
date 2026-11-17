// Personal workspace API. Mount only after configuring D1 and ADMIN_PASSWORD_HASH.
// Password hash format: PBKDF2 SHA-256 with 100000 iterations, base64 salt and digest.
const AUTH_ORIGIN = "https://tovi-donninger.github.io";
const encoder = new TextEncoder();
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
async function sha256(text) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)))); }
function b64bytes(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function checkPassword(password, config) {
  const [iterations, salt, expected] = String(config || "").split(":");
  if (iterations !== "100000" || !salt || !expected || password.length > 1024) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64bytes(salt), iterations: 100000, hash: "SHA-256" }, key, 256));
  const expectedBytes = b64bytes(expected);
  let difference = bits.length ^ expectedBytes.length;
  for (let i = 0; i < bits.length; i++) difference |= bits[i] ^ (expectedBytes[i] || 0);
  return difference === 0;
}
function response(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": AUTH_ORIGIN, "Vary": "Origin", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" } }); }
function tokenFrom(request) { const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("Authorization") || ""); return match?.[1] || ""; }
async function authorized(request, db) {
  const token = tokenFrom(request);
  if (!token) return false;
  const hash = await sha256(token);
  const record = await db.prepare("SELECT token_hash FROM auth_sessions WHERE token_hash = ? AND expires_at > datetime('now')").bind(hash).first();
  return !!record;
}
function validProfile(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  const fields = ["firstName","lastName","email","phone","city","country","address","linkedin","headline","education","experience","skills","cv","coverLetter","minimumSalary","locations","roles","notes"];
  return Object.keys(p).every(k => fields.includes(k) && typeof p[k] === "string" && p[k].length <= 30000);
}
const statuses = ["Discovered","Prepared","Submitted","Interview","Rejected","Blocked"];
export async function personalApi(request, env, url) {
  if (!env.DB || !env.ADMIN_PASSWORD_HASH) return response({error:"Secure workspace is not configured. Set the D1 DB binding and ADMIN_PASSWORD_HASH secret."},503);
  const path = url.pathname;
  const method = request.method;
  if (path === "/api/private/login" && method === "POST") {
    // Persistent rate limit across Worker instances: five attempts per 15 minutes.
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE attempted_at > datetime('now','-15 minutes')").first();
    if (Number(count?.n || 0) >= 5) return response({error:"Too many login attempts. Try again in 15 minutes."},429);
    let body; try { body = await request.json(); } catch { return response({error:"Invalid JSON"},400); }
    if (typeof body.password !== "string" || body.password.length > 1024) return response({error:"Invalid password"},400);
    await env.DB.prepare("INSERT INTO auth_attempts DEFAULT VALUES").run();
    if (!(await checkPassword(body.password, env.ADMIN_PASSWORD_HASH))) return response({error:"Incorrect password"},401);
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await sha256(token);
    await env.DB.prepare("INSERT INTO auth_sessions(token_hash, expires_at) VALUES (?, datetime('now','+12 hours'))").bind(hash).run();
    await env.DB.prepare("DELETE FROM auth_attempts").run();
    await env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= datetime('now')").run();
    return response({token,expiresInSeconds:43200});
  }
  if (!(await authorized(request, env.DB))) return response({error:"Please sign in."},401);
  if (path === "/api/private/logout" && method === "POST") {
    await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(tokenFrom(request))).run();
    return response({ok:true});
  }
  if (path === "/api/private/profile" && method === "GET") {
    const row = await env.DB.prepare("SELECT profile_json,updated_at FROM personal_profile WHERE id=1").first();
    return response({profile:row ? JSON.parse(row.profile_json) : {},updatedAt:row?.updated_at || null});
  }
  if (path === "/api/private/profile" && method === "PUT") {
    const raw = await request.text();
    if (raw.length > 80000) return response({error:"Profile too large"},413);
    let body; try { body=JSON.parse(raw); } catch { return response({error:"Invalid JSON"},400); }
    if (!validProfile(body.profile)) return response({error:"Invalid profile fields"},400);
    await env.DB.prepare("INSERT INTO personal_profile(id,profile_json,updated_at) VALUES(1,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET profile_json=excluded.profile_json,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(body.profile)).run();
    return response({ok:true});
  }
  if (path === "/api/private/applications" && method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM applications ORDER BY updated_at DESC LIMIT 1000").all();
    return response({applications:rows.results || []});
  }
  if (path === "/api/private/applications" && method === "POST") {
    let body; try {body=await request.json()}catch{return response({error:"Invalid JSON"},400)}
    const fields=["title","company","platform","status","url","notes"];
    if (!body || typeof body!=="object" || fields.some(k=>typeof body[k]!=="string" || body[k].length>5000) || !body.title.trim() || !body.company.trim() || !statuses.includes(body.status)) return response({error:"Invalid application"},400);
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO applications(id,title,company,platform,status,url,notes) VALUES(?,?,?,?,?,?,?)").bind(id,...fields.map(k=>body[k])).run();
    return response({ok:true,id},201);
  }
  return response({error:"Not found"},404);
}
