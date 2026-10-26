#!/usr/bin/env node
// Fetches each project's docs/ folder (listed in projects.json) and turns it
// into Starlight pages under src/content/docs/<id>/.
//
// Node only, no dependencies. Needs `tar` on PATH (present on Linux, macOS and
// the Cloudflare Workers Builds image).
//
// Environment:
//   GITHUB_TOKEN          optional; raises the GitHub API rate limit.
//   DOCS_LOCAL_<ID>       optional; path to a local checkout of a project
//                         (e.g. DOCS_LOCAL_HEIMDALL=../heimdall) to preview
//                         unreleased docs without pushing anything.
//
// What it does per page:
//   - title from the first `# H1` (which is then removed, Starlight renders it);
//   - links to other docs pages (`other.md#anchor`) become site links
//     (`../other/#anchor`); links to files outside docs/ (`../README.md`,
//     source files) become GitHub links at the fetched ref;
//   - images and other files in docs/ (docs/assets/...) are copied to
//     public/projects/<id>/ and referenced from there;
//   - GitHub alerts (`> [!NOTE]`) become Starlight asides;
//   - frontmatter records which release the page came from and points
//     "Edit page" at the file on the project's main branch.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { navPage, navPages } from './nav.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'src/content/docs');
const publicDir = path.join(root, 'public/projects');
const projects = JSON.parse(readFileSync(path.join(root, 'projects.json'), 'utf8'));

const posix = path.posix;
const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.warn(`  warning: ${msg}`);
};

async function gh(url) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'realmwatch-docs' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${res.statusText}\n${await res.text()}`);
  return res;
}

/** "latest-release" → newest release tag; anything else is a branch or tag used as-is. */
async function resolveRef(p) {
  if (p.ref !== 'latest-release') return p.ref;
  const rel = await (await gh(`https://api.github.com/repos/${p.repo}/releases/latest`)).json();
  return rel.tag_name;
}

/** Downloads the repo at `ref` and returns the path of the extracted tree. */
async function download(p, ref) {
  const tmp = mkdtempSync(path.join(tmpdir(), `rw-docs-${p.id}-`));
  const res = await gh(`https://api.github.com/repos/${p.repo}/tarball/${encodeURIComponent(ref)}`);
  const tarball = path.join(tmp, 'src.tar.gz');
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  const out = path.join(tmp, 'src');
  mkdirSync(out);
  execFileSync('tar', ['-xzf', tarball, '-C', out, '--strip-components=1']);
  return { dir: out, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full, base);
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}

const isPage = (rel) => /\.mdx?$/i.test(rel);
const slugSegment = (s) => s.toLowerCase().replace(/\s+/g, '-');

/** docs-relative file path → site URL path ("collector.md" → "/heimdall/collector/"). */
function pageUrl(id, rel) {
  const parts = rel.replace(/\.mdx?$/i, '').split('/').map(slugSegment);
  if (/^(readme|index)$/.test(parts.at(-1))) parts.pop();
  return '/' + [id, ...parts].join('/') + '/';
}

/** Output file name inside src/content/docs/<id>/ (README.md → index.md). */
function outName(rel) {
  const parts = rel.split('/').map(slugSegment);
  parts[parts.length - 1] = parts.at(-1).replace(/^readme\.md$/, 'index.md');
  return parts.join('/');
}

function relUrl(from, to) {
  // Both are directory-style URLs ending in "/".
  let r = posix.relative(from, to);
  if (r === '') return './';
  return r + '/';
}

function plainText(md) {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
}

