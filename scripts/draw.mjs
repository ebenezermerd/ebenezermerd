// Draws every picture on the profile page in the same hand sketched style as
// ebenezermerd.me: rough.js for the pencil lines, the site's own fonts turned
// into outlines so GitHub shows them without loading anything.
//
//   npm run draw
//
// Each picture is written twice, on light paper and on dark, and the README
// picks one with prefers-color-scheme. The town is drawn from the live list of
// public repos, so the weekly workflow keeps it current.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import opentype from "opentype.js";
import rough from "roughjs";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}assets`;
mkdirSync(OUT, { recursive: true });

const font = (f) => {
  const b = readFileSync(`${ROOT}fonts/${f}`);
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const HAND = font("caveat-700.woff");
const HAND_SEMI = font("caveat-600.woff");
const PRINT = font("patrick-hand-400.woff");

// placeholders swapped for each theme's colours when a picture is written
const THEMES = {
  light: { PAPER: "#f6f1e6", PAPER2: "#efe8d8", INK: "#1d1b18", SOFT: "#6f675b", FAINT: "#ddd3bf", RED: "#d9472b" },
  dark: { PAPER: "#1c1b19", PAPER2: "#262421", INK: "#efe6d4", SOFT: "#a99f8e", FAINT: "#34312c", RED: "#ef6a4c" },
};

// --- pencil -----------------------------------------------------------------

const gen = rough.generator();
let seed = 1;
// the same picture on every run: each drawing takes the next seed in turn
const opts = (o = {}) => ({ roughness: 1.1, bowing: 1, stroke: "INK", strokeWidth: 1.6, seed: seed++, ...o });

// a tenth of a pixel is finer than any pencil, and keeps the files small
const short = (d) => d.replace(/(\.\d)\d+/g, "$1");

// every stroke can be drawn on in turn when the picture first loads
let delay = 0;
const paths = (drawable, { draw = false, step = 0.06 } = {}) => {
  const d = draw ? ` class="s" pathLength="1" style="--d:${(delay += step).toFixed(2)}s"` : "";
  return gen
    .toPaths(drawable)
    .map((p) => {
      const fill = p.fill && p.fill !== "none" ? p.fill : "none";
      const stroke = p.stroke && p.stroke !== "none" ? p.stroke : "none";
      // solid fills are not drawn on: they are there from the start
      const lines = fill === "none" ? d : "";
      return `<path d="${short(p.d)}" fill="${fill}" stroke="${stroke}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${lines}/>`;
    })
    .join("");
};

const line = (x1, y1, x2, y2, o, a) => paths(gen.line(x1, y1, x2, y2, opts(o)), a);
const rect = (x, y, w, h, o, a) => paths(gen.rectangle(x, y, w, h, opts(o)), a);
const poly = (pts, o, a) => paths(gen.polygon(pts, opts(o)), a);
const curve = (pts, o, a) => paths(gen.curve(pts, opts(o)), a);
const circle = (x, y, d, o, a) => paths(gen.circle(x, y, d, opts(o)), a);
const ellipse = (x, y, w, h, o, a) => paths(gen.ellipse(x, y, w, h, opts(o)), a);
const arc = (x, y, w, h, s, e, o, a) => paths(gen.arc(x, y, w, h, s, e, false, opts(o)), a);
const hatch = (fill = "SOFT", gap = 6) => ({ fill, fillStyle: "hachure", hachureGap: gap, fillWeight: 1 });
const paper = { fill: "PAPER", fillStyle: "solid", stroke: "none" };

// --- lettering --------------------------------------------------------------

