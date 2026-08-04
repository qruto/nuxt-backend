# Security Policy

## Supported Versions

Only the latest release of `nuxt-backend` receives security fixes.

| Version | Supported |
| ------- | --------- |
| latest  | ✓         |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Use GitHub's private vulnerability reporting instead:

**[→ Report a vulnerability](https://github.com/qruto/nuxt-backend/security/advisories/new)**

(Also reachable from the repository's **Security** tab → **Report a vulnerability**.)

This opens a private draft advisory visible only to you and the maintainers. It keeps the whole
process — report, discussion, fix, credit, and publication — in one place, and no report can be
lost in a mailbox.

If you cannot use GitHub for any reason, email **razum@qruto.to** with the subject line
`[nuxt-backend] Security Vulnerability`.

### What to include

- A description of the vulnerability and its potential impact
- The affected version, and which part of the package is involved (module setup, a runtime
  composable or component, a server route, the Convex `backend` component — auth, billing,
  email, gifts —, the generated CSP, …)
- Steps to reproduce — proof-of-concept code or a minimal reproduction repository if possible
- Any suggested mitigations

### What happens next

1. **Acknowledgement within 48 hours** in the advisory thread (or by email if you reported that way).
2. We confirm the report, assess severity, and agree a fix timeline with you — targeting **7 days**
   for critical issues.
3. The fix is developed in the advisory's private fork, released, and the advisory is published
   through the [GitHub Advisory Database](https://github.com/advisories), which propagates it to
   `npm audit`, Dependabot, and other consumers of the package.
4. A CVE is requested through GitHub where the issue warrants one, and you are credited in the
   published advisory unless you ask to stay anonymous.

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure):
we ask that you give us reasonable time to patch and publish before disclosing publicly.

## Scope

In scope is code shipped by this package — module setup, runtime composables and components
(including the auth UI), Nitro server handlers, the Convex `backend` component (authentication,
billing, email, gifts and invitations), the Convex integrations it wires up, and the CSP
configuration this module generates.

Vulnerabilities in the upstream projects the package integrates with —
[`nuxt-convex-module`](https://github.com/qruto/nuxt-convex) (the Convex/Nuxt foundation this
package builds on), [Convex](https://github.com/get-convex),
[Better Auth](https://github.com/better-auth/better-auth), Polar, or Resend — belong in *their*
security process, not here. Report them to that project directly. If you are unsure which side a
finding lands on, report it here and we will route it.
