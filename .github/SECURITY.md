# Security policy

## Supported versions

Only the `main` branch and the most recent tagged release receive security
fixes. Older tags are not maintained.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Use one of the following private channels:

1. GitHub **Private vulnerability reporting** on this repository
   (`Security` tab → `Report a vulnerability`).
2. Email **marton.fabian.dev@gmail.com** with the subject prefix
   `[security] jobs-hunter:`.

Include, where possible:

- A description of the issue and its impact.
- Steps to reproduce or a proof-of-concept.
- The affected commit SHA or release tag.
- Your assessment of severity.

You can expect an initial acknowledgement within **5 business days**. We aim
to ship a fix or a documented mitigation within **30 days** of triage,
depending on severity and complexity. We will credit reporters in release
notes unless anonymity is requested.

## Automated security checks

Every pull request and push to `main` runs a security pipeline
(`.github/workflows/ci.yml`). Gating policy:

- **Blocking:** lint/format/tests, secret scan (gitleaks), CodeQL analysis,
  and the container image build plus smoke test.
- **Informational:** Semgrep SAST, Hadolint (Dockerfile), Checkov (IaC),
  Trivy image scanning, and dependency review publish findings to the
  **Security → Code scanning** tab (or the PR summary) without failing the
  build. Base-image OS vulnerabilities are tracked here rather than hard
  blocking; bump the base image or add a documented `.trivyignore` entry to
  address them.

A sticky `security-summary` comment on each pull request reports the status of
every check.

Recommended required status checks for branch protection on `main` (set by the
repository owner in the GitHub UI):

- `Lint, format, test (Node 20)`
- `Lint, format, test (Node 22)`
- `Secret scan (gitleaks)`
- `CodeQL (javascript)`
- `SAST (semgrep)`
- `Dockerfile lint (hadolint)`
- `IaC scan (checkov)`
- `Image build & scan (app)`
- `Image build & scan (admin)`
- `Dependency review`

Published container images are built multi-arch, get SLSA provenance and an
SBOM, and are signed with cosign keyless (`.github/workflows/release.yml`).

## Scope

In scope:

- Code in this repository (scripts, workflows, Docker image, configuration
  templates).
- Default configuration shipped with the project.

Out of scope:

- Self-hosted Directus deployments and their custom configuration.
- Third-party services (LinkedIn, etc.) that this project integrates with.
- Findings that require the attacker to already have administrative
  access to the host or Directus instance.