const width = (s, size, f = PRINT) => f.getAdvanceWidth(s, size);
// each letter is outlined once per picture and reused wherever it appears,
// which keeps a card of handwriting to a few kilobytes
let glyphs = new Map();
const NAMES = new Map([
  [HAND, "h"],
  [HAND_SEMI, "s"],
  [PRINT, "p"],
]);
const glyph = (f, g) => {
  const id = `${NAMES.get(f)}${g.index}`;
  if (!glyphs.has(id)) glyphs.set(id, `<path id="${id}" d="${g.getPath(0, 0, f.unitsPerEm).toPathData(0)}"/>`);
  return id;
};
const text = (s, x, y, size, { f = PRINT, fill = "INK", anchor = "start", rotate = 0, draw = false } = {}) => {
  const w = width(s, size, f);
  let cx = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  const k = size / f.unitsPerEm;
  const list = f.stringToGlyphs(s);
  let uses = "";
  list.forEach((g, i) => {
    if (g.path.commands.length) uses += `<use href="#${glyph(f, g)}" x="${(cx / k).toFixed(0)}" y="${(y / k).toFixed(0)}"/>`;
    cx += (g.advanceWidth + (list[i + 1] ? f.getKerningValue(g, list[i + 1]) : 0)) * k;
  });
  const t = rotate ? `rotate(${rotate} ${x} ${y}) ` : "";
  const a = draw ? ` class="t" style="--d:${(delay += 0.04).toFixed(2)}s"` : "";
  return `<g fill="${fill}" transform="${t}scale(${k.toFixed(5)})"${a}>${uses}</g>`;
};
const wrap = (s, size, max, f = PRINT) => {
  const out = [""];
  for (const w of s.split(" ")) {
    const next = out.at(-1) ? `${out.at(-1)} ${w}` : w;
    if (width(next, size, f) > max && out.at(-1)) out.push(w);
    else out[out.length - 1] = next;
  }
  return out;
};
const fit = (s, size, max, f) => Math.min(size, (size * max) / width(s, size, f));

// --- the page ---------------------------------------------------------------

// drawn on once when the picture loads, never again; still for reduced motion
const STYLE = `<style>@media (prefers-reduced-motion:no-preference){.s{stroke-dasharray:1;stroke-dashoffset:1;animation:draw .9s ease-out forwards;animation-delay:var(--d)}.t{opacity:0;animation:ink .7s ease-out forwards;animation-delay:var(--d)}}@keyframes draw{to{stroke-dashoffset:0}}@keyframes ink{to{opacity:1}}</style>`;

const sheet = (w, h, body, { ruled = false, label } = {}) => {
  let bg = `<rect width="${w}" height="${h}" rx="18" fill="PAPER"/>`;
  if (ruled) {
    // a page from the sketchbook: ruled lines and a red margin
    for (let y = 44; y < h - 10; y += 34) bg += `<line x1="0" x2="${w}" y1="${y}" y2="${y}" stroke="FAINT" stroke-width="1"/>`;
    bg += `<line x1="64" x2="64" y1="0" y2="${h}" stroke="RED" stroke-opacity=".35" stroke-width="1.4"/>`;
  }
  const title = label ? `<title>${label}</title>` : "";
  const defs = `<defs>${[...glyphs.values()].join("")}</defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${title}${STYLE}${defs}${bg}${body}</svg>`;
};

const write = (name, svg) => {
  for (const [theme, c] of Object.entries(THEMES)) {
    const out = svg.replace(/\b(PAPER2|PAPER|INK|SOFT|FAINT|RED)\b/g, (k) => c[k]);
    writeFileSync(`${OUT}/${name}-${theme}.svg`, out);
  }
  console.log(`drew ${name}`);
};
const fresh = (s = 1) => {
  seed = s;
  delay = 0;
  glyphs = new Map();
};

// --- little buildings, shared by the header and the town ---------------------

function gable(x, g, w, h, a) {
  let s = rect(x, g - h, w, h, paper);
  s += rect(x, g - h, w, h, {}, a);
  const r = Math.min(w * 0.55, 46);
  s += poly([[x - 6, g - h], [x + w / 2, g - h - r], [x + w + 6, g - h]], { ...hatch("SOFT", 7) }, a);
  return s;
}