/** Applies fn to the parts of a line that are not inline code. */
function outsideInlineCode(line, fn) {
  return line
    .split(/(`+[^`]*`+)/)
    .map((seg, i) => (i % 2 ? seg : fn(seg)))
    .join('');
}

function convert(p, ref, rel, src, allFiles) {
  const fromUrl = pageUrl(p.id, rel);
  const fileDir = posix.dirname(rel);

  const rewriteTarget = (target) => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/|\?)/i.test(target)) return target; // absolute, mailto, anchor
    const hashAt = target.search(/[#?]/);
    const filePart = hashAt === -1 ? target : target.slice(0, hashAt);
    const hash = hashAt === -1 ? '' : target.slice(hashAt);
    if (!filePart) return target;
    const resolved = posix.normalize(posix.join(fileDir, decodeURI(filePart)));
    if (resolved.startsWith('../')) {
      // Outside docs/: link to the repo on GitHub at the same ref.
      const repoPath = posix.normalize(posix.join('docs', resolved)).replace(/\/$/, '');
      return `https://github.com/${p.repo}/blob/${ref}/${encodeURI(repoPath)}${hash}`;
    }
    const clean = resolved.replace(/\/$/, '');
    if (isPage(clean)) {
      if (!allFiles.has(clean)) warn(`${p.id}/${rel}: link to missing page ${target}`);
      return relUrl(fromUrl, pageUrl(p.id, clean)) + hash;
    }
    if (allFiles.has(clean)) return `/projects/${p.id}/${encodeURI(clean)}${hash}`;
    // A directory inside docs/ or something we don't have: send it to GitHub.
    warn(`${p.id}/${rel}: link to ${target} is not a docs page or file; linking to GitHub`);
    return `https://github.com/${p.repo}/tree/${ref}/docs/${encodeURI(clean)}${hash}`;
  };

  const rewriteLinks = (text) =>
    text
      .replace(/(\]\(\s*<?)([^)\s>]+)(>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\))/g, (_, a, t, b) => a + rewriteTarget(t) + b)
      .replace(/(\b(?:src|href)=")([^"]+)(")/g, (_, a, t, b) => a + rewriteTarget(t) + b)
      // A bare loopback URL ("open http://127.0.0.1:8080") is an instruction,
      // not a link: GitHub autolinks it, but it can't work from this site.
      .replace(/(?<![\w(<"'`/[])(https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?:[^\s)<>`]*[^\s)<>`.,;:!?])?)/g, (url) => {
        warn(`${p.id}/${rel}: bare local URL ${url} shown as code`);
        return '`' + url + '`';
      });

  // Split off existing frontmatter, if any.
  let body = src.replace(/\r\n/g, '\n');
  let existingFm = '';
  const fm = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    existingFm = fm[1];
    body = body.slice(fm[0].length);
  }

  const lines = body.split('\n');
  const out = [];
  let fence = null;
  let title = null;
  let alertDepth = null; // inside a converted GitHub alert
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (line.trim().startsWith(fence)) fence = null;
      out.push(line);
      continue;
    }
    if (fence) {
      out.push(line);
      continue;
    }
    if (title === null && /^#\s+/.test(line)) {
      title = plainText(line.replace(/^#\s+/, '').replace(/\s+#+\s*$/, ''));
      if (lines[i + 1] === '') i++;
      continue;
    }
    // GitHub alerts → Starlight asides.
    const alert = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
    if (alert) {
      const kind = { note: 'note', tip: 'tip', important: 'note', warning: 'caution', caution: 'danger' }[alert[1].toLowerCase()];
      out.push(`:::${kind}`);
      alertDepth = true;
      continue;
    }
    if (alertDepth) {
      if (/^>/.test(line)) {
        out.push(outsideInlineCode(line.replace(/^>\s?/, ''), rewriteLinks));
        continue;
      }
      out.push(':::');
      alertDepth = null;
    }
    // Reference-style link definitions: [label]: target
    const def = line.match(/^(\s{0,3}\[[^\]]+\]:\s*<?)(\S+?)(>?(?:\s.*)?)$/);
    if (def) {
      out.push(def[1] + rewriteTarget(def[2]) + def[3]);
      continue;
    }
    out.push(outsideInlineCode(line, rewriteLinks));
  }
  if (alertDepth) out.push(':::');

  if (title === null) {
    title = posix.basename(rel).replace(/\.mdx?$/i, '').replace(/[-_]/g, ' ');
    title = title.charAt(0).toUpperCase() + title.slice(1);
    warn(`${p.id}/${rel}: no "# H1"; title taken from the file name`);
  }

  return { title, existingFm, body: out.join('\n') };
}

