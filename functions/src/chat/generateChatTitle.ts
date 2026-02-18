/**
 * chat/generateChatTitle.ts — Generate a short conversation title from the first message.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { ALLOWED_MODEL_IDS, DEFAULT_MODEL_ID } from "../config/models.js";

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

        const { firstMessage, model } = request.data as {
            firstMessage: string;
            model?: string;
        };
        if (!firstMessage) {
            throw new HttpsError("invalid-argument", "firstMessage is required.");
        }
        const resolvedModel = model || DEFAULT_MODEL_ID;
        if (!ALLOWED_MODEL_IDS.has(resolvedModel)) {
            throw new HttpsError("invalid-argument", `Unsupported model: ${resolvedModel}`);
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("internal", "Gemini API key is not configured on the server.");
        }

        const { generateTitle } = await import("../services/gemini.js");
        const title = await generateTitle(apiKey, firstMessage, resolvedModel);
        return { title };
    }
);
