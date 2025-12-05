import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelInfo } from "../types";

export const OPENAI_COMPATIBLE_PROVIDER_NAME = "user-openai-compatible";

const normalizeBaseURL = (baseURL: string) =>
	baseURL.trim().replace(/\/+$/, "");

export const buildOpenAICompatibleProvider = ({
	baseURL,
	apiKey,
}: {
	baseURL: string;
	apiKey: string;
}) => {
	const normalizedBaseURL = normalizeBaseURL(baseURL);
	if (!normalizedBaseURL) {
		return null;
	}
	return createOpenAICompatible({
		baseURL: normalizedBaseURL,
		name: OPENAI_COMPATIBLE_PROVIDER_NAME,
		apiKey: apiKey || "_PLACEHOLDER_",
	});
};

export const fetchOpenAICompatibleModels = async ({
	baseURL,
	apiKey,
}: {
	baseURL: string;
	apiKey: string;
}): Promise<ModelInfo[]> => {
	const normalizedBaseURL = normalizeBaseURL(baseURL);
	if (!normalizedBaseURL) {
		throw new Error("Base URL is required");
	}
	const response = await fetch(`${normalizedBaseURL}/models`, {
		headers: {
			Authorization: `Bearer ${apiKey || "_PLACEHOLDER_"}`,
		},
	});
	if (!response.ok) {
		throw new Error(`Request failed (${response.status})`);
	}
	const payload = (await response.json()) as { data?: ModelInfo[] };
	return Array.isArray(payload?.data) ? payload.data : [];
};