function yamlFrontmatter(fields, existingFm) {
  const has = (key) => new RegExp(`^${key}\\s*:`, 'm').test(existingFm);
  const lines = existingFm ? [existingFm] : [];
  const emit = (key, value, indent = '') => {
    if (value && typeof value === 'object') {
      lines.push(`${indent}${key}:`);
      for (const [k, v] of Object.entries(value)) emit(k, v, indent + '  ');
    } else {
      lines.push(`${indent}${key}: ${JSON.stringify(value)}`);
    }
  };
  for (const [key, value] of Object.entries(fields)) if (!has(key)) emit(key, value);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

async function fetchProject(p) {
  const localEnv = `DOCS_LOCAL_${p.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  let srcRoot;
  let ref;
  let cleanup = () => {};
  if (process.env[localEnv]) {
    srcRoot = path.resolve(process.env[localEnv]);
    ref = 'main';
    console.log(`${p.name}: using local checkout ${srcRoot} (${localEnv})`);
  } else {
    ref = await resolveRef(p);
    console.log(`${p.name}: ${p.repo} @ ${ref}${p.ref !== ref ? ` (${p.ref})` : ''}`);
    ({ dir: srcRoot, cleanup } = await download(p, ref));
  }

  try {
    const docsDir = path.join(srcRoot, 'docs');
    if (!existsSync(docsDir)) throw new Error(`${p.repo}@${ref} has no docs/ folder`);
    const files = walk(docsDir);
    const allFiles = new Set(files);

    const outDir = path.join(contentDir, p.id);
    const assetDir = path.join(publicDir, p.id);
    rmSync(outDir, { recursive: true, force: true });
    rmSync(assetDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const pages = [];
    for (const rel of files) {
      if (!isPage(rel)) {
        const dest = path.join(assetDir, rel);
        mkdirSync(path.dirname(dest), { recursive: true });
        cpSync(path.join(docsDir, rel), dest);
        continue;
      }
      const src = readFileSync(path.join(docsDir, rel), 'utf8');
      pages.push({ rel, ...convert(p, ref, rel, src, allFiles) });
    }

    // Sidebar order: the pages listed in projects.json "nav" (or "order") first,
    // then the rest alphabetically by title.
    const order = navPages(p);
    const key = (rel) => rel.replace(/\.mdx?$/i, '');
    const ranked = [...pages].sort((a, b) => {
      const ia = order.indexOf(key(a.rel));
      const ib = order.indexOf(key(b.rel));
      if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
      return a.title.localeCompare(b.title);
    });
    const field = p.nav ? 'nav' : 'order';
    for (const k of order) if (!pages.some((pg) => key(pg.rel) === k)) warn(`${p.id}: "${field}" lists ${k}, which has no page`);
    if (p.nav) {
      for (const pg of pages) {
        if (!/^(readme|index)\.mdx?$/i.test(pg.rel) && !order.includes(key(pg.rel))) {
          warn(`${p.id}: ${pg.rel} is not in "nav" in projects.json; it goes under "More"`);
        }
      }
    }

    ranked.forEach((pg, i) => {
      const fields = {
        title: pg.title,
        editUrl: `https://github.com/${p.repo}/edit/main/docs/${pg.rel}`,
        sidebar: /^(readme|index)\.mdx?$/i.test(pg.rel) ? { label: 'Overview', order: 0 } : { order: i + 1 },
        source: {
          project: p.name,
          repo: p.repo,
          ref,
          path: `docs/${pg.rel}`,
          url: `https://github.com/${p.repo}/blob/${ref}/docs/${pg.rel}`,
        },
      };
      const dest = path.join(outDir, outName(pg.rel));
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, yamlFrontmatter(fields, pg.existingFm) + pg.body.replace(/^\n+/, ''));
    });

    // A landing page at /<id>/ unless the project ships its own docs/README.md:
    // with "nav", a card per group; otherwise a plain list of pages.
    if (!pages.some((pg) => /^(readme|index)\.mdx?$/i.test(pg.rel))) {
      const href = (pg) => relUrl(`/${p.id}/`, pageUrl(p.id, pg.rel));
      const intro = p.description ? `${p.description}\n\n` : '';
      const fromLine = `These pages come from the [\`docs/\` folder of ${p.repo}](https://github.com/${p.repo}/tree/${ref}/docs) at **${ref}**.`;
      const fm = yamlFrontmatter(
        { title: p.name, editUrl: false, tableOfContents: false, sidebar: { label: 'Overview', order: 0 } },
        '',
      );
      if (p.nav) {
        const byKey = new Map(ranked.map((pg) => [key(pg.rel), pg]));
        const groups = [
          ...p.nav.map((g) => ({
            label: g.label,
            items: g.items.filter((it) => byKey.has(navPage(it))).map((it) => ({ pg: byKey.get(navPage(it)), label: it.label })),
          })),
          { label: 'More', items: ranked.filter((pg) => key(pg.rel) !== 'index' && !order.includes(key(pg.rel))).map((pg) => ({ pg })) },
        ].filter((g) => g.items.length);
        const first = groups[0].items[0].pg;
        const attr = (v) => JSON.stringify(v).replace(/[{}<>]/g, (c) => `&#${c.charCodeAt(0)};`);
        const cards = groups
          .map((g) => {
            const links = g.items.map(({ pg, label }) => `- [${label ?? pg.title}](${href(pg)})`).join('\n');
            return `<Card title=${attr(g.label)}>\n\n${links}\n\n</Card>`;
          })
          .join('\n\n');
        writeFileSync(
          path.join(outDir, 'index.mdx'),
          fm +
            `import { Card, CardGrid, LinkCard } from '@astrojs/starlight/components';\n\n` +
            intro +
            `<LinkCard title=${attr(first.title)} description=${attr(`New to ${p.name}? Start here.`)} href=${attr(href(first))} />\n\n` +
            `<div class="rw-nav-cards">\n\n<CardGrid>\n\n${cards}\n\n</CardGrid>\n\n</div>\n\n` +
            `${fromLine}\n`,
        );
      } else {
        const list = ranked.map((pg) => `- [${pg.title}](${href(pg)})`).join('\n');
        writeFileSync(path.join(outDir, 'index.md'), fm + `${intro}${fromLine}\n\n${list}\n`);
      }
    }
    console.log(`  ${pages.length} pages, ${files.length - pages.length} other files`);
  } finally {
    cleanup();
  }
}

for (const p of projects) {
  if (!/^[a-z0-9-]+$/.test(p.id)) throw new Error(`projects.json: bad id ${JSON.stringify(p.id)}`);
  await fetchProject(p);
}
if (warnings.length) console.warn(`\n${warnings.length} warning(s) while converting docs (see above).`);
