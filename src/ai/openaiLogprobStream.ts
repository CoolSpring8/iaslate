import type { Message, MessageContent, TokenLogprob } from "../types";

type OpenAIChatMessage = {
	role: "system" | "user" | "assistant" | "tool";
	content:
		| string
		| Array<
				| { type: "text"; text: string }
				| { type: "image_url"; image_url: { url: string } }
		  >;
};

type StreamChunk = {
	content?: string;
	reasoning?: string;
	tokenLogprobs?: TokenLogprob[];
};

const normalizeBaseURL = (baseURL: string) => baseURL.replace(/\/+$/, "");

const buildURL = (baseURL: string, path: string) =>
	`${normalizeBaseURL(baseURL)}${path.startsWith("/") ? "" : "/"}${path}`;

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

const buildOpenAIMessageContent = (content: MessageContent) => {
	if (typeof content === "string") {
		return content;
	}
	return content.map((part) => {
		if (part.type === "text") {
			return { type: "text", text: part.text } as const;
		}
		return {
			type: "image_url",
			image_url: { url: part.image },
		} as const;
	});
};

export const toOpenAIChatMessages = (
	messages: Message[],
	options?: { assistantPrefix?: string },
): OpenAIChatMessage[] => {
	const openaiMessages: OpenAIChatMessage[] = messages.map((message) => ({
		role: message.role,
		content: buildOpenAIMessageContent(message.content),
	}));
	if (options?.assistantPrefix) {
		openaiMessages.push({
			role: "assistant",
			content: options.assistantPrefix,
		});
	}
	return openaiMessages;
};

async function* parseEventStream(response: Response) {
	if (!response.body) {
		return;
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
		const segments = buffer.split("\n\n");
		buffer = segments.pop() ?? "";
		for (const segment of segments) {
			const line = segment
				.split("\n")
				.map((entry) => entry.trim())
				.find((entry) => entry.startsWith("data:"));
			if (!line) {
				continue;
			}
			const payload = line.slice("data:".length).trim();
			if (payload === "" || payload === "[DONE]") {
				continue;
			}
			try {
				yield JSON.parse(payload);
			} catch {
				// Ignore malformed chunk.
			}
		}
		if (done) {
			break;
		}
	}
}

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

export const streamChatCompletionWithProbs = async function* ({
	baseURL,
	apiKey,
	model,
	messages,
	signal,
	topLogprobs = 5,
	temperature = 0.3,
}: {
	baseURL: string;
	apiKey: string;
	model: string;
	messages: OpenAIChatMessage[];
	signal?: AbortSignal;
	topLogprobs?: number;
	temperature?: number;
}): AsyncGenerator<StreamChunk> {
	const endpoint = buildURL(baseURL, "/chat/completions");
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey || "_PLACEHOLDER_"}`,
		},
		body: JSON.stringify({
			model,
			messages,
			temperature,
			stream: true,
			logprobs: true,
			top_logprobs: topLogprobs,
		}),
		signal,
	});
	if (!response.ok) {
		let detail: string | undefined;
		try {
			const payload = (await response.json()) as {
				error?: { message?: string };
			};
			detail = payload.error?.message;
		} catch {
			// ignore
		}
		throw new Error(detail ?? `Request failed (${response.status})`);
	}
	for await (const chunk of parseEventStream(response)) {
		const choice = chunk?.choices?.[0];
		if (!choice) {
			continue;
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
				.map(
					(entry: {
						token?: string;
						top_logprobs?:
							| Array<{ token: string; logprob: number }>
							| Record<string, number>;
					}) => {
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
					},
				)
				.filter(Boolean) as TokenLogprob[];
			if (tokenLogprobs.length > 0) {
				const chunkText =
					segment === "reasoning"
						? reasoningChunk ??
							tokenLogprobs.map((entry) => entry.token).join("")
						: typeof delta.content === "string"
							? delta.content
							: undefined;
				yield {
					...(chunkText !== undefined
						? segment === "reasoning"
							? { reasoning: chunkText }
							: { content: chunkText }
						: {}),
					tokenLogprobs,
					...(segment === "content" && reasoningChunk
						? { reasoning: reasoningChunk }
						: {}),
				} satisfies StreamChunk;
			}
			continue;
		}
		const fallback =
			logprobs?.content?.[0]?.top_logprobs ??
			logprobs?.top_logprobs?.[0] ??
			undefined;
		const streamChunk = toStreamChunk({
			text:
				segment === "reasoning"
					? reasoningChunk
					: typeof delta.content === "string"
						? delta.content
						: undefined,
			topLogprobs: fallback,
			segment,
			reasoning: reasoningChunk,
		});
		if (streamChunk) {
			yield streamChunk;
		}
	}
};

export const streamCompletionWithProbs = async function* ({
	baseURL,
	apiKey,
	model,
	prompt,
	signal,
	topLogprobs = 5,
	temperature = 0.3,
	maxTokens,
}: {
	baseURL: string;
	apiKey: string;
	model: string;
	prompt: string;
	signal?: AbortSignal;
	topLogprobs?: number;
	temperature?: number;
	maxTokens?: number;
}): AsyncGenerator<StreamChunk> {
	const endpoint = buildURL(baseURL, "/completions");
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey || "_PLACEHOLDER_"}`,
		},
		body: JSON.stringify({
			model,
			prompt,
			temperature,
			stream: true,
			logprobs: topLogprobs,
			max_tokens: maxTokens,
		}),
		signal,
	});
	if (!response.ok) {
		let detail: string | undefined;
		try {
			const payload = (await response.json()) as {
				error?: { message?: string };
			};
			detail = payload.error?.message;
		} catch {
			// ignore
		}
		throw new Error(detail ?? `Request failed (${response.status})`);
	}
	for await (const chunk of parseEventStream(response)) {
		const choice = chunk?.choices?.[0];
		if (!choice) {
			continue;
		}
		const entries =
			choice.logprobs?.content && Array.isArray(choice.logprobs.content)
				? choice.logprobs.content
				: undefined;
		if (entries?.length) {
			const tokenLogprobs = entries
				.map((entry: { token?: string; top_logprobs?: unknown }) => {
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
				const chunkText =
					typeof choice.text === "string"
						? choice.text
						: tokenLogprobs.map((entry) => entry.token).join("");
				yield {
					content: chunkText,
					tokenLogprobs,
				} satisfies StreamChunk;
			}
			continue;
		}
		const streamChunk = toStreamChunk({
			text: typeof choice.text === "string" ? choice.text : undefined,
			topLogprobs:
				choice.logprobs?.top_logprobs?.[0] ??
				choice.logprobs?.content?.[0]?.top_logprobs,
			segment: "content",
		});
		if (streamChunk) {
			yield streamChunk;
		}
	}
};

export type { OpenAIChatMessage, StreamChunk };
