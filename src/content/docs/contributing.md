---
title: Contributing
description: How the docs are organized and how to fix or add a page.
---

## Where the docs live

Each project's documentation lives in **its own repository**, in a `docs/`
folder, next to the code it describes. This site only holds the org-wide
pages (Overview, Security and this one) and the build that pulls everything
together.

To fix a project page, use **Edit page** at the bottom of it: that opens the
file on the project's `main` branch. Changes show up here once they are in a
release.

## Writing project docs

Project docs are plain Markdown that reads well on GitHub as well as here:

- **One `# Title` per file**, on the first heading line. It becomes the page
  title and sidebar label.
- **Relative links** between pages: `[the collector](collector.md#windows)`.
  They work on GitHub and are turned into site links here. Links to files
  outside `docs/` (source code, `../README.md`) become GitHub links at the
  same release.
- **Images** go in `docs/assets/` and are linked relatively:
  `![diagram](assets/flow.png)`.
- GitHub alerts (`> [!NOTE]`, `> [!WARNING]`) become callouts.
- No front matter or site-specific syntax is needed.

The build fails on a broken link or a missing `#anchor`, so a bad link is
caught before it is published.

## Adding a project

Add one entry to [`projects.json`](https://github.com/realmwatch/docs/blob/main/projects.json)
in this repository:

```json
{ "id": "my-tool", "name": "My Tool", "repo": "realmwatch/my-tool", "ref": "latest-release" }
```

`ref` is `latest-release` (the newest GitHub release) or any branch or tag.
An optional `order` array lists page names to put first in the sidebar; the
rest follow alphabetically.
