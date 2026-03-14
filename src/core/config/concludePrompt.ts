/**
 * Synthetic user message sent when the user clicks "Memorize".
 * The LLM processes this as the last turn of the conversation,
 * calling saveKnowledge for significant findings and saveMemory for the summary.
 *
 * Backend appends existing KI list (if any) to avoid duplicate creation.
 */
export const CONCLUDE_INSTRUCTION = `Based on our conversation, extract Knowledge Items and Memory.

RULES:
- Only save Knowledge Items for analyses YOU actually performed in this conversation using tools (analyzeTrafficSources, analyzeSuggestedTraffic, getMultipleVideoDetails, viewThumbnails, etc.)
- Do NOT create KI for general observations, opinions, or discussions — only for tool-backed analysis results
- Do NOT recreate or rephrase Knowledge Items that already exist (listed below if any)
- If a KI already exists for a category+video combination, skip it entirely
- Always pass videoId when the analysis is about a specific video

For each qualifying analysis, call saveKnowledge with:
- category: kebab-case slug from the Knowledge Categories in system prompt, or propose a new one
- title: descriptive title
- content: comprehensive markdown with the full analysis (not a summary)
- summary: 2-3 sentence summary
- videoId: the video this analysis is about (omit only for channel-level insights)
- toolsUsed: which tools you used

After all Knowledge Items are saved, call saveMemory with:
- A concise summary (key decisions, insights, action items, open questions)
- kiRefs: IDs of Knowledge Items you just created
- Do NOT duplicate KI content in memory — reference by ID

If this conversation had no tool-backed analysis, skip saveKnowledge and only call saveMemory.

In your final text response, reference Knowledge Items by TITLE (not raw ID). Example: "Created Knowledge Item: Channel Performance Journey" — not "KI: jSZc2L1ctPd7xh9KLLgc".`;
