/**
 * Synthetic user message sent when the user clicks "Memorize".
 * Two-step flow: extract reusable knowledge into KI, then save
 * a cross-conversation memory summary.
 *
 * Backend appends existing KI list (if any) to help avoid duplicates.
 */
export const CONCLUDE_INSTRUCTION = `Review our conversation and save what matters.

STEP 1 — Knowledge Items:
Look for findings, analyses, or conclusions that have standalone value — whether from tool results, discussion, or strategic decisions.
- If you already saved KI in this conversation and new insights emerged since then — use editKnowledge to update them rather than creating duplicates.
- Only create a new KI (saveKnowledge) when the topic is genuinely new.
- When referencing videos in KI content, use [video title](vid://VIDEO_ID) links.
- Skip this step if nothing warrants a standalone Knowledge Item.

STEP 2 — Memory (always):
Call saveMemory with a concise summary for future conversations: key decisions, insights, action items, open questions.
- When referencing videos, use [video title](vid://VIDEO_ID) links.
- When referencing Knowledge Items, use [Title](ki://kiId) links instead of duplicating their content.`;