function windows(x, g, w, h, a, cols = 2) {
  let s = "";
  const pw = Math.min(14, (w - 16) / cols - 6);
  const rows = Math.max(1, Math.floor((h - 34) / 26));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const px = x + 8 + c * ((w - 16) / cols) + ((w - 16) / cols - pw) / 2;
      s += rect(px, g - h + 12 + r * 26, pw, 14, { strokeWidth: 1.1, roughness: 0.8 }, a);
    }
  return s;
}

function door(x, g, w, a) {
  const dw = Math.min(16, w * 0.24);
  return rect(x + w / 2 - dw / 2, g - 24, dw, 24, { strokeWidth: 1.2 }, a);
}

// --- header -----------------------------------------------------------------

function header() {
  fresh(11);
  const W = 1200,
    H = 440;
  let b = "";
  const name = "Abenezer Merdekios";
  b += text(name, 96, 140, fit(name, 96, 640, HAND), { f: HAND, draw: true });
  b += text("Software Engineer", 98, 196, 42, { f: HAND_SEMI, fill: "RED", draw: true });
  b += line(98, 210, 98 + width("Software Engineer", 42, HAND_SEMI), 212, { stroke: "RED", strokeWidth: 2 }, { draw: true });
  const lines = wrap(
    "Full stack developer crafting responsive, business ready web apps with React, Next.js and Laravel, blending clean UI/UX with reliable end to end functionality.",
    25,
    620,
  );
  lines.forEach((l, i) => (b += text(l, 98, 262 + i * 34, 25, { fill: "SOFT", draw: true })));
  const y = 262 + lines.length * 34 + 30;
  b += text("tour my work as a sketched town at ebenezermerd.me", 136, y, 25, { draw: true });
  b += line(98, y - 8, 126, y - 8, { stroke: "RED", strokeWidth: 2 }, { draw: true });
  b += line(117, y - 16, 127, y - 8, { stroke: "RED", strokeWidth: 2 }, { draw: true });
  b += line(117, y, 127, y - 8, { stroke: "RED", strokeWidth: 2 }, { draw: true });

  // a short street on the right: the kinds of buildings the portfolio town has
  const g = 388;
  b += line(740, g, 1176, g + 2, { strokeWidth: 2 }, { draw: true });
  // the house
  b += gable(758, g, 84, 104, { draw: true });
  b += windows(758, g, 84, 104, { draw: true });
  b += door(758, g, 84, { draw: true });
  // the glass tower, all panes
  b += rect(862, g - 214, 74, 214, paper);
  b += rect(862, g - 214, 74, 214, {}, { draw: true });
  for (let r = 1; r < 8; r++) b += line(862, g - 214 + r * 26.75, 936, g - 214 + r * 26.75, { strokeWidth: 1, roughness: 0.6 }, { draw: true, step: 0.02 });
  b += line(899, g - 214, 899, g, { strokeWidth: 1, roughness: 0.6 }, { draw: true });
  b += rect(868, g - 238, 62, 18, { stroke: "RED", strokeWidth: 1.6 }, { draw: true });
  // the soft house: rounded, a round window and an arched door
  b += paths(gen.path(`M956 ${g} L956 ${g - 70} Q956 ${g - 98} 984 ${g - 98} L1024 ${g - 98} Q1052 ${g - 98} 1052 ${g - 70} L1052 ${g} Z`, opts(paper)));
  b += paths(gen.path(`M956 ${g} L956 ${g - 70} Q956 ${g - 98} 984 ${g - 98} L1024 ${g - 98} Q1052 ${g - 98} 1052 ${g - 70} L1052 ${g}`, opts()), { draw: true });
  b += circle(1004, g - 62, 24, { strokeWidth: 1.3 }, { draw: true });
  b += arc(1004, g - 14, 22, 28, Math.PI, Math.PI * 2, { strokeWidth: 1.3 }, { draw: true });
  // the plain cube, one red line
  b += rect(1072, g - 76, 76, 76, paper);
  b += rect(1072, g - 76, 76, 76, {}, { draw: true });
  b += line(1072, g - 30, 1148, g - 30, { stroke: "RED", strokeWidth: 2 }, { draw: true });
  // a tree at the end of the street
  b += line(1166, g, 1166, g - 40, { strokeWidth: 1.6 }, { draw: true });
  b += circle(1166, g - 60, 44, { ...hatch("SOFT", 5) }, { draw: true });
  write("header", sheet(W, H, b, { ruled: true, label: "Abenezer Merdekios, Software Engineer" }));
}

