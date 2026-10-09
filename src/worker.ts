import {
  TRANSPARENT_GIF,
  isProxyOpen,
  isSelfOpen,
  summarize,
  type Mail,
  type Open,
} from "./lib.ts";

interface Env {
  DB: D1Database;
  INGEST_TOKEN: string;
}

const PIXEL_HEADERS = {
  "content-type": "image/gif",
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
  expires: "0",
};

function pixel(): Response {
  return new Response(TRANSPARENT_GIF, { headers: PIXEL_HEADERS });
}

function authed(req: Request, env: Env): boolean {
  return req.headers.get("authorization") === `Bearer ${env.INGEST_TOKEN}`;
}

// Dashboard routes sit behind Cloudflare Access, which injects this header.
// Requiring it means a misconfigured/absent Access policy fails closed.
function accessEmail(req: Request): string | null {
  return req.headers.get("cf-access-authenticated-user-email");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // --- Open pixel (public; recipients load this) ---
    if (req.method === "GET" && path.startsWith("/o/")) {
      const id = decodeURIComponent(path.slice(3)).replace(/\.gif$/, "");
      if (id) await recordOpen(env, id, req);
      return pixel(); // always return the pixel, even on error
    }

    // --- Ingest from the extension (Bearer token) ---
    if (req.method === "POST" && path === "/api/track") {
      if (!authed(req, env)) return new Response("unauthorized", { status: 401 });
      const b = (await req.json().catch(() => null)) as any;
      if (!b?.id) return new Response("bad request", { status: 400 });
      await env.DB.prepare(
        "INSERT OR REPLACE INTO mails (id, subject, recipient, sent_at) VALUES (?, ?, ?, ?)",
      )
        .bind(b.id, b.subject ?? "", b.recipient ?? "", b.sentAt ?? Date.now())
        .run();
      return new Response("ok");
    }

    if (req.method === "POST" && path === "/api/self-open") {
      if (!authed(req, env)) return new Response("unauthorized", { status: 401 });
      const b = (await req.json().catch(() => null)) as any;
      if (!b?.id) return new Response("bad request", { status: 400 });
      await env.DB.prepare("INSERT INTO self_marks (id, marked_at) VALUES (?, ?)")
        .bind(b.id, Date.now())
        .run();
      return new Response("ok");
    }

    // --- Dashboard (behind Cloudflare Access) ---
    if (req.method === "GET" && (path === "/" || path === "/api/stats")) {
      if (!accessEmail(req))
        return new Response("Enable Cloudflare Access for this route.", { status: 403 });
      const rows = await loadStats(env);
      if (path === "/api/stats")
        return Response.json(rows, { headers: { "cache-control": "no-store" } });
      return new Response(dashboardHtml(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("not found", { status: 404 });
  },
};

async function recordOpen(env: Env, id: string, req: Request): Promise<void> {
  const openedAt = Date.now();
  const ua = req.headers.get("user-agent") ?? "";

  const mail = await env.DB.prepare("SELECT sent_at FROM mails WHERE id = ?")
    .bind(id)
    .first<{ sent_at: number }>();
  if (!mail) return; // unknown id → ignore (e.g. stale/scanner probe)

  const marks = await env.DB.prepare("SELECT marked_at FROM self_marks WHERE id = ?")
    .bind(id)
    .all<{ marked_at: number }>();
  const selfMarks = (marks.results ?? []).map((m) => m.marked_at);

  const is_proxy = isProxyOpen(mail.sent_at, openedAt) ? 1 : 0;
  const is_self = isSelfOpen(openedAt, selfMarks) ? 1 : 0;

  await env.DB.prepare(
    "INSERT INTO opens (id, opened_at, ua, is_proxy, is_self) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, openedAt, ua, is_proxy, is_self)
    .run();
}

async function loadStats(env: Env) {
  const mails = await env.DB.prepare(
    "SELECT id, subject, recipient, sent_at FROM mails ORDER BY sent_at DESC LIMIT 500",
  ).all<Mail>();
  const opens = await env.DB.prepare(
    "SELECT id, opened_at, is_proxy, is_self FROM opens WHERE id IN (SELECT id FROM mails ORDER BY sent_at DESC LIMIT 500)",
  ).all<Open>();
  return summarize(mails.results ?? [], opens.results ?? []);
}

function dashboardHtml(): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>gtrack</title>
<style>
  :root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--line:#e5e5e5;--ok:#0a7c2f;--no:#999}
  @media(prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--mut:#999;--line:#2a2a2a;--ok:#4ade80;--no:#666}}
  body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
  main{max-width:900px;margin:0 auto;padding:24px 16px}
  h1{font-size:20px;margin:0 0 16px}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:12px;color:var(--mut);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
  .sub{font-weight:600}.to{color:var(--mut);font-size:13px}
  .opened{color:var(--ok);font-weight:600}.unopened{color:var(--no)}
  .auto{color:var(--mut);font-size:12px}
  .empty{color:var(--mut);padding:40px 0;text-align:center}
</style></head><body><main>
<h1>gtrack · 메일 열람</h1>
<div id="app" class="empty">불러오는 중…</div>
<script>
const fmt=t=>t?new Date(t).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
fetch('/api/stats').then(r=>r.json()).then(rows=>{
  const el=document.getElementById('app');
  if(!rows.length){el.textContent='아직 추적한 메일이 없습니다.';return}
  el.className='';
  el.innerHTML='<table><thead><tr><th>메일</th><th>상태</th><th>열람 수</th><th>처음</th><th>마지막</th></tr></thead><tbody>'+
    rows.map(r=>'<tr><td><div class="sub">'+esc(r.subject||'(제목 없음)')+'</div><div class="to">'+esc(r.recipient)+' · 보냄 '+fmt(r.sent_at)+'</div></td>'+
    '<td>'+(r.opened?'<span class="opened">열람</span>':'<span class="unopened">미열람</span>')+(r.auto_count?'<div class="auto">자동 의심 '+r.auto_count+'</div>':'')+'</td>'+
    '<td>'+r.open_count+'</td><td>'+fmt(r.first_open)+'</td><td>'+fmt(r.last_open)+'</td></tr>').join('')+'</tbody></table>';
});
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
</script></main></body></html>`;
}
