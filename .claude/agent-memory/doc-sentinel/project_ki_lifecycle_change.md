---
name: KI lifecycle — supersededBy removed
description: Knowledge Items no longer use auto-supersede chain. Each KI is a point-in-time snapshot. supersededBy field removed from type and all handlers.
type: project
---

Knowledge Items lifecycle changed from auto-supersede to point-in-time snapshots (2026-03-16, branch `feat/knowledge-items`).

**Why:** Auto-supersede (old KI marked with `supersededBy = newKiId`) was removed because each KI represents a snapshot of analysis at a specific point in time. Multiple KI for the same video+category are valid — they show how analysis evolved. Idempotency guard (same conversationId + category + videoId) still prevents duplicates within one conversation.

**How to apply:** When updating docs for Knowledge Items, never reference `supersededBy`, auto-supersede, or supersede chains. The `listKnowledge` handler no longer filters by `supersededBy`. The composite index for `category + supersededBy + videoId` is no longer needed.
