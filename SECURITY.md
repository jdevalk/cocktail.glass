# Security Policy

## Supported versions

cocktail.glass is a continuously deployed website. Only the current live version at [cocktail.glass](https://cocktail.glass) is supported — there are no separately released versions to patch.

## Reporting a vulnerability

Please do **not** report security issues through public GitHub issues.

Report them privately instead, by either:

- Opening a [private security advisory](https://github.com/jdevalk/cocktail.glass/security/advisories/new) on this repository, or
- Emailing **joost@joost.blog** with the details.

Please include enough to reproduce the issue — the affected URL or endpoint, and the steps involved.

## What to expect

- An acknowledgement within a few working days.
- An assessment of the report, and — where the issue is confirmed — a fix deployed to the live site as quickly as is practical.
- An update once the issue is resolved.

The areas most relevant to security reports are the MCP server at `/mcp`, the API endpoints under `/api/`, and the photo-upload feature.
