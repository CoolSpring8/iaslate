import type { ModelMessage } from "ai";
import type { Message, TokenLogprob } from "../types";

export type StreamChunk = {
	content?: string;
	reasoning?: string;
	tokenLogprobs?: TokenLogprob[];
};

type UserModelContent = Extract<ModelMessage, { role: "user" }>["content"];
type AssistantModelContent = Extract<
	ModelMessage,
	{ role: "assistant" }
>["content"];

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

const toTextContent = (content: Message["content"]) =>
	typeof content === "string"
		? content
		: content
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join("\n\n");

const toUserContent = (content: Message["content"]): UserModelContent =>
	typeof content === "string"
		? content
		: content.map((part) =>
				part.type === "text"
					? { type: "text", text: part.text }
					: {
							type: "image",
							image: part.image,
							...(part.mimeType ? { mediaType: part.mimeType } : {}),
						},
			);

const toAssistantContent = (
	content: Message["content"],
): AssistantModelContent => toTextContent(content);

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
				content: toTextContent(message.content),
			});
			continue;
		}
		if (message.role === "user") {
			normalized.push({
				role: "user",
				content: toUserContent(message.content),
			});
			continue;
		}
		normalized.push({
			role: "assistant",
			content: toAssistantContent(message.content),
		});
	}
	if (assistantPrefix) {
		normalized.push({
			role: "assistant",
			content: assistantPrefix,
		});
	}
	return normalized;
};

type TopLogprobs =
	| Array<{ token: string; logprob: number }>
	| Record<string, number>;

type ContentLogprobEntry = {
	token?: string;
	top_logprobs?: TopLogprobs;
};

type ChatLogprobChoice = {
	delta?: {
		content?: string | null;
		reasoning_content?: string | string[] | null;
	};
	logprobs?: {
		content?: ContentLogprobEntry[];
		top_logprobs?: TopLogprobs[];
	};
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isTopLogprobs = (value: unknown): value is TopLogprobs => {
	if (Array.isArray(value)) {
		return value.every(
			(entry) =>
				isRecord(entry) &&
				typeof entry["token"] === "string" &&
				typeof entry["logprob"] === "number",
		);
	}
	if (!isRecord(value)) {
		return false;
	}
	return Object.values(value).every((entry) => typeof entry === "number");
};

const toContentLogprobEntries = (
	value: unknown,
): ContentLogprobEntry[] | undefined => {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const entries: ContentLogprobEntry[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) {
			continue;
		}
		const topLogprobs = isTopLogprobs(entry["top_logprobs"])
			? entry["top_logprobs"]
			: undefined;
		const token =
			typeof entry["token"] === "string" ? entry["token"] : undefined;
		if (token === undefined && !topLogprobs) {
			continue;
		}
		entries.push({
			token,
			top_logprobs: topLogprobs,
		});
	}
	return entries.length > 0 ? entries : undefined;
};

const toTopLogprobList = (value: unknown): TopLogprobs[] | undefined => {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const entries: TopLogprobs[] = [];
	for (const entry of value) {
		if (isTopLogprobs(entry)) {
			entries.push(entry);
		}
	}
	return entries.length > 0 ? entries : undefined;
};

const toChatChoice = (raw: unknown): ChatLogprobChoice | undefined => {
	if (!isRecord(raw)) {
		return undefined;
	}
	const choices = raw["choices"];
	if (!Array.isArray(choices) || choices.length === 0) {
		return undefined;
	}
	const choice = choices[0];
	if (!isRecord(choice)) {
		return undefined;
	}
	const delta = isRecord(choice["delta"]) ? choice["delta"] : undefined;
	const reasoningContent = delta?.["reasoning_content"];
	const logprobs = isRecord(choice["logprobs"])
		? choice["logprobs"]
		: undefined;
	const contentEntries = toContentLogprobEntries(logprobs?.["content"]);
	const topLogprobs = toTopLogprobList(logprobs?.["top_logprobs"]);
	const deltaContent =
		typeof delta?.["content"] === "string"
			? delta["content"]
			: delta?.["content"] === null
				? null
				: undefined;
	const deltaReasoning =
		typeof reasoningContent === "string"
			? reasoningContent
			: Array.isArray(reasoningContent) &&
					reasoningContent.every((entry) => typeof entry === "string")
				? reasoningContent
				: reasoningContent === null
					? null
					: undefined;

	if (!delta && !contentEntries && !topLogprobs) {
		return undefined;
	}

	return {
		delta:
			deltaContent !== undefined || deltaReasoning !== undefined
				? {
						content: deltaContent,
						reasoning_content: deltaReasoning,
					}
				: undefined,
		logprobs:
			contentEntries || topLogprobs
				? {
						content: contentEntries,
						top_logprobs: topLogprobs,
					}
				: undefined,
	};
};

export const parseChatLogprobsChunk = (
	raw: unknown,
): StreamChunk | undefined => {
	const choice = toChatChoice(raw);
	if (!choice) {
		return undefined;
	}
	const delta = choice.delta;
	const logprobs = choice.logprobs;
	const reasoningChunk =
		typeof delta?.reasoning_content === "string"
			? delta.reasoning_content
			: Array.isArray(delta?.reasoning_content)
				? delta.reasoning_content.join("")
				: undefined;
	const segment: "content" | "reasoning" =
		reasoningChunk !== undefined ? "reasoning" : "content";
	const entries =
		Array.isArray(logprobs?.content) && logprobs.content.length > 0
			? logprobs.content
			: undefined;
	if (entries?.length) {
		const tokenLogprobs: TokenLogprob[] = entries.map((entry) => {
			const token = entry.token ?? "";
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
			};
		});
		if (tokenLogprobs.length > 0) {
			const chunkText =
				segment === "reasoning"
					? reasoningChunk ?? tokenLogprobs.map((entry) => entry.token).join("")
					: typeof delta?.content === "string"
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
				: delta?.content === null
					? undefined
					: typeof delta?.content === "string"
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
		const tokenLogprobs: TokenLogprob[] = entries.map((entry) => {
			const token = entry.token ?? "";
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
			};
		});
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