// --- buttons ----------------------------------------------------------------

function buttons() {
  const list = [
    ["portfolio", "ebenezermerd.me", true],
    ["linkedin", "LinkedIn"],
    ["email", "Email"],
    ["twitter", "X / Twitter"],
  ];
  list.forEach(([k, label, main], i) => {
    fresh(40 + i);
    const W = 230,
      H = 64;
    // the portfolio button is the one in red, outline and letters both
    let b = rect(6, 8, W - 12, H - 16, { strokeWidth: main ? 2.2 : 1.8, stroke: main ? "RED" : "INK" });
    const size = fit(label, 30, W - 60, HAND);
    b += text(label, W / 2, H / 2 + size * 0.32, size, { f: HAND, anchor: "middle", fill: main ? "RED" : "INK" });
    write(`button-${k}`, sheet(W, H, b, { label }).replace(/<rect width="230" height="64" rx="18" fill="PAPER"\/>/, ""));
  });
}

// --- section headings -------------------------------------------------------

function heading(key, n, title, sub) {
  fresh(60 + n);
  const W = 1000,
    H = 104;
  let b = text(String(n).padStart(2, "0"), 8, 54, 44, { f: HAND, fill: "RED" });
  b += text(title, 72, 54, 48, { f: HAND });
  b += curve(
    [
      [72, 68],
      [72 + width(title, 48, HAND) * 0.5, 72],
      [76 + width(title, 48, HAND), 66],
    ],
    { stroke: "RED", strokeWidth: 2 },
  );
  b += text(sub, 74, 96, 21, { fill: "SOFT" });
  write(`heading-${key}`, sheet(W, H, b, { label: title }).replace(`<rect width="${W}" height="${H}" rx="18" fill="PAPER"/>`, ""));
}

// --- project cards ----------------------------------------------------------

const PROJECTS = [
  {
    key: "clinic",
    title: "Clinic Management System",
    kind: "Full Stack",
    text: "A complete clinic management system serving several branches, with its own workspace for admins, doctors, nurses, pharmacists and patients.",
    stack: ["Laravel", "TypeScript", "MySQL"],
  },
  {
    key: "jemaw",
    title: "Jemaw",
    kind: "Full Stack",
    text: "A Telegram native expense companion for friend groups. AI suggests expenses from the chat, members confirm them in a Mini App, and settle up.",
    stack: ["TypeScript", "grammY", "React", "PostgreSQL", "Gemini"],
  },
  {
    key: "osteodata",
    title: "Osteodata",
    kind: "Full Stack",
    text: "A cloud based healthcare platform for osteopathic clinics in Italy, covering patients, clinical records, appointments and documents.",
    stack: ["Next.js", "Express", "Prisma", "MySQL", "Google Cloud"],
  },
  {
    key: "issuefinder",
    title: "Issue Finder",
    kind: "Automation",
    text: "GitHub issue discovery for AI coding evaluation work, with smart filtering, live streamed scans and a score for every issue.",
    stack: ["Next.js", "FastAPI", "Python", "WebSockets"],
  },
  {
    key: "kits",
    title: "Lumen, Softly and Plain",
    kind: "UI/UX Design",
    text: "Three interface kits from my AliveUI design system lab: Apple style glass, soft neumorphism and a quiet minimal system, all over one token driven kit.",
    stack: ["Next.js", "React", "Tailwind CSS", "TypeScript"],
  },
  {
    key: "grove",
    title: "Grove",
    kind: "UI/UX Design",
    text: "A forest design system: GPU rendered wood with grain, bark and moss, grass you can brush and water that ripples under your hand.",
    stack: ["three.js", "WebGL", "JavaScript"],
  },
];

