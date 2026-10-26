// @ts-check
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

/** @type {{ id: string, name: string }[]} */
const projects = JSON.parse(readFileSync(new URL('./projects.json', import.meta.url), 'utf8'));

export default defineConfig({
  // TODO(domain): set this to the docs site's public URL once the custom
  // domain is chosen (also add it to `routes` in wrangler.jsonc). Used for
  // canonical URLs and the sitemap.
  // site: 'https://docs.example.com',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Realmwatch',
      description: 'Documentation for Realmwatch projects.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/realmwatch' }],
      // Org pages are edited here. Project pages override this per page
      // (scripts/fetch-docs.mjs sets `editUrl` to the project's own repo).
      editLink: { baseUrl: 'https://github.com/realmwatch/docs/edit/main/' },
      lastUpdated: false,
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
        ...projects.map((p) => ({ label: p.name, items: [{ autogenerate: { directory: p.id } }] })),
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
