// =============================================================================
// Title Generation — short chat title from first message
// =============================================================================

import { getClient } from "./client.js";

export async function generateTitle(
    apiKey: string,
    firstMessage: string,
    model: string
): Promise<string> {
    try {
        const ai = await getClient(apiKey);
        const response = await ai.models.generateContent({
            model,
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `Generate a very short title (3-5 words, no quotes) for a chat that starts with this message:\n\n"${firstMessage.slice(0, 200)}"`,
                        },
                    ],
                },
            ],
        });
        return response.text?.trim() || "New Chat";
    } catch (err) {
        console.warn(`[generateTitle] Failed to generate title via ${model}:`, err);
        return "New Chat";
    }
}