function cards() {
  PROJECTS.forEach((p, i) => {
    fresh(100 + i * 7);
    const W = 560,
      H = 280;
    // a card with a hatched shadow, pinned to the page at its corners
    let b = rect(22, 22, W - 34, H - 34, { ...hatch("FAINT", 5), stroke: "none" });
    b += rect(12, 12, W - 34, H - 34, paper);
    b += rect(12, 12, W - 34, H - 34, { strokeWidth: 1.8 });
    for (const [cx, cy] of [
      [12, 12],
      [W - 22, 12],
    ])
      b += line(cx - 8, cy + 8, cx + 8, cy - 8, { stroke: "RED", strokeWidth: 2 });
    b += text(`No. ${String(i + 1).padStart(2, "0")}`, 38, 58, 28, { f: HAND_SEMI, fill: "RED" });
    b += text(p.kind, 38 + width(`No. ${String(i + 1).padStart(2, "0")}`, 28, HAND_SEMI) + 14, 58, 20, { fill: "SOFT" });
    const ts = fit(p.title, 48, W - 90, HAND);
    b += text(p.title, 36, 108, ts, { f: HAND });
    wrap(p.text, 21, W - 90)
      .slice(0, 3)
      .forEach((l, k) => (b += text(l, 38, 146 + k * 27, 21)));
    let stack = p.stack.join("  ·  ");
    while (width(stack, 17) > W - 190) stack = stack.split("  ·  ").slice(0, -1).join("  ·  ");
    b += text(stack, 38, H - 42, 17, { fill: "SOFT" });
    b += text("visit", W - 86, H - 40, 28, { f: HAND, fill: "RED", anchor: "end" });
    b += line(W - 80, H - 49, W - 52, H - 49, { stroke: "RED", strokeWidth: 2 });
    b += line(W - 62, H - 57, W - 52, H - 49, { stroke: "RED", strokeWidth: 2 });
    b += line(W - 62, H - 41, W - 52, H - 49, { stroke: "RED", strokeWidth: 2 });
    write(`card-${p.key}`, sheet(W, H, b, { label: p.title }).replace(`<rect width="${W}" height="${H}" rx="18" fill="PAPER"/>`, ""));
  });
}

// --- the town, one building per public repo ----------------------------------

const ROOFS = {
  TypeScript: "flat",
  JavaScript: "saw",
  PHP: "gable",
  Blade: "gable",
  Hack: "gable",
  Python: "hip",
  Dart: "dome",
  Swift: "dome",
  Kotlin: "dome",
  "C++": "dome",
};

async function repos() {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "ebenezermerd-profile" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch("https://api.github.com/users/ebenezermerd/repos?per_page=100&type=owner&sort=pushed", { headers });
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  const all = await res.json();
  return all.filter((r) => !r.fork && !r.archived && !r.private && r.name !== "ebenezermerd");
}

