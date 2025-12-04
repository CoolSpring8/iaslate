import type { ModelMessage } from "ai";
import type { Message, TokenLogprob } from "../types";

export type StreamChunk = {
	content?: string;
	reasoning?: string;
	tokenLogprobs?: TokenLogprob[];
};

const normalizeTopLogprobs = (
	raw:
		| Array<{ token: string; logprob: number }>
		| Record<string, number>
		| undefined,
): { token: string; probability: number }[] => {
	if (!raw) {
		return [];
	}
	if (Array.isArray(raw)) {
		return raw
			.map((entry) => ({
				token: entry.token,
				probability: Math.exp(entry.logprob),
			}))
			.filter((entry) => Number.isFinite(entry.probability));
	}
	return Object.entries(raw)
		.map(([token, logprob]) => ({
			token,
			probability: Math.exp(logprob),
		}))
		.filter((entry) => Number.isFinite(entry.probability));
};

const withFallbackToken = (
	alternatives: { token: string; probability: number }[],
	token: string,
): { token: string; probability: number }[] => {
	const existing = alternatives.find((entry) => entry.token === token);
	if (existing) {
		return alternatives;
	}
	return [{ token, probability: 0 }, ...alternatives];
};

const toStreamChunk = ({
	text,
	topLogprobs,
	segment,
	reasoning,
}: {
	text?: string;
	topLogprobs?:
		| Array<{ token: string; logprob: number }>
		| Record<string, number>;
	segment: "content" | "reasoning";
	reasoning?: string;
}): StreamChunk | undefined => {
	if (text === undefined) {
		return undefined;
	}
	const alternatives = withFallbackToken(
		normalizeTopLogprobs(topLogprobs),
		text,
	);
	const tokenLogprobs =
		alternatives.length > 0
			? [
					{
						token: text,
						probability:
							alternatives.find((entry) => entry.token === text)?.probability ??
							undefined,
						alternatives,
						segment,
					},
				]
			: undefined;
	if (segment === "reasoning") {
		return {
			reasoning: text,
			tokenLogprobs,
		};
	}
	return {
		content: text,
		tokenLogprobs,
		reasoning,
	};
};

export const toModelMessages = (
	messages: Message[],
	assistantPrefix?: string,
): ModelMessage[] => {
	const normalized: ModelMessage[] = [];
	for (const message of messages) {
		if (message.role === "tool") {
			continue;
		}
		if (message.role === "system") {
			normalized.push({
				role: "system",
				content: message.content,
			} as unknown as ModelMessage);
			continue;
		}
		if (message.role === "user") {
			normalized.push({
				role: "user",
				content: message.content,
			} as unknown as ModelMessage);
			continue;
		}
		normalized.push({
			role: "assistant",
			content: message.content,
		} as unknown as ModelMessage);
	}
	if (assistantPrefix) {
		normalized.push({
			role: "assistant",
			content: assistantPrefix,
		} as unknown as ModelMessage);
	}
	return normalized;
};

