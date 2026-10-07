# Security policy

## Supported versions

Security fixes target the latest released version. Version 0.1.0 is currently a release candidate.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/jbcom/game-mount/security/advisories/new) or email <jon@jonbogaty.com>. Do not disclose vulnerabilities in public issues before a fix is available.

Include affected versions, a minimal reproduction, impact and any proposed mitigation. Never send production credentials. Reports are reviewed by the maintainer; a response or release date is not guaranteed.

## Application responsibilities

This package mounts renderers and classifies load errors. Applications control asset URLs, content trust, WebGL resource budgets and how errors are displayed. Treat error messages and URLs as untrusted text when showing them in the UI.
