# Security Policy

MetaUI is maintained by one person in their own time. This document says what
that realistically means for security reports, so you can decide how to use it.

## Supported versions

Only the latest release of the current major line gets fixes. Older major lines
are not patched; the fix is to upgrade.

| Version | Supported |
| :------ | :-------- |
| 2.x (latest release) | Yes |
| 1.x | No — upgrade to 2.x |

[`CHANGELOG.md`](CHANGELOG.md) records the breaking changes between 1.x and 2.x.

## What is in scope

MetaUI is a browser-side SAPUI5 library that builds control trees from metadata
you supply. It ships **no runtime npm dependencies** — the published tarball
declares none — so there is no transitive dependency chain to inherit from it.

In scope:

- A schema, OpenAPI document or OData metadata document that causes MetaUI to
  render something unsafe, for example injecting markup or script into a control,
  or building a binding expression out of untrusted input.
- A crafted schema that makes ingestion hang, allocate without bound, or recurse
  until the tab dies.
- A URL in schema-supplied data that bypasses `UrlValidator` and reaches the
  browser as a navigable or fetchable target.
- Anything in the published tarball that is not supposed to be there, or a
  mismatch between the tarball and this repository's source at that tag.
- A weakness in the release pipeline itself: the workflows in `.github/`, the
  trusted-publishing configuration, or the provenance attestation.

Out of scope:

- Advisories against build-time dependencies — `@ui5/cli` and its transitive
  packages — that have no upstream fix. They are visible in every CI run's
  summary and tracked by Dependabot, but they do not ship to you.
- SAPUI5 and OpenUI5 themselves. Report those to SAP.
- An application that feeds MetaUI a schema from an untrusted source without
  validating it. MetaUI treats the schema as configuration, not as user input;
  if your application lets strangers supply schemas, that is your trust boundary
  to defend.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting:

1. Go to <https://github.com/SiliconStreetDev1/MetaUI/security/advisories/new>
2. Describe the problem and how to reproduce it.

A minimal JSON Schema that triggers the behaviour, plus the SAPUI5 version you
are on, is usually enough to reproduce a rendering or ingestion bug exactly.

If private reporting is unavailable to you, open a normal issue that says only
that you have a security report and asks for a private channel — no details, no
proof of concept.

## What happens next

No service level agreement is offered, because a single maintainer cannot honour
one. What is offered instead:

- An acknowledgement that the report was read, usually within a week.
- An honest answer about whether it will be fixed, and roughly when. "Not soon"
  is a possible answer and you will be told it rather than left waiting.
- Credit in the release notes if you want it, and not if you do not.
- A fix released as a normal npm version with a GitHub Security Advisory, so
  `npm audit` picks it up.

If ninety days pass with no fix and no agreed extension, publish. You do not need
permission, and a report that goes quiet forever helps nobody.

## How releases are protected

Each release is published from [`.github/workflows/publish.yml`](.github/workflows/publish.yml)
by GitHub Actions using npm trusted publishing (OIDC). There is no long-lived npm
token in this repository or in its secrets. Because both the repository and the
package are public, npm attaches a provenance attestation to every published
version, so you can verify that a tarball came from this repository and this
workflow:

```bash
npm audit signatures
```

The release cannot run unless the full gate in
[`.github/workflows/verify.yml`](.github/workflows/verify.yml) passes: lint,
typecheck, build, the complete test suite, the packaging step, a check that the
tarball matches its manifest, and a check that the exported API surface has not
changed in a way the version number does not admit.

Workflow actions are pinned to full commit SHAs rather than to tags, so a moved
tag in a third-party action cannot change what runs during a release.