export const parseChatLogprobsChunk = (
	raw: unknown,
): StreamChunk | undefined => {
	const choice = (raw as { choices?: unknown[] })?.choices?.[0] as
		| {
				delta?: {
					content?: string | null;
					reasoning_content?: string | string[] | null;
				};
				logprobs?: {
					content?: Array<{
						token?: string;
						top_logprobs?:
							| Array<{ token: string; logprob: number }>
							| Record<string, number>;
					}>;
					top_logprobs?: Array<
						Array<{ token: string; logprob: number }> | Record<string, number>
					>;
				};
		  }
		| undefined;
	if (!choice) {
		return undefined;
	}
	const delta = choice.delta ?? {};
	const logprobs = choice.logprobs;
	const reasoningChunk =
		typeof delta.reasoning_content === "string"
			? delta.reasoning_content
			: Array.isArray(delta.reasoning_content)
				? delta.reasoning_content.join("")
				: undefined;
	const segment: "content" | "reasoning" =
		reasoningChunk !== undefined ? "reasoning" : "content";
	const entries =
		Array.isArray(logprobs?.content) && logprobs.content.length > 0
			? logprobs.content
			: undefined;
	if (entries?.length) {
		const tokenLogprobs = entries
			.map((entry) => {
				const token = entry.token ?? "";
				if (!token) {
					return undefined;
				}
				const alternatives = withFallbackToken(
					normalizeTopLogprobs(entry.top_logprobs),
					token,
				);
				return {
					token,
					probability:
						alternatives.find((alt) => alt.token === token)?.probability ??
						undefined,
					alternatives,
					segment,
				} satisfies TokenLogprob;
			})
			.filter(Boolean) as TokenLogprob[];
		if (tokenLogprobs.length > 0) {
			const chunkText =
				segment === "reasoning"
					? reasoningChunk ?? tokenLogprobs.map((entry) => entry.token).join("")
					: typeof delta.content === "string"
						? delta.content
						: undefined;
			return {
				...(chunkText !== undefined
					? segment === "reasoning"
						? { reasoning: chunkText }
						: { content: chunkText }
					: {}),
				tokenLogprobs,
				...(segment === "content" && reasoningChunk
					? { reasoning: reasoningChunk }
					: {}),
			};
		}
	}
	const fallback =
		logprobs?.content?.[0]?.top_logprobs ??
		logprobs?.top_logprobs?.[0] ??
		undefined;
	return toStreamChunk({
		text:
			segment === "reasoning"
				? reasoningChunk
				: delta.content === null
					? undefined
					: typeof delta.content === "string"
						? delta.content
						: undefined,
		topLogprobs: fallback,
		segment,
		reasoning: reasoningChunk,
	});
};

export const parseCompletionLogprobsChunk = (
	raw: unknown,
): StreamChunk | undefined => {
	const choice = (raw as { choices?: unknown[] })?.choices?.[0] as
		| {
				text?: string;
				logprobs?: {
					content?: Array<{ token?: string; top_logprobs?: unknown }>;
					top_logprobs?: unknown[];
				};
		  }
		| undefined;
	if (!choice) {
		return undefined;
	}
	const entries =
		choice.logprobs?.content && Array.isArray(choice.logprobs.content)
			? choice.logprobs.content
			: undefined;
	if (entries?.length) {
		const tokenLogprobs = entries
			.map((entry) => {
				const token = entry.token ?? "";
				if (!token) {
					return undefined;
				}
				const alternatives = withFallbackToken(
					normalizeTopLogprobs(
						entry.top_logprobs as
							| Array<{ token: string; logprob: number }>
							| Record<string, number>,
					),
					token,
				);
				return {
					token,
					probability:
						alternatives.find((alt) => alt.token === token)?.probability ??
						undefined,
					alternatives,
					segment: "content",
				} satisfies TokenLogprob;
			})
			.filter(Boolean) as TokenLogprob[];
		if (tokenLogprobs.length > 0) {
			return {
				content:
					typeof choice.text === "string"
						? choice.text
						: tokenLogprobs.map((entry) => entry.token).join(""),
				tokenLogprobs,
			};
		}
	}
	return toStreamChunk({
		text: typeof choice.text === "string" ? choice.text : undefined,
		topLogprobs:
			(choice.logprobs?.top_logprobs?.[0] as
				| Array<{ token: string; logprob: number }>
				| Record<string, number>
				| undefined) ??
			(choice.logprobs?.content?.[0]?.top_logprobs as
				| Array<{ token: string; logprob: number }>
				| Record<string, number>
				| undefined),
		segment: "content",
	});
};

export const buildChatLogprobOptions = (
	providerName: string,
	topLogprobs = 5,
) => ({
	[providerName]: { logprobs: true, top_logprobs: topLogprobs },
});

export const buildCompletionLogprobOptions = (
	providerName: string,
	topLogprobs = 5,
) => ({
	[providerName]: { logprobs: topLogprobs },
});
