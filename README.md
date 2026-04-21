# Task Dashboard

Public task dashboard. Visitors can add tasks with urgency from 1 to 5. Only the owner can mark tasks as done.

Tasks are stored as GitHub Issues in the repository configured by `GITHUB_REPO`.

## Environment variables

- `GITHUB_TOKEN` - GitHub token with issue read/write access.
- `GITHUB_REPO` - repository in `owner/repo` format.
- `ADMIN_SECRET` - owner password for completing tasks.
