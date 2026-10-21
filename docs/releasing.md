# Publishing Artgen Effects

The root workspace is private. Only these six packages are published:
`artgen-ascii`, `artgen-pixel`, `artgen-cyanotype`, `artgen-risograph`,
`artgen-pop-art`, and `artgen-pointillism`.

## Prepare and review

Use Node.js 22.14 or later (CI uses Node 24).

```bash
npm ci
npm run release:check
```

This type-checks and builds the six packages, runs the algorithm and packaging
tests, executes all six in local workerd, and packs the approved files into
`artifacts/*.tgz`. `artifacts/release-manifest.json` records package sizes,
SHA-512 integrity values, file lists, official tool links, and a source fingerprint.
Packing also checks that the source and built files still match the last build.
The published files are limited to each package's README, MIT LICENSE,
package.json, ESM/CJS bundles, and ESM/CJS declarations.

Confirm every package version, the official tool links, and the contents of
each tarball. Update all six package versions together for the initial release.

## First publication

A package must exist before an npm trusted publisher can be configured.
For the first release, sign in through npm's normal secure web flow, using
the intended owner account, and complete any npm verification prompts.

```bash
npm login --auth-type=web --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
npm run release:publish
```

The publisher uploads the exact reviewed tarballs, one at a time, and verifies
registry integrity after each upload. It refuses changed source files or tarballs.
If a release stops midway, rerun it: versions already present with identical
integrity are verified and skipped. Existing versions with different contents
are rejected; choose a new version instead of trying to overwrite them.

Keep credentials out of files, issues, commit messages, and command arguments.
npm manages authentication and any required 2FA interaction.

## Subsequent releases with npm trusted publishing

After the six packages exist, configure each one's npm trusted publisher for:

- GitHub owner: `ziyu`
- Repository: `artgen-effects`
- Workflow filename: `publish.yml`
- Environment: leave empty (the provided workflow has no environment)

Use the npm package settings or the current npm trust CLI. The CLI requires a
recent npm version with `npm trust` support and interactive account verification.
For example:

```bash
npm trust github artgen-ascii --repo ziyu/artgen-effects --file publish.yml --allow-publish --yes
```

Repeat for the other five names. Do not assume that committing the workflow
configures npm: the trust relationship must be set on npm for each package.

Then update versions and lockfile, merge reviewed changes, create a matching
`vX.Y.Z` tag, and publish a GitHub release. The provided workflow rebuilds,
checks, packs, and publishes from that tag using npm OIDC. It can also be started
manually for an existing tag. It needs no stored npm write token. A first release
without configured trust must use the authenticated first-publication path.

For authoritative current authentication requirements, see
[npm package publishing](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/),
[npm trusted publishers](https://docs.npmjs.com/trusted-publishers/), and
[npm trust](https://docs.npmjs.com/cli/v12/commands/npm-trust/).

## Verify the public result

For each package, check the version, README, homepage, repository, and integrity:

```bash
npm view artgen-ascii@0.1.0 version dist.integrity homepage repository --json
```

The homepage must point to the matching `https://artgen.net/en/tools/...`
page. The README must contain the same link. Package metadata, README links,
and tarball contents are checked by `npm run pack`.