async function town() {
  const list = (await repos()).sort((a, b) => b.pushed_at.localeCompare(a.pushed_at));
  const shown = list.slice(0, 14).reverse();
  fresh(300);
  const W = 1200,
    H = 520,
    g = 340;
  let b = line(30, g, W - 30, g + 2, { strokeWidth: 2 });
  const slot = (W - 100) / shown.length;
  shown.forEach((r, i) => {
    seed = 300 + [...r.name].reduce((s, c) => s + c.charCodeAt(0), 0);
    const w = Math.min(64, slot * 0.66);
    const x = 50 + i * slot + (slot - w) / 2;
    const h = Math.round(Math.min(190, 56 + 24 * Math.log2(1 + r.size / 150) + r.stargazers_count * 6));
    const roof = ROOFS[r.language] ?? "gable";
    if (roof === "gable") b += gable(x, g, w, h);
    else {
      b += rect(x, g - h, w, h, paper);
      b += rect(x, g - h, w, h);
    }
    if (roof === "flat") b += rect(x - 4, g - h - 8, w + 8, 8, hatch("SOFT", 4));
    if (roof === "saw") for (let k = 0; k < 3; k++) b += poly([[x + (k * w) / 3, g - h], [x + (k * w) / 3, g - h - 16], [x + ((k + 1) * w) / 3, g - h]], hatch("SOFT", 5));
    if (roof === "hip") b += poly([[x - 5, g - h], [x + w / 2, g - h - 22], [x + w + 5, g - h]], hatch("SOFT", 5));
    if (roof === "dome") b += arc(x + w / 2, g - h, w, w * 0.8, Math.PI, Math.PI * 2, hatch("SOFT", 5));
    b += windows(x, g, w, h, undefined, w > 50 ? 3 : 2);
    b += door(x, g, w);
    // the one pushed to last flies the red flag
    if (i === shown.length - 1) {
      const top = g - h - (roof === "gable" ? Math.min(w * 0.55, 46) : roof === "dome" ? w * 0.4 : 20);
      b += line(x + w / 2, top, x + w / 2, top - 40, { strokeWidth: 1.6 });
      b += poly([[x + w / 2, top - 40], [x + w / 2 + 28, top - 32], [x + w / 2, top - 24]], { fill: "RED", fillStyle: "solid", stroke: "RED" });
    }
    b += text(r.name, x + w / 2 + 6, g + 22, 17, { anchor: "end", rotate: -38, fill: "SOFT" });
  });
  const langs = new Set(list.map((r) => r.language).filter(Boolean));
  const date = new Date().toISOString().slice(0, 10);
  b += text(`${list.length} public repos in ${langs.size} languages`, 40, 44, 30, { f: HAND });
  b += text("roofs:  TypeScript flat  ·  JavaScript sawtooth  ·  PHP gable  ·  Python hip  ·  Dart and Swift dome", 40, 72, 17, { fill: "SOFT" });
  b += text(`redrawn ${date}`, W - 40, H - 22, 17, { anchor: "end", fill: "SOFT" });
  write("town", sheet(W, H, b, { label: "Abenezer's public repos drawn as a town" }));
}

// --- toolbox ----------------------------------------------------------------

const TOOLS = [
  ["Frontend", ["React", "Next.js", "TypeScript", "Tailwind CSS", "three.js"]],
  ["Backend", ["Laravel", "Node.js", "Express", "FastAPI", "Python"]],
  ["Data", ["MySQL", "PostgreSQL", "MongoDB", "Prisma", "Drizzle"]],
  ["Mobile and cloud", ["Flutter", "Docker", "Google Cloud", "Vercel", "Telegram bots"]],
];

function toolbox() {
  fresh(500);
  const W = 1200,
    H = 380;
  let b = "";
  TOOLS.forEach(([title, tools], i) => {
    const x = 40 + i * 290;
    b += text(title, x, 56, 32, { f: HAND, fill: "RED" });
    tools.forEach((t, k) => {
      const w = width(t, 22) + 34;
      const y = 82 + k * 56;
      b += rect(x, y, w, 40, { strokeWidth: 1.4, roughness: 1.3 });
      b += text(t, x + 17, y + 27, 22);
    });
  });
  write("toolbox", sheet(W, H, b, { label: "Tools: " + TOOLS.flatMap((t) => t[1]).join(", ") }));
}

// --- process ----------------------------------------------------------------

