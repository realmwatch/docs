---
title: Security
description: How Realmwatch releases are signed and verified.
---

## Signed releases

Every Realmwatch release is signed with [Sigstore](https://www.sigstore.dev/)
keyless signing. Each release ships a `SHA256SUMS` file listing every other
file in it. The project's release workflow, running in GitHub Actions for a
`v*` tag, signs `SHA256SUMS` with a short-lived certificate tied to that
workflow's identity, and publishes the signature as
`SHA256SUMS.sigstore.json`. The signature is recorded in Sigstore's public
transparency log, and there is no long-lived signing key to leak.

To verify a release, check the signature with
[cosign](https://github.com/sigstore/cosign), then check the files against
`SHA256SUMS`. What matters is not only that the signature is valid but **who
made it**: the project's own release workflow in the `realmwatch`
organization, triggered by a release tag. For Heimdall:

```sh
V=vX.Y.Z; R=https://github.com/realmwatch/heimdall/releases/download/$V
curl -fsSLO $R/install.sh -O $R/SHA256SUMS -O $R/SHA256SUMS.sigstore.json
cosign verify-blob SHA256SUMS --bundle SHA256SUMS.sigstore.json \
  --certificate-identity-regexp '^https://github.com/realmwatch/heimdall/\.github/workflows/release\.yml@refs/tags/v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
sha256sum -c --ignore-missing SHA256SUMS
```

You rarely need to do this by hand. Heimdall's installers and its
`upgrade` commands refuse a release whose signature doesn't verify, using a
pinned cosign build rather than whatever is installed. Only the very first
download of an installer is unchecked. For the details (the pinned cosign,
network requirements, and what to do where cosign can't run), see Heimdall's
[Release signatures](/heimdall/deployment/#release-signatures).

## Reporting a vulnerability

Please report security problems privately, using GitHub's **private
vulnerability reporting** (**Security → Report a vulnerability**) on the
affected repository. Don't open a public issue. Each project's `SECURITY.md`
has its scope and supported versions.
