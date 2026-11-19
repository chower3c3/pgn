// Build step: turns the in-browser-Babel pages into pre-rendered static HTML.
//
// The source pages (index.html, terms.html, privacy-policy.html) stay exactly as
// they are, so they can keep being edited the same way. At deploy time this script:
//   1. pulls the <script type="text/babel"> block out of each page
//   2. compiles it with esbuild (no more 3 MB Babel download in every visitor's browser)
//   3. renders <App/> to HTML on the server and puts it inside #root, with the CSS in <head>
//   4. ships a small hydrate bundle so the page is interactive exactly like before
//   5. adds Open Graph / Twitter / canonical / JSON-LD tags
// Output goes to dist/, which Vercel serves (see vercel.json).

import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIST = path.join(ROOT, "dist");
const TMP = path.join(ROOT, ".prerender-tmp");

const SITE = "https://www.pittsburghgolfnetwork.com";
// Image used when a link is shared on LinkedIn, Facebook, iMessage, Slack, etc.
// og-image.jpg is 1200x630, designed in scripts/og-image-source.html.
const OG_IMAGE = SITE + "/og-image.jpg";
const OG_IMAGE_ALT = "Pittsburgh Golf Network: The Links Between Pittsburgh's Best Professionals. Application-only golf and business networking.";

const PAGES = [
  { src: "index.html", url: "/", type: "website", jsonld: true },
  { src: "terms.html", url: "/terms" },
  { src: "privacy-policy.html", url: "/privacy-policy" },
];

// Static files copied to dist/ untouched.
// Month the calendar shows in the pre-rendered HTML (Pittsburgh time). The page then
// jumps to the visitor's current month after load, so a stale deploy never shows an old month.
const _ny = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric" }).formatToParts(new Date());
const RENDER_YM = [Number(_ny.find((p) => p.type === "year").value), Number(_ny.find((p) => p.type === "month").value) - 1];

const COPY = ["members", "box-assessment-32.webp", "og-image.jpg"];

const ENTRY_RE = /ReactDOM\.createRoot\(document\.getElementById\('root'\)\)\.render\(<App\/>\);\s*\n?\s*setTimeout\(\(\)=>\{const r=document\.getElementById\('root'\);if\(r\)r\.style\.opacity='1';\},100\);/;
const BABEL_RE = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
const CDN_RE = /\s*<!--[^>]*Babel via CDN[^>]*-->|\s*<script src="https:\/\/unpkg\.com\/(react|react-dom|@babel\/standalone)@[^"]+"[^>]*><\/script>/g;
// The "page could not be loaded" fallback that fires if #root is empty after 4s.
// Pre-rendered pages are never empty, so it is harmless, but we drop it to keep output clean.
const FALLBACK_RE = /\s*<script>\s*setTimeout\(function\(\)\{\s*var r = document\.getElementById\('root'\);\s*if \(r && !r\.hasChildNodes\(\)\)[\s\S]*?<\/script>/;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const attr = (html, re) => (html.match(re) || [])[1] || "";

function seoTags(html, page) {
  const title = attr(html, /<title>([\s\S]*?)<\/title>/).trim();
  const desc = attr(html, /<meta name="description" content="([^"]*)"/);
  const url = SITE + page.url;
  const tags = [
    `<link rel="canonical" href="${url}"/>`,
    `<meta property="og:type" content="${page.type || "article"}"/>`,
    `<meta property="og:site_name" content="Pittsburgh Golf Network"/>`,
    `<meta property="og:title" content="${esc(title)}"/>`,
    `<meta property="og:description" content="${esc(desc)}"/>`,
    `<meta property="og:url" content="${url}"/>`,
    `<meta property="og:image" content="${OG_IMAGE}"/>`,
    `<meta property="og:image:width" content="1200"/>`,
    `<meta property="og:image:height" content="630"/>`,
    `<meta property="og:image:alt" content="${esc(OG_IMAGE_ALT)}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:title" content="${esc(title)}"/>`,
    `<meta name="twitter:description" content="${esc(desc)}"/>`,
    `<meta name="twitter:image" content="${OG_IMAGE}"/>`,
  ];
  if (page.jsonld) {
    const ld = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Pittsburgh Golf Network",
      url: SITE + "/",
      logo: "https://assets.cdn.filesafe.space/o3gJLGbebcAizoBE8JHb/media/69d7dc539c84d38e9e7bc1d7.png",
      description: desc,
      areaServed: "Pittsburgh, PA",
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
  }
  return tags.map((t) => "  " + t).join("\n");
}

async function compile(code, file, opts) {
  const entry = path.join(TMP, file);
  writeFileSync(entry, code);
  const res = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    loader: { ".jsx": "jsx" },
    jsx: "transform",
    absWorkingDir: ROOT,
    nodePaths: [path.join(ROOT, "node_modules")],
    logLevel: "warning",
    ...opts,
  });
  return res.outputFiles[0].text;
}

