// Casper Lead Scan. Two boards, one Worker, all content from D1.
//   /         main weekly board
//   /techbbq  TechBBQ 2026 special run
// Deploy once. The weekly scan writes rows to D1; this Worker renders whatever is there.

// SAFETY: this must stay false unless Cloudflare Access is enforcing on this Worker
// AND the Access policy names specific people. A policy that allows any email address
// makes the board self-serve public, emails included.
const SHOW_EMAILS = true;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const weeksSince = (d) => {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return Math.floor((Date.now() - Date.parse(d + "T00:00:00Z")) / 6048e5);
};

export default {
  async fetch(request, env) {
    const db = env.DB || env["casper-leads"] || env.casper_leads || env.CASPER_LEADS;
    if (!db) {
      return new Response("No D1 binding found. Bindings present: " + Object.keys(env).join(", "), {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    try {
      const { results: metaRows } = await db.prepare("SELECT k, v FROM meta").all();
      const meta = Object.fromEntries((metaRows || []).map((r) => [r.k, r.v]));

      let html;
      if (path === "/techbbq") {
        const { results } = await db
          .prepare("SELECT * FROM techbbq ORDER BY rank ASC")
          .all();
        html = renderTechbbq(results || [], meta);
      } else {
        const { results } = await db
          .prepare(
            "SELECT * FROM leads ORDER BY CASE WHEN score IS NULL THEN 1 ELSE 0 END, score DESC, company ASC"
          )
          .all();
        html = renderMain(results || [], meta);
      }
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-robots-tag": "noindex, nofollow",
        },
      });
    } catch (err) {
      return new Response("Board error: " + esc(err.message), {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  },
};

const CSS = `
:root{
--kh-dark:#1A1814;--kh-cream:#F7F5F0;--kh-indigo:#635BFF;--kh-indigo-soft:#ECEBFF;
--kh-white:#FFF;--kh-border:#E4E0D8;--kh-border-strong:#D6D1C7;
--kh-ink:#1A1814;--kh-ink-2:#7A756C;--kh-ink-3:#A8A299;--kh-on-dark-2:#B5AFA4;
--font-mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
--font-sans:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
--shadow-sm:0 1px 3px rgba(26,24,20,.06),0 1px 2px rgba(26,24,20,.04);
--shadow-md:0 4px 16px rgba(26,24,20,.06);
}
*{box-sizing:border-box}
body{margin:0;background:var(--kh-cream);color:var(--kh-ink);
font-family:var(--font-sans);font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:1200px;margin:0 auto;padding:32px}
header{background:var(--kh-dark);color:var(--kh-cream);padding:40px 0;margin-bottom:48px}
header .wrap{padding-top:0;padding-bottom:0}
.topbar{display:flex;justify-content:space-between;align-items:center;
gap:24px;flex-wrap:wrap;margin-bottom:32px}
.wordmark{font-family:var(--font-mono);font-size:13px;letter-spacing:.12em;
color:var(--kh-on-dark-2);text-transform:lowercase}
nav a{font-family:var(--font-mono);font-size:13px;letter-spacing:.06em;
color:var(--kh-on-dark-2);text-decoration:none;margin-left:24px;padding-bottom:4px}
nav a:hover{color:var(--kh-cream)}
nav a.on{color:var(--kh-cream);border-bottom:2px solid var(--kh-indigo)}
h1{font-family:var(--font-mono);font-size:44px;font-weight:700;letter-spacing:-.02em;
line-height:1.05;margin:0 0 12px}
.sub{color:var(--kh-on-dark-2);font-size:15px;margin:0;max-width:70ch}
.stats{display:flex;gap:48px;margin-top:32px;flex-wrap:wrap}
.stat b{display:block;font-family:var(--font-mono);font-size:34px;font-weight:700;
color:var(--kh-indigo);line-height:1.2}
.stat span{font-size:13px;color:var(--kh-on-dark-2)}
h2{font-family:var(--font-mono);font-size:24px;font-weight:700;letter-spacing:-.02em;
margin:0 0 8px}
.section-note{color:var(--kh-ink-2);font-size:15px;margin:0 0 24px;max-width:75ch}
.callout{background:var(--kh-white);border-radius:12px;box-shadow:var(--shadow-sm);
padding:24px 28px;margin-bottom:48px}
.callout h3{font-family:var(--font-mono);font-size:15px;font-weight:700;margin:0 0 8px;
letter-spacing:.04em;text-transform:uppercase;color:var(--kh-indigo)}
.callout p{margin:0;color:var(--kh-ink-2);font-size:15px;max-width:80ch}
.cards{display:grid;gap:16px;margin-bottom:64px}
.card{background:var(--kh-white);border-radius:12px;box-shadow:var(--shadow-sm);
padding:24px 28px;transition:box-shadow 240ms cubic-bezier(.4,0,.2,1)}
.card:hover{box-shadow:var(--shadow-md)}
.card-top{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:4px}
.card-top h3{font-family:var(--font-mono);font-size:20px;font-weight:700;margin:0}
.rank{font-family:var(--font-mono);font-size:15px;font-weight:700;color:var(--kh-ink-3)}
.score{font-family:var(--font-mono);font-weight:700;font-size:15px;color:var(--kh-indigo);
background:var(--kh-indigo-soft);border-radius:999px;padding:2px 12px}
.tag{font-size:13px;color:var(--kh-ink-2);background:var(--kh-cream);
border-radius:999px;padding:2px 12px}
.tag.warm{color:var(--kh-indigo);background:var(--kh-indigo-soft);font-weight:500}
.tag.stale{color:var(--kh-ink-3);background:var(--kh-cream);border:1px solid var(--kh-border)}
.where{color:var(--kh-ink-2);font-size:15px;margin:0 0 16px}
.trigger{font-size:15px;margin:0 0 16px}
.trigger b{font-weight:500}
.notes{color:var(--kh-ink-2);font-size:15px;margin:0 0 16px}
.block{margin:0 0 14px;font-size:15px}
.block .lab{font-family:var(--font-mono);font-size:13px;font-weight:600;
letter-spacing:.06em;text-transform:uppercase;color:var(--kh-ink-3);display:block}
.contact{font-size:15px;border-top:1px solid var(--kh-border);padding-top:16px;margin:16px 0 0}
.contact .muted{color:var(--kh-ink-3)}
.breakdown{font-family:var(--font-mono);font-size:13px;color:var(--kh-ink-3);margin:8px 0 0}
a{color:var(--kh-indigo);text-decoration:none}
a:hover{text-decoration:underline}
.tablewrap{overflow-x:auto;background:var(--kh-white);border-radius:12px;
box-shadow:var(--shadow-sm);margin-bottom:64px}
table{border-collapse:collapse;width:100%;font-size:15px;min-width:720px}
th{text-align:left;font-family:var(--font-mono);font-size:13px;font-weight:600;
letter-spacing:.06em;text-transform:uppercase;color:var(--kh-ink-2);
padding:16px 20px;border-bottom:1px solid var(--kh-border-strong);white-space:nowrap}
td{padding:14px 20px;border-bottom:1px solid var(--kh-border);vertical-align:top}
tr:last-child td{border-bottom:none}
td.co{font-weight:500;white-space:nowrap}
td.reason{color:var(--kh-ink-2);min-width:340px}
footer{color:var(--kh-ink-3);font-size:13px;padding:32px 0 64px;text-align:center}
@media(max-width:640px){
.wrap{padding:20px}h1{font-size:32px}.stats{gap:28px}.stat b{font-size:26px}
nav a{margin:0 16px 0 0}
}`;

function shell(title, headerInner, body, current) {
  const nav = [["/", "weekly board"], ["/techbbq", "techbbq 2026"]]
    .map(
      ([href, label]) =>
        `<a href="${href}"${href === current ? ' class="on"' : ""}>${label}</a>`
    )
    .join("");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<header><div class="wrap">
<div class="topbar"><div class="wordmark">kleen hub</div><nav>${nav}</nav></div>
${headerInner}
</div></header>
<div class="wrap">${body}
<footer>Private board. Not indexed. Prepared for Casper Kraefting.</footer>
</div></body></html>`;
}

function renderMain(leads, meta) {
  const qualified = leads.filter((l) => (l.status || "").startsWith("Qualified"));
  const rest = leads.filter((l) => !(l.status || "").startsWith("Qualified"));
  const stats = [
    [meta.total_companies || leads.length, "companies tracked"],
    [meta.screened_this_week || "0", "screened this run"],
    [qualified.length, "qualified now"],
  ];
  const head = `<h1>Casper Lead Scan</h1>
<p class="sub">Denmark and southern Sweden. Pre-seed to Series A, B2B only. Updated ${esc(
    meta.last_run || "unknown"
  )}.</p>
<div class="stats">${stats
    .map((s) => `<div class="stat"><b>${esc(s[0])}</b><span>${esc(s[1])}</span></div>`)
    .join("")}</div>`;

  const body = `<h2>Qualified</h2>
<p class="section-note">Every trigger below is verified against a named source. Job postings are confirmed live, not just present.</p>
<div class="cards">${qualified.map(mainCard).join("\n")}</div>

<h2>Screened and set aside</h2>
<p class="section-note">${rest.length} companies checked and parked, with the reason. Kept so no run repeats the work.</p>
<div class="tablewrap"><table>
<thead><tr><th>Company</th><th>Where</th><th>Status</th><th>Reason</th></tr></thead>
<tbody>${rest
    .map(
      (l) => `<tr><td class="co">${esc(l.company)}</td>
<td>${esc([l.city, l.country].filter(Boolean).join(", ")) || "&mdash;"}</td>
<td>${esc(l.status)}</td><td class="reason">${esc(l.notes)}</td></tr>`
    )
    .join("\n")}</tbody></table></div>`;

  return shell("Casper Lead Scan", head, body, "/");
}

function mainCard(l) {
  const where = [l.city, l.country].filter(Boolean).join(", ");
  const size = l.employees ? `${esc(l.employees)} people` : "";
  const src =
    l.source_url && l.source_url.startsWith("http")
      ? ` <a href="${esc(l.source_url)}" target="_blank" rel="noopener noreferrer">source</a>`
      : "";
  const w = weeksSince(l.trigger_date);
  const age =
    w === null
      ? ""
      : w <= 8
      ? `<span class="tag">${w} ${w === 1 ? "week" : "weeks"} old</span>`
      : `<span class="tag stale">trigger ${w} weeks old, outside window</span>`;
  const date = l.trigger_date ? ` (${esc(l.trigger_date)})` : "";

  let contact = `<strong>${esc(l.contact)}</strong>, ${esc(l.title)}`;
  const hasEmail = l.email && l.email !== "no email found";
  if (SHOW_EMAILS && hasEmail) {
    contact += ` &middot; <a href="mailto:${esc(l.email)}">${esc(l.email)}</a>`;
  } else if (hasEmail) {
    contact += ` &middot; <span class="muted">email held privately</span>`;
  } else {
    contact += ` &middot; <span class="muted">no email found, LinkedIn is the route</span>`;
  }

  return `<div class="card">
<div class="card-top"><h3>${esc(l.company)}</h3>
${l.score != null ? `<span class="score">${esc(l.score)}</span>` : ""}
<span class="tag">${esc(l.status)}</span>${age}
${l.warm_path ? `<span class="tag warm">Warm path: ${esc(l.warm_path)}</span>` : ""}
</div>
<p class="where">${esc(where)}${size ? " &middot; " + size : ""}</p>
<p class="trigger"><b>Trigger:</b> ${esc(l.trigger_desc)}${date}${src}</p>
${l.notes ? `<p class="notes">${esc(l.notes)}</p>` : ""}
<p class="contact">${contact}</p></div>`;
}

function renderTechbbq(rows, meta) {
  const ranked = rows.filter((r) => r.status === "Ranked");
  const watch = rows.filter((r) => r.status === "Watchlist");
  const dropped = rows.filter((r) => r.status === "Dropped");
  const stats = [
    ["4,660", "attendees swept"],
    ["515", "DK and SE B2B startups"],
    [ranked.length, "ranked leads"],
    [watch.length, "on the watchlist"],
  ];
  const head = `<h1>TechBBQ 2026</h1>
<p class="sub">${esc(meta.techbbq_source || "")} Special run, ${esc(
    meta.techbbq_date || ""
  )}.</p>
<div class="stats">${stats
    .map((s) => `<div class="stat"><b>${esc(s[0])}</b><span>${esc(s[1])}</span></div>`)
    .join("")}</div>`;

  const body = `${
    meta.techbbq_proposal
      ? `<div class="callout"><h3>Open proposal: reweight recency, do not gate on it</h3>
<p>${esc(meta.techbbq_proposal)}</p></div>`
      : ""
  }
<h2>Ranked</h2>
<p class="section-note">Every trigger has a source URL that states it. Anything that could not be sourced was dropped rather than guessed.</p>
<div class="cards">${ranked.map(tbCard).join("\n")}</div>

<h2>Watchlist</h2>
<p class="section-note">Fits the profile, no verified trigger. Each one names what is missing.</p>
<div class="cards">${watch.map(tbCard).join("\n")}</div>

<h2>Screened and dropped</h2>
<div class="tablewrap"><table>
<thead><tr><th>Company</th><th>Why not</th></tr></thead>
<tbody>${dropped
    .map(
      (r) =>
        `<tr><td class="co">${esc(r.company)}</td><td class="reason">${esc(r.note)}</td></tr>`
    )
    .join("\n")}</tbody></table></div>

${
  meta.techbbq_method
    ? `<div class="callout"><h3>Method</h3><p>${esc(meta.techbbq_method)}</p></div>`
    : ""
}`;

  return shell("TechBBQ 2026 · Casper Lead Scan", head, body, "/techbbq");
}

function tbCard(r) {
  const blocks = [
    ["What", r.what],
    ["The gap", r.gap],
    ["Angle", r.angle],
    ["Risk", r.risk],
    ["Note", r.note],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<p class="block"><span class="lab">${k}</span>${esc(v)}</p>`)
    .join("");

  const src =
    r.source_url && r.source_url.startsWith("http")
      ? ` <a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">source</a>`
      : "";
  const trig = r.trigger_desc
    ? `<p class="trigger"><b>Trigger:</b> ${esc(r.trigger_desc)}${
        r.trigger_age ? ` (${esc(r.trigger_age)})` : ""
      }${src}</p>`
    : "";

  let contact = "";
  if (r.contact) {
    const looksLikeEmail = r.email && r.email.includes("@") && !r.email.includes(" ");
    let tail;
    if (!r.email || r.email === "no email found") {
      tail = `<span class="muted">no email found</span>`;
    } else if (!looksLikeEmail) {
      tail = `<span class="muted">${esc(r.email)}</span>`;
    } else if (SHOW_EMAILS) {
      tail = `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`;
    } else {
      tail = `<span class="muted">email held privately</span>`;
    }
    contact = `<p class="contact"><strong>${esc(r.contact)}</strong>${
      r.title ? ", " + esc(r.title) : ""
    } &middot; ${tail}</p>`;
  }

  return `<div class="card">
<div class="card-top">
${r.rank && r.status === "Ranked" ? `<span class="rank">${esc(r.rank)}</span>` : ""}
<h3>${esc(r.company)}</h3>
${r.score != null ? `<span class="score">${esc(r.score)}</span>` : ""}
<span class="tag">${esc(r.status)}</span>
</div>
${
  r.city || r.employees
    ? `<p class="where">${esc(r.city || "")}${
        r.employees ? " &middot; " + esc(r.employees) + " people" : ""
      }</p>`
    : ""
}
${trig}${blocks}${contact}
${r.breakdown ? `<p class="breakdown">${esc(r.breakdown)}</p>` : ""}</div>`;
}
