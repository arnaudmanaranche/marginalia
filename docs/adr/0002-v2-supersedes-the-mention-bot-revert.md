# 0002. V2 supersedes the 12 October 2026 revert of the mention bot

Status: accepted, 2026-10-29

On 9 October a team mode (`@marginalia` mentions, webhook, server mode) was built. On 12 October it was reverted as "not good in the product vision", on the grounds that the value is the reading experience and shared review skills, not a bot that lives in GitLab comments.

V2 brings the mention bot back on purpose. The reading experience stays the core: tour, diff pane, stop chat, risk, before/after overview, plain-words chapters, core change first. The mention is a second way in, and the bot only posts when asked (see 0004).

Mentions arrive by webhook where a Maintainer configured it, and by polling MR notes otherwise. The bot account and webhook need a Maintainer of the GitLab project; one is available.

Do not remove the mention bot because an older note says it was reverted. This record is the current decision.