async function renderPage(page) {
  const srcPath = path.join(ROOT, page.src);
  let html = readFileSync(srcPath, "utf8");
  const m = html.match(BABEL_RE);
  if (!m) throw new Error(`${page.src}: no <script type="text/babel"> block found`);
  const app = m[1];
  if (!ENTRY_RE.test(app)) throw new Error(`${page.src}: could not find the ReactDOM.createRoot(...).render(<App/>) line`);
  const body = app.replace(ENTRY_RE, "");
  const name = path.basename(page.src, ".html");

  // Server bundle: render to string with no browser globals present.
  const serverCode = await compile(
    `import React from "react";\nimport { renderToString } from "react-dom/server";\n${body}\nexport const html = renderToString(<App/>);\nexport const css = CSS;\n`,
    `${name}.server.jsx`,
    { platform: "node", format: "cjs", define: { "process.env.NODE_ENV": '"production"' } }
  );
  const serverFile = path.join(TMP, `${name}.server.cjs`);
  writeFileSync(serverFile, serverCode);
  globalThis.__PGN_RENDER_YM = RENDER_YM;
  const { html: markup, css } = createRequire(import.meta.url)(serverFile);
  if (!markup || markup.length < 500) throw new Error(`${page.src}: rendered markup looks empty`);

  // Client bundle: same app, hydrating the server HTML instead of building from scratch.
  const clientCode = await compile(
    `import React from "react";\nimport { hydrateRoot } from "react-dom/client";\n${body}\nhydrateRoot(document.getElementById("root"), <App/>);\n`,
    `${name}.client.jsx`,
    { platform: "browser", format: "iife", minify: true, target: "es2018", define: { "process.env.NODE_ENV": '"production"' } }
  );
  const hash = createHash("sha256").update(clientCode).digest("hex").slice(0, 10);
  const jsName = `/assets/${name}.${hash}.js`;
  mkdirSync(path.join(DIST, "assets"), { recursive: true });
  writeFileSync(path.join(DIST, jsName), clientCode);

  html = html
    .replace(CDN_RE, "")
    .replace(FALLBACK_RE, "")
    .replace(BABEL_RE, () => `<script>window.__PGN_RENDER_YM=${JSON.stringify(RENDER_YM)}</script>\n  <script src="${jsName}" defer></script>`)
    .replace(
      /<div id="root"[^>]*><\/div>/,
      () => `<div id="root">${markup}</div>`
    )
    .replace(
      "</head>",
      () =>
        `${seoTags(html, page)}\n  <style id="pgn-ssr-css">${css}</style>\n` +
        // Without JS, scroll-reveal sections would stay invisible; show them.
        `  <noscript><style>.reveal{opacity:1!important;transform:none!important}</style></noscript>\n</head>`
    );

  writeFileSync(path.join(DIST, page.src), html);
  console.log(`  ${page.src.padEnd(20)} ${(markup.length / 1024).toFixed(0).padStart(4)} KB html  ${(clientCode.length / 1024).toFixed(0).padStart(4)} KB js  -> ${jsName}`);
}

rmSync(DIST, { recursive: true, force: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
mkdirSync(TMP, { recursive: true });

console.log("Pre-rendering pages:");
for (const page of PAGES) await renderPage(page);
for (const f of COPY) if (existsSync(path.join(ROOT, f))) cpSync(path.join(ROOT, f), path.join(DIST, f), { recursive: true });
rmSync(TMP, { recursive: true, force: true });
console.log("Done. Output in dist/");
