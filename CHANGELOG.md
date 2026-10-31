# Changelog

## Unreleased

- Make chat, account, project, billing and hosted diagram workflows explicit with native XState 6 machines while keeping stored records and provider state authoritative.
- Fence late agent completion and failure against concurrent recovery so a recovered reply cannot be overwritten or charged again.
- Delete projects from the app or a connected agent, with explicit confirmation and a seven-day restore window.
- Restore deleted projects from Your processes when the account has room. Free now means keeping up to three projects at a time; deletion frees a slot.
- Revoke agent access immediately and permanently erase private project content after seven days while preserving usage, trial and billing records.
- Shorten the homepage FAQ to six questions covering diagrams, agents, plans, usage, privacy and projects.
- Track unpublished model snapshots for cleanup, cancel work authorized before deletion, recover abandoned reply reservations and preserve restored projects when list responses arrive out of order.
