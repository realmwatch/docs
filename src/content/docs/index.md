---
title: Realmwatch
description: Open-source tools for keeping a small server fleet secure.
---

Realmwatch makes open-source tools for teams that run their own servers: a
handful to a few hundred Linux machines, often looked after by people who
have other jobs too. The tools aim to be small, quiet until something
matters, and easy to run yourself.

## Projects

- **[Heimdall](/heimdall/)**: fleet security from one small hub. Each server
  runs a short collector script that reports its OS, packages and sites; the
  hub turns that into vulnerability findings, end-of-life warnings, login and
  privilege-session tracking, attack-surface mapping and alerts.
  Start with [Getting started](/heimdall/getting-started/).

## About these docs

Each project keeps its documentation in its own repository, next to the code.
This site pulls those pages in at build time from each project's latest
release, so what you read here matches what you can install. Every page says
which release it came from and links to its source.

- [Security](/security/): how releases are signed and how to verify them.
- [Contributing](/contributing/): how to fix or add a page.

All Realmwatch projects are free software under the
[GNU AGPL v3](https://www.gnu.org/licenses/agpl-3.0.html).
