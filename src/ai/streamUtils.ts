import type { TokenLogprob } from "../types";
import type { StreamChunk } from "./openaiLogprobs";

type StreamPart = {
	type: string;
	text?: string;
	rawValue?: unknown;
	error?: unknown;
	providerMetadata?: unknown;
};

type StreamAppender = (delta: {
	content?: string;
	reasoning?: string;
	tokenLogprobs?: TokenLogprob[];
}) => void;

const toErrorMessage = (error: unknown) =>
	typeof error === "string"
		? error
		: error instanceof Error
			? error.message
			: "Failed to stream response";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const extractTokenLogprobsFromProviderMetadata = (
	providerMetadata: unknown,
): TokenLogprob[] | undefined => {
	if (!isRecord(providerMetadata)) {
		return undefined;
	}
	const dummyEntry = providerMetadata["dummy"];
	if (!isRecord(dummyEntry)) {
		return undefined;
	}
	const tokenLogprobs = dummyEntry["tokenLogprobs"];
	if (!Array.isArray(tokenLogprobs) || tokenLogprobs.length === 0) {
		return undefined;
	}
	return tokenLogprobs as TokenLogprob[];
};

export const processFullStream = async (
	fullStream: AsyncIterable<StreamPart>,
	{
		append,
		parseRawChunk,
	}: {
		append: StreamAppender;
		parseRawChunk?: (raw: unknown) => StreamChunk | undefined;
	},
) => {
	for await (const part of fullStream) {
		if (part.type === "error") {
			throw new Error(toErrorMessage(part.error));
		}

		const delta: {
			content?: string;
			reasoning?: string;
			tokenLogprobs?: TokenLogprob[];
		} = {};

		if (part.type === "text-delta" && part.text) {
			delta.content = part.text;
		}
		if (part.type === "reasoning-delta" && part.text) {
			delta.reasoning = part.text;
		}
		if (part.type === "raw" && parseRawChunk) {
			const chunk = parseRawChunk(part.rawValue);
			if (chunk?.tokenLogprobs?.length) {
				delta.tokenLogprobs = chunk.tokenLogprobs;
			}
		}

		const metadataTokenLogprobs = extractTokenLogprobsFromProviderMetadata(
			part.providerMetadata,
		);
		if (metadataTokenLogprobs?.length) {
			delta.tokenLogprobs = [
				...(delta.tokenLogprobs ?? []),
				...metadataTokenLogprobs,
			];
		}

		if (delta.content || delta.reasoning || delta.tokenLogprobs?.length) {
			append(delta);
		}
	}
};