function process_() {
  fresh(600);
  const W = 1200,
    H = 250;
  const steps = ["Discovery and Research", "Design and Prototyping", "Development and Testing", "Launch and Support"];
  const xs = [140, 440, 760, 1060];
  let b = curve(
    [
      [40, 120],
      [140, 100],
      [290, 140],
      [440, 104],
      [600, 136],
      [760, 102],
      [910, 138],
      [1060, 104],
      [1160, 118],
    ],
    { strokeWidth: 2, stroke: "SOFT", strokeLineDash: [10, 8] },
  );
  const ys = [100, 104, 102, 104];
  steps.forEach((s, i) => {
    b += circle(xs[i], ys[i], 58, paper);
    b += circle(xs[i], ys[i], 58, { strokeWidth: 2, stroke: i === 3 ? "RED" : "INK" });
    b += text(String(i + 1), xs[i], ys[i] + 12, 36, { f: HAND, anchor: "middle", fill: i === 3 ? "RED" : "INK" });
    const [a, c] = s.split(" and ");
    b += text(`${a} and`, xs[i], 178, 24, { f: HAND, anchor: "middle" });
    b += text(c, xs[i], 206, 24, { f: HAND, anchor: "middle" });
  });
  write("process", sheet(W, H, b, { label: steps.join(", then ") }));
}

// --- footer -----------------------------------------------------------------

function footer() {
  fresh(700);
  const W = 1200,
    H = 280;
  let b = line(40, 236, W - 40, 238, { strokeWidth: 2 });
  // a stick man, waving
  const x = 150;
  b += circle(x, 104, 34, { strokeWidth: 2 });
  b += line(x, 121, x + 2, 186, { strokeWidth: 2 });
  b += line(x + 2, 186, x - 18, 236, { strokeWidth: 2 });
  b += line(x + 2, 186, x + 22, 236, { strokeWidth: 2 });
  b += line(x, 140, x - 30, 172, { strokeWidth: 2 });
  b += line(x, 140, x + 30, 118, { strokeWidth: 2 });
  b += line(x + 30, 118, x + 40, 84, { strokeWidth: 2 });
  // what he says
  b += ellipse(560, 112, 640, 150, { strokeWidth: 1.8 });
  b += line(260, 140, 210, 150, { strokeWidth: 1.8 });
  b += text("Say hello!", 560, 92, 46, { f: HAND, anchor: "middle", fill: "RED" });
  b += text("Available for freelance opportunities and collaborations.", 560, 128, 22, { anchor: "middle" });
  b += text("ebenezermerd@gmail.com", 560, 160, 22, { anchor: "middle", fill: "SOFT" });
  // the studio he works from, at the end of the street
  b += rect(960, 156, 150, 80, paper);
  b += line(960, 236, 960, 156);
  b += line(1110, 236, 1110, 156);
  b += line(960, 156, 1110, 156);
  b += poly([[946, 150], [1126, 138], [1126, 146], [946, 158]], hatch("SOFT", 5));
  b += rect(1000, 200, 70, 6, { strokeWidth: 1.4 });
  b += line(1010, 206, 1010, 236, { strokeWidth: 1.2 });
  b += line(1060, 206, 1060, 236, { strokeWidth: 1.2 });
  b += line(1022, 200, 1030, 186, { stroke: "RED", strokeWidth: 1.6 });
  b += line(1022, 200, 1046, 200, { stroke: "RED", strokeWidth: 1.6 });
  write("footer", sheet(W, H, b, { label: "Say hello: ebenezermerd@gmail.com" }));
}

header();
buttons();
["street:the street:a few of the buildings I have put up", "town:the town, live:every public repo as a building, redrawn each Monday", "toolbox:the toolbox:what I reach for", "process:how I work:four steps, every project"].forEach(
  (h, i) => heading(...[h.split(":")[0], i + 1, h.split(":")[1], h.split(":")[2]]),
);
cards();
toolbox();
process_();
footer();
await town();
