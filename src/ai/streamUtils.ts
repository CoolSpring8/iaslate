import type { TokenLogprob } from "../types";
import type { StreamChunk } from "./openaiLogprobs";

type StreamPart = {
	type: string;
	text?: string;
	rawValue?: unknown;
	error?: unknown;
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
		if (part.type === "text-delta" && part.text) {
			append({ content: part.text });
		}
		if (part.type === "reasoning-delta" && part.text) {
			append({ reasoning: part.text });
		}
		if (part.type === "raw" && parseRawChunk) {
			const chunk = parseRawChunk(part.rawValue);
			if (chunk?.tokenLogprobs?.length) {
				append({ tokenLogprobs: chunk.tokenLogprobs });
			}
		}
		if (part.type === "error") {
			throw new Error(toErrorMessage(part.error));
		}
	}
};
