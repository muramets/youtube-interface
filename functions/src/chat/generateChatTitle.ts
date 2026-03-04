/**
 * chat/generateChatTitle.ts — Generate a short conversation title from the first message.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
/** Utility model for title generation — always use the cheapest available. */
const TITLE_MODEL = 'gemini-2.5-flash';

const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const generateChatTitle = onCall(
    {
        secrets: [geminiApiKey],
        maxInstances: 3,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }

        const { firstMessage } = request.data as {
            firstMessage: string;
        };
        if (!firstMessage) {
            throw new HttpsError("invalid-argument", "firstMessage is required.");
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("internal", "Gemini API key is not configured on the server.");
        }

        const { generateTitle } = await import("../services/gemini/index.js");
        const title = await generateTitle(apiKey, firstMessage, TITLE_MODEL);
        return { title };
    }
);
