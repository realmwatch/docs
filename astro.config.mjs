// @ts-check
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { navPage, navPages } from './scripts/nav.mjs';

/** @type {{ id: string, name: string }[]} */
const projects = JSON.parse(readFileSync(new URL('./projects.json', import.meta.url), 'utf8'));

/** Page names fetched for a project (scripts/fetch-docs.mjs runs before Astro). */
function fetchedPages(id) {
  const dir = new URL(`./src/content/docs/${id}/`, import.meta.url);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map((f) => String(f).split('\\').join('/'))
    .filter((f) => /\.mdx?$/i.test(f))
    .map((f) => f.replace(/\.mdx?$/i, ''))
    .filter((f) => !/(^|\/)index$/.test(f));
}

/** A project's sidebar group: its "nav" groups if it has them, else every page. */
function projectSidebar(p) {
  if (!p.nav) return { label: p.name, items: [{ autogenerate: { directory: p.id } }] };
  const listed = navPages(p);
  const fetched = fetchedPages(p.id);
  const item = (it) => ({ slug: `${p.id}/${navPage(it)}`, ...(it.label && { label: it.label }) });
  const groups = p.nav.map((g) => ({
    label: g.label,
    items: g.items.filter((it) => fetched.includes(navPage(it))).map(item),
  }));
  // Pages a project added since its "nav" was written still get listed.
  const more = fetched.filter((f) => !listed.includes(f)).sort();
  if (more.length) groups.push({ label: 'More', items: more.map(item) });
  return {
    label: p.name,
    items: [{ label: 'Overview', slug: p.id }, ...groups.filter((g) => g.items.length)],
  };
}

export default defineConfig({
  // Public URL, used for canonical URLs and the sitemap. Keep in sync with
  // `routes` in wrangler.jsonc.
  site: 'https://docs.realmwatch.dev',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Realmwatch',
      description: 'Documentation for Realmwatch projects.',
      // The wordmark's text is near-white, so light mode gets a recolored copy.
      logo: {
        light: './src/assets/logo-light.png',
        dark: './src/assets/logo-dark.png',
        alt: 'Realmwatch',
        replacesTitle: true,
      },
      favicon: '/favicon.png',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/realmwatch' }],
      // Org pages are edited here. Project pages override this per page
      // (scripts/fetch-docs.mjs sets `editUrl` to the project's own repo).
      editLink: { baseUrl: 'https://github.com/realmwatch/docs/edit/main/' },
      lastUpdated: false,
      customCss: ['./src/styles/custom.css'],
      routeMiddleware: './src/routeData.ts',
      // Link previews (Slack, Discord, X, LinkedIn, iMessage...): one card for
      // every page. public/og.png is 1200x630; Starlight adds the title,
      // description, URL and twitter:card itself.
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://docs.realmwatch.dev/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: 'Realmwatch documentation' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://docs.realmwatch.dev/og.png' } },
      ],
      components: {
        PageTitle: './src/components/PageTitle.astro',
      },
      sidebar: [
        {
          label: 'Realmwatch',
          items: [
            { label: 'Overview', link: '/' },
            { label: 'Security', slug: 'security' },
            { label: 'Contributing', slug: 'contributing' },
          ],
        },
        ...projects.map(projectSidebar),
      ],
      plugins: [
        starlightLinksValidator({
          // Fetched pages use relative links (../other/#anchor), which is
          // what we want: check them rather than reject them.
          errorOnRelativeLinks: false,
        }),
      ],
    }),
  ],
});
