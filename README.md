# Realmwatch docs

The documentation site for [Realmwatch](https://github.com/realmwatch) projects,
built with [Astro Starlight](https://starlight.astro.build) and served as static
files from a Cloudflare Worker at <https://docs.realmwatch.dev>.

The domain is set in two places that must match: `site` in
[`astro.config.mjs`](astro.config.mjs) and `routes` in
[`wrangler.jsonc`](wrangler.jsonc).

## How it works

This repo holds only the org-wide pages (`src/content/docs/index.md`,
`security.md`, `contributing.md`) and the build. **Project docs stay in each
project's repo**, as plain Markdown in `docs/` with relative links, so they
read fine on GitHub too.

At build time, [`scripts/fetch-docs.mjs`](scripts/fetch-docs.mjs) reads
[`projects.json`](projects.json) and, for each project:

1. resolves `ref` (`latest-release` → the newest GitHub release tag; anything
   else is used as a branch or tag) via the public GitHub API;
2. downloads the repo tarball at that ref;
3. copies `docs/*.md` into `src/content/docs/<id>/` (git-ignored), and other
   files such as `docs/assets/` images into `public/projects/<id>/`;
4. converts each page: the first `# H1` becomes the title (and is removed so it
   isn't shown twice), `other.md#anchor` links become `../other/#anchor`, links
   outside `docs/` become GitHub links at the same ref, GitHub alerts become
   Starlight asides;
5. stamps each page with the release it came from, and points **Edit page** at
   the file on the project's `main` branch;
6. writes a `/<id>/` landing page if the project has no `docs/README.md`.

The sidebar lists the org pages first, then one group per project.
[starlight-links-validator](https://github.com/HiDeoo/starlight-links-validator)
fails the build on any broken internal link or `#anchor`. Search is built by
Pagefind (Starlight's default).

## Adding a project

Add one line to `projects.json`:

```json
{ "id": "my-tool", "name": "My Tool", "repo": "realmwatch/my-tool", "ref": "latest-release" }
```

Optional fields: `description` (shown on the project's landing page), `nav`
(groups pages in the sidebar and on the landing page, with optional short
sidebar labels; see `heimdall` in `projects.json` and
[`scripts/nav.mjs`](scripts/nav.mjs)), and `order` (without `nav`: page names
to list first; the rest follow alphabetically by title). Pages missing from
`nav` still show up, under **More**, and the build warns about them. The repo
must be public and have a `docs/` folder.

If the build fails on a link in a project's docs, fix it in that project, or,
if it's a conversion problem, in `scripts/fetch-docs.mjs`.

## Local development

Needs Node 22+ and pnpm 10.

```sh
pnpm install
pnpm dev        # fetch docs, then live-reload at http://localhost:4321
pnpm build      # fetch docs, then build to dist/ (and check links)
pnpm preview    # serve dist/
```

Set `GITHUB_TOKEN` to avoid the unauthenticated API rate limit. To preview a
project's unreleased docs from a local checkout:

```sh
DOCS_LOCAL_HEIMDALL=../heimdall pnpm dev
```

## Deploys

Cloudflare **Workers Builds** (Cloudflare's Git integration) builds and
deploys on every push to `main`. The Worker has no script; `wrangler.jsonc`
just serves `dist/` as static assets, with Starlight's 404 page for unknown
paths.

Workers Builds settings:

| Setting | Value |
|---|---|
| Root directory | `/` |
| Build command | `pnpm build` |
| Deploy command | `npx wrangler deploy` |
| Build variables | `NODE_VERSION=24` (also set by `.node-version`); optionally `PNPM_VERSION=10.34.9` and a `GITHUB_TOKEN` |

Project releases don't touch this repo, so a **nightly rebuild**
([`.github/workflows/nightly-rebuild.yml`](.github/workflows/nightly-rebuild.yml))
calls a Workers Builds deploy hook stored in the repository secret
`CF_DEPLOY_HOOK`. If the secret isn't set, the workflow does nothing. Run it
by hand (**Actions → Nightly rebuild → Run workflow**) to publish a release
right away.

## License

[GNU AGPL v3](LICENSE), the same as Heimdall.
