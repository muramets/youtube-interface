/**
 * Synthetic user message sent when the user clicks "Memorize".
 * The LLM processes this as the last turn of the conversation,
 * calling saveKnowledge for significant findings and saveMemory for the summary.
 */
export const CONCLUDE_INSTRUCTION = `Based on our conversation, extract Knowledge Items and Memory:

1. For each significant analysis result (traffic breakdown, packaging audit, suggested pool analysis, channel journey, strategy insight, etc.), call saveKnowledge with:
   - An appropriate category slug (from the Knowledge Categories in the system prompt, or propose a new kebab-case slug)
   - A descriptive title
   - Comprehensive markdown content (the full analysis, not a summary)
   - A 2-3 sentence summary
   - The videoId if the analysis is about a specific video
   - The tools you used during the analysis

2. After all Knowledge Items are saved, call saveMemory with:
   - A concise summary of the conversation (key decisions, insights, action items, open questions)
   - References to the Knowledge Item IDs you just created (kiRefs)
   - Do NOT duplicate KI content in the memory — reference by ID instead

3. If this conversation was purely casual or administrative with no significant analysis results, skip saveKnowledge and only call saveMemory.`;
