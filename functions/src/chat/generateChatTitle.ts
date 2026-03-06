/**
 * chat/generateChatTitle.ts — Generate a short conversation title from the first message.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { UTILITY_MODEL_ID } from "../config/models.js";
import { logAiUsage } from "./helpers.js";
import { admin, db } from "../shared/db.js";
import { MODEL_REGISTRY } from "../shared/models.js";
import type { AuxiliaryCost } from "../shared/models.js";

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

        const { firstMessage, channelId, conversationId } = request.data as {
            firstMessage: string;
            channelId?: string;
            conversationId?: string;
        };
        if (!firstMessage) {
            throw new HttpsError("invalid-argument", "firstMessage is required.");
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("internal", "Gemini API key is not configured on the server.");
        }

        const { generateTitle } = await import("../services/gemini/index.js");
        const result = await generateTitle(apiKey, firstMessage, UTILITY_MODEL_ID);

        // Log usage + save AuxiliaryCost if channelId/conversationId provided (fire-and-forget)
        if (result.tokenUsage && channelId && conversationId) {
            logAiUsage(
                request.auth.uid,
                channelId,
                conversationId,
                UTILITY_MODEL_ID,
                result.tokenUsage,
                "title",
            ).catch(err => console.warn('[generateChatTitle] Failed to log usage', err));

            // Persist title cost as AuxiliaryCost on conversation doc
            const utilityConfig = MODEL_REGISTRY.find(m => m.id === UTILITY_MODEL_ID);
            const costUsd = utilityConfig?.pricing
                ? (result.tokenUsage.promptTokens / 1_000_000 * utilityConfig.pricing.inputPerMillion) +
                  (result.tokenUsage.completionTokens / 1_000_000 * utilityConfig.pricing.outputPerMillion)
                : 0;
            const titleCost: AuxiliaryCost = {
                id: `title-${Date.now()}`,
                type: 'title',
                model: UTILITY_MODEL_ID,
                costUsd,
                tokens: { input: result.tokenUsage.promptTokens, output: result.tokenUsage.completionTokens },
                createdAt: Date.now(),
            };
            const convPath = `channels/${channelId}/conversations/${conversationId}`;
            db.doc(convPath).update({
                auxiliaryCosts: admin.firestore.FieldValue.arrayUnion(titleCost),
            }).catch(err => console.warn('[generateChatTitle] Failed to persist title auxiliary cost', err));
        }

        return { title: result.title };
    }
);
