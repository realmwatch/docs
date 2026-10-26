// Helpers for the optional "nav" field in projects.json, shared by
// scripts/fetch-docs.mjs and astro.config.mjs.
//
// "nav" groups a project's pages in the sidebar:
//   [{ "label": "Set up", "items": ["getting-started", { "page": "hosting", "label": "Where to host" }] }]
// An item is a page name (its docs/ path without .md) or { page, label }, where
// label is a shorter sidebar label than the page's title.

/** Page name of a nav item. */
export const navPage = (item) => (typeof item === 'string' ? item : item.page);

/** Page names in sidebar order, from "nav" or else the older flat "order". */
export const navPages = (p) => (p.nav ? p.nav.flatMap((g) => g.items.map(navPage)) : (p.order ?? []));
