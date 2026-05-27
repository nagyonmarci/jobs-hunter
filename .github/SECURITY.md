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
