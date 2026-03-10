import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

const { mockPredict, mockLoggerWarn, mockToValue, mockFromValue, mockConstructorCalls } = vi.hoisted(() => ({
    mockPredict: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockToValue: vi.fn(),
    mockFromValue: vi.fn(),
    mockConstructorCalls: { count: 0 },
}));

vi.mock("@google-cloud/aiplatform", () => ({
    PredictionServiceClient: class MockPredictionServiceClient {
        constructor() { mockConstructorCalls.count++; }
        predict(...args: unknown[]) { return mockPredict(...args); }
    },
    helpers: {
        toValue: mockToValue,
        fromValue: mockFromValue,
    },
}));

vi.mock("firebase-functions/v2", () => ({
    logger: { warn: mockLoggerWarn },
}));

import { generateVisualEmbedding, resetVertexClient } from "../visualEmbedding.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_VISUAL_VECTOR = Array.from({ length: 1408 }, (_, i) => i * 0.001);

function thumbnail() {
    return {
        buffer: Buffer.from("fake-image-data"),
        mimeType: "image/jpeg",
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateVisualEmbedding", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetVertexClient();
        mockConstructorCalls.count = 0;
        process.env.GCLOUD_PROJECT = "test-project";
        // Default: toValue returns a mock IValue
        mockToValue.mockReturnValue({ structValue: "mock" });
    });

    afterEach(() => {
        delete process.env.GCLOUD_PROJECT;
    });

    it("returns 1408d array on success", async () => {
        mockPredict.mockResolvedValueOnce([{
            predictions: [{ imageEmbedding: MOCK_VISUAL_VECTOR }],
        }]);
        mockFromValue.mockReturnValueOnce({ imageEmbedding: MOCK_VISUAL_VECTOR });

        const result = await generateVisualEmbedding("testVideoId", thumbnail());

        expect(result).toEqual(MOCK_VISUAL_VECTOR);
        expect(result).toHaveLength(1408);
    });

    it("passes correct endpoint format", async () => {
        mockPredict.mockResolvedValueOnce([{
            predictions: [{ imageEmbedding: MOCK_VISUAL_VECTOR }],
        }]);
        mockFromValue.mockReturnValueOnce({ imageEmbedding: MOCK_VISUAL_VECTOR });

        await generateVisualEmbedding("testVideoId", thumbnail());

        expect(mockPredict).toHaveBeenCalledWith(
            expect.objectContaining({
                endpoint: "projects/test-project/locations/us-central1/publishers/google/models/multimodalembedding@001",
            }),
        );
    });

    it("sends image as base64 via toValue helper", async () => {
        const imgBuffer = Buffer.from("test-image");
        mockPredict.mockResolvedValueOnce([{
            predictions: [{ imageEmbedding: MOCK_VISUAL_VECTOR }],
        }]);
        mockFromValue.mockReturnValueOnce({ imageEmbedding: MOCK_VISUAL_VECTOR });

        await generateVisualEmbedding("testVideoId", {
            buffer: imgBuffer,
            mimeType: "image/jpeg",
        });

        expect(mockToValue).toHaveBeenCalledWith({
            image: { bytesBase64Encoded: imgBuffer.toString("base64") },
        });
    });

    it("returns null when Vertex AI API errors", async () => {
        mockPredict.mockRejectedValueOnce(new Error("Vertex AI unavailable"));

        const result = await generateVisualEmbedding("testVideoId", thumbnail());

        expect(result).toBeNull();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "visualEmbedding:failed",
            expect.objectContaining({
                videoId: "testVideoId",
                error: "Vertex AI unavailable",
            }),
        );
    });

    it("returns null when response has empty predictions", async () => {
        mockPredict.mockResolvedValueOnce([{ predictions: [] }]);

        const result = await generateVisualEmbedding("testVideoId", thumbnail());

        expect(result).toBeNull();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "visualEmbedding:emptyResponse",
            expect.objectContaining({ videoId: "testVideoId" }),
        );
    });

    it("returns null when prediction lacks imageEmbedding", async () => {
        mockPredict.mockResolvedValueOnce([{
            predictions: [{ someOtherField: "value" }],
        }]);
        mockFromValue.mockReturnValueOnce({ someOtherField: "value" });

        const result = await generateVisualEmbedding("testVideoId", thumbnail());

        expect(result).toBeNull();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "visualEmbedding:unexpectedFormat",
            expect.objectContaining({ videoId: "testVideoId" }),
        );
    });

    it("returns null when project ID is missing", async () => {
        delete process.env.GCLOUD_PROJECT;
        delete process.env.GOOGLE_CLOUD_PROJECT;
        delete process.env.GCP_PROJECT;

        const result = await generateVisualEmbedding("testVideoId", thumbnail());

        expect(result).toBeNull();
        expect(mockLoggerWarn).toHaveBeenCalledWith("visualEmbedding:missingProjectId");
    });

    it("returns null when toValue returns null", async () => {
        mockToValue.mockReturnValueOnce(null);

        const result = await generateVisualEmbedding("testVideoId", thumbnail());

        expect(result).toBeNull();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "visualEmbedding:toValueFailed",
            expect.objectContaining({ videoId: "testVideoId" }),
        );
    });

    it("caches PredictionServiceClient across calls", async () => {
        mockConstructorCalls.count = 0;

        mockPredict.mockResolvedValue([{
            predictions: [{ imageEmbedding: MOCK_VISUAL_VECTOR }],
        }]);
        mockFromValue.mockReturnValue({ imageEmbedding: MOCK_VISUAL_VECTOR });

        await generateVisualEmbedding("vid1", thumbnail());
        await generateVisualEmbedding("vid2", thumbnail());

        // Constructor called only once (cached)
        expect(mockConstructorCalls.count).toBe(1);
    });
});
