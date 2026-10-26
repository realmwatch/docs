import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import projects from '../projects.json';

// Puts the project's name in the titles of its pages, so a shared link to
// "Getting started" says which project it's for, and stops the home page
// title from repeating the site title ("Realmwatch | Realmwatch").
export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  const { id, entry, siteTitle } = route;
  const title = entry.data.title;

  const project = projects.find((p) => id.startsWith(`${p.id}/`));
  const isHome = id === '' || id === 'index';

  let pageTitle: string | undefined;
  if (project) pageTitle = `${title} · ${project.name}`;
  else if (isHome || title === siteTitle) pageTitle = title;
  if (!pageTitle) return;

  for (const tag of route.head) {
    if (tag.tag === 'title') {
      tag.content = isHome || title === siteTitle ? siteTitle : `${pageTitle} | ${siteTitle}`;
    } else if (tag.tag === 'meta' && tag.attrs?.property === 'og:title') {
      tag.attrs.content = pageTitle;
    } else if (isHome && tag.tag === 'meta' && tag.attrs?.property === 'og:type') {
      tag.attrs.content = 'website';
    }
  }
});
