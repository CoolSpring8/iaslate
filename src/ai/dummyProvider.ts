import type {
	JSONValue,
	LanguageModelV2,
	LanguageModelV2CallOptions,
	LanguageModelV2CallWarning,
	LanguageModelV2Content,
	LanguageModelV2Prompt,
	LanguageModelV2StreamPart,
	LanguageModelV2Usage,
	ProviderV2,
} from "@ai-sdk/provider";
import { NoSuchModelError } from "@ai-sdk/provider";
import { generateId } from "@ai-sdk/provider-utils";
import type { ModelInfo, TokenLogprob } from "../types";

export const DUMMY_PROVIDER_NAME = "dummy";

/**
 * Models that should generate varied fake logprobs with alternatives.
 * Other models will use probability=1.0 with no alternatives.
 */
const MODELS_WITH_VARIED_LOGPROBS: ReadonlySet<string> = new Set([
	"random-prose",
]);

/**
 * Pool of fake alternative tokens for generating varied logprobs.
 * These are common short tokens/words that could plausibly appear as alternatives.
 */
const FAKE_ALTERNATIVES_POOL = [
	"the",
	"a",
	"is",
	"to",
	"and",
	"of",
	"in",
	"it",
	"for",
	"on",
	"that",
	"with",
	"as",
	"be",
	"at",
	"this",
	"or",
	"an",
	"we",
	"I",
	"you",
	"can",
	"will",
	"all",
	"...",
	",",
	".",
	"!",
	"?",
] as const;

const DUMMY_MODELS = [
	{
		id: "markdown-stress-tester",
		name: "Markdown Stress Tester",
		description: "Streams structured Markdown elements to test rendering.",
	},
	{
		id: "reasoning-stream",
		name: "Reasoning Stream",
		description: "Streams reasoning_content before the final answer.",
	},
	{
		id: "corporate-ipm",
		name: "Corporate IPM",
		description: "Generates corporate buzzword text.",
	},
	{
		id: "eliza-lite",
		name: "Eliza-Lite",
		description: "Simple pattern-matching chatbot.",
	},
	{
		id: "unhelpful-cat",
		name: "Unhelpful Cat",
		description: "Streams repetitive or random characters.",
	},
	{
		id: "magic-8-ball",
		name: "Magic 8-Ball",
		description: "Deterministic answers based on input hash.",
	},
	{
		id: "random-prose",
		name: "Random Prose",
		description:
			"Generates random word sequences with varied probabilities. Best for testing token rerolls.",
	},
] as const;

type DummyModelId = (typeof DUMMY_MODELS)[number]["id"];

export interface DummyProviderSettings {
	tokensPerSecond?: number;
}

type DummyProvider = ProviderV2 & {
	(modelId: string): DummyLanguageModel;
	languageModel: (modelId: string) => DummyLanguageModel;
	chatModel: (modelId: string) => DummyLanguageModel;
	completionModel: (modelId: string) => DummyLanguageModel;
	textEmbeddingModel: ProviderV2["textEmbeddingModel"];
	imageModel: ProviderV2["imageModel"];
};

const DEFAULT_TOKENS_PER_SECOND = 10;

const CORPORATE_VERBS = [
	"leverage",
	"synergize",
	"drill down",
	"pivot",
	"reimagine",
];
const CORPORATE_ADJECTIVES = [
	"holistic",
	"mission-critical",
	"seamless",
	"granular",
	"scalable",
];
const CORPORATE_NOUNS = [
	"synergies",
	"paradigms",
	"deliverables",
	"bandwidth",
	"value streams",
];

const KEYBOARD_MASH = [
	"asdf jkl; uio pa",
	"qwer tyui op",
	"zxcv bnm",
	"mrow prrr",
];

const MAGIC_8_BALL_ANSWERS = [
	"It is certain.",
	"It is decidedly so.",
	"Without a doubt.",
	"Yes definitely.",
	"You may rely on it.",
	"As I see it, yes.",
	"Most likely.",
	"Outlook good.",
	"Yes.",
	"Signs point to yes.",
	"Reply hazy, try again.",
	"Ask again later.",
	"Better not tell you now.",
	"Cannot predict now.",
	"Concentrate and ask again.",
	"Don't count on it.",
	"My reply is no.",
	"My sources say no.",
	"Outlook not so good.",
	"Very doubtful.",
] as const;

const RANDOM_PROSE_WORDS = [
	"the",
	"quick",
	"brown",
	"fox",
	"jumps",
	"over",
	"lazy",
	"dog",
	"and",
	"then",
	"runs",
	"through",
	"forest",
	"while",
	"birds",
	"sing",
	"softly",
	"in",
	"morning",
	"light",
	"as",
	"clouds",
	"drift",
	"across",
	"sky",
	"bringing",
	"gentle",
	"breeze",
	"that",
	"rustles",
	"leaves",
	"creating",
	"peaceful",
	"melody",
] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hashInput = (input: string) => {
	let hash = 0;
	for (let index = 0; index < input.length; index += 1) {
		hash = (hash << 5) - hash + input.charCodeAt(index);
		hash |= 0;
	}
	return Math.abs(hash);
};

const mix32 = (value: number) => {
	let x = value | 0;
	x ^= x >>> 16;
	x = Math.imul(x, 0x7feb352d);
	x ^= x >>> 15;
	x = Math.imul(x, 0x846ca68b);
	x ^= x >>> 16;
	return x >>> 0;
};

const createSeededRng = (seed: number) => {
	let state = seed || 1;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0x100000000;
	};
};

const pickFrom = <T>(items: readonly T[], rng: () => number) =>
	items[Math.floor(rng() * items.length)]!;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

/**
 * Generate fake logprobs for a text chunk.
 * Models in MODELS_WITH_VARIED_LOGPROBS get random probabilities and alternatives.
 * Other models get probability=1.0 with no alternatives.
 */
const generateFakeLogprobs = (
	token: string,
	modelId: string,
	options?: { seed?: string; tokenIndex?: number },
): TokenLogprob => {
	const useVaried = MODELS_WITH_VARIED_LOGPROBS.has(modelId);

	if (!useVaried) {
		// Deterministic models: probability 1.0, no alternatives
		return {
			token,
			probability: 1.0,
			segment: "content",
			alternatives: [{ token, probability: 1.0 }],
		};
	}

	const rng =
		typeof options?.seed === "string" && typeof options.tokenIndex === "number"
			? createSeededRng(
					mix32(hashInput(`${modelId}:${options.seed}`) ^ options.tokenIndex),
				)
			: Math.random;

	// Varied models: generate a more realistic distribution with occasional spikes.
	// Most tokens are high-confidence, but some are uncertain.
	const roll = rng();
	const baseProbability =
		roll < 0.15
			? 0.02 + rng() * 0.28 // 2-30%
			: roll < 0.4
				? 0.3 + rng() * 0.4 // 30-70%
				: 0.7 + rng() * 0.29; // 70-99%
	const alternativeCount = 2 + Math.floor(rng() * 3); // 2-4 alternatives

	// Extract trailing whitespace/punctuation from token to apply to alternatives
	const trailingMatch = token.match(/(\s+)$/);
	const trailingWhitespace = trailingMatch ? trailingMatch[1] : "";
	const tokenCore = token.replace(/\s+$/, "");

	// Pick deterministic alternatives from the pool, excluding the current token.
	const pool = FAKE_ALTERNATIVES_POOL.filter((alt) => alt !== tokenCore);
	const pickedAlternatives: string[] = [];
	for (let index = 0; index < alternativeCount && pool.length > 0; index += 1) {
		const pickIndex = Math.floor(rng() * pool.length);
		const picked = pool.splice(pickIndex, 1)[0];
		if (!picked) {
			continue;
		}
		pickedAlternatives.push(`${picked}${trailingWhitespace}`);
	}

	// Distribute remaining probability among alternatives.
	const remainingProb = Math.max(0, 1 - baseProbability);
	const alternatives = [{ token, probability: baseProbability }];
	if (pickedAlternatives.length > 0 && remainingProb > 0) {
		const weights = pickedAlternatives.map(() => 0.05 + rng() ** 2);
		const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
		for (let index = 0; index < pickedAlternatives.length; index += 1) {
			const weight = weights[index];
			const altProb =
				weightSum > 0
					? remainingProb * (weight / weightSum)
					: remainingProb / pickedAlternatives.length;
			alternatives.push({
				token: pickedAlternatives[index]!,
				probability: altProb,
			});
		}
	} else if (pickedAlternatives.length === 0) {
		alternatives[0] = { token, probability: 1.0 };
	}

	const totalProbability = alternatives.reduce(
		(sum, entry) => sum + entry.probability,
		0,
	);
	const normalizedAlternatives =
		totalProbability > 0
			? alternatives.map((entry) => ({
					...entry,
					probability: entry.probability / totalProbability,
				}))
			: [{ token, probability: 1.0 }];

	const tokenProbability = normalizedAlternatives.find(
		(entry) => entry.token === token,
	)?.probability;

	// Sort by probability descending
	normalizedAlternatives.sort((a, b) => b.probability - a.probability);

	return {
		token,
		probability: tokenProbability,
		segment: "content",
		alternatives: normalizedAlternatives,
	};
};

type DummyProviderOptions = {
	logprobSeed?: string;
	tokenIndexOffset?: number;
};

const readDummyProviderOptions = (options: unknown): DummyProviderOptions => {
	if (!isRecord(options)) {
		return {};
	}
	const entry = options[DUMMY_PROVIDER_NAME];
	if (!isRecord(entry)) {
		return {};
	}
	const logprobSeed =
		typeof entry["logprobSeed"] === "string" ? entry["logprobSeed"] : undefined;
	const tokenIndexOffset =
		typeof entry["tokenIndexOffset"] === "number"
			? entry["tokenIndexOffset"]
			: undefined;
	return { logprobSeed, tokenIndexOffset };
};

type DummyTokenLogprobJson = {
	token: string;
	probability?: number;
	segment?: "content" | "reasoning";
	alternatives: Array<{ token: string; probability: number }>;
};

const toDummyTokenLogprobJson = (
	tokenLogprob: TokenLogprob,
): DummyTokenLogprobJson => ({
	token: tokenLogprob.token,
	...(typeof tokenLogprob.probability === "number"
		? { probability: tokenLogprob.probability }
		: {}),
	...(tokenLogprob.segment ? { segment: tokenLogprob.segment } : {}),
	alternatives: tokenLogprob.alternatives.map((alternative) => ({
		token: alternative.token,
		probability: alternative.probability,
	})),
});

const toDummyProviderMetadata = (tokenLogprobs: TokenLogprob[]) => ({
	[DUMMY_PROVIDER_NAME]: {
		tokenLogprobs: tokenLogprobs.map(toDummyTokenLogprobJson) as JSONValue,
	},
});

const clampTokensPerSecond = (value?: number) => {
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return DEFAULT_TOKENS_PER_SECOND;
	}
	return Math.max(1, Math.floor(numeric));
};

const extractLatestUserText = (prompt: LanguageModelV2Prompt) => {
	for (let index = prompt.length - 1; index >= 0; index -= 1) {
		const message = prompt[index];
		if (message.role === "user") {
			return message.content
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join(" ")
				.trim();
		}
	}
	return "";
};

const extractTrailingAssistantText = (prompt: LanguageModelV2Prompt) => {
	const last = prompt.at(-1);
	if (!last || last.role !== "assistant") {
		return null;
	}
	return last.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
};

const extractSingleUserPromptText = (prompt: LanguageModelV2Prompt) => {
	if (prompt.length !== 1) {
		return null;
	}
	const [message] = prompt;
	if (!message || message.role !== "user") {
		return null;
	}
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
};

/**
 * Split text into word-based chunks for more natural tokenization.
 * Each word (with trailing whitespace) becomes a token.
 * Punctuation attached to words stays with them.
 */
const chunkText = (text: string) => {
	if (!text) {
		return [];
	}
	// Match words with optional trailing whitespace, or standalone whitespace/punctuation
	const chunks: string[] = [];
	const regex = /(\S+\s*|\s+)/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		chunks.push(match[0]);
	}
	return chunks;
};

class DummyLanguageModel implements LanguageModelV2 {
	readonly specificationVersion = "v2";
	readonly provider = DUMMY_PROVIDER_NAME;
	readonly modelId: DummyModelId;
	readonly supportedUrls: Record<string, RegExp[]> = {};
	private readonly callMode: "chat" | "completion";

	private readonly tokensPerSecond: number;
	private readonly idGenerator: () => string;

	constructor(
		modelId: DummyModelId,
		callMode: "chat" | "completion",
		settings: DummyProviderSettings,
		idGenerator = generateId,
	) {
		this.modelId = modelId;
		this.callMode = callMode;
		this.tokensPerSecond = clampTokensPerSecond(settings.tokensPerSecond);
		this.idGenerator = idGenerator;
	}

	async doGenerate(options: LanguageModelV2CallOptions) {
		const { prompt } = options;
		const warnings = this.buildWarnings(options);
		const { contentText, reasoningText } = this.buildResponseParts(prompt);
		const usage = this.buildUsage(prompt, contentText, reasoningText);
		const content: LanguageModelV2Content[] = [];
		if (reasoningText) {
			content.push({ type: "reasoning", text: reasoningText });
		}
		if (contentText) {
			content.push({ type: "text", text: contentText });
		}

		return {
			content,
			finishReason: "stop" as const,
			usage,
			warnings,
			request: { body: { modelId: this.modelId } },
			response: { body: { content: contentText, reasoning: reasoningText } },
		};
	}

	async doStream(options: LanguageModelV2CallOptions) {
		const { prompt, abortSignal } = options;
		const warnings = this.buildWarnings(options);
		const { contentText, reasoningText } = this.buildResponseParts(prompt);
		const usage = this.buildUsage(prompt, contentText, reasoningText);
		const { logprobSeed, tokenIndexOffset } = readDummyProviderOptions(
			options.providerOptions,
		);
		const resolvedLogprobSeed =
			logprobSeed ??
			(this.callMode === "completion"
				? extractSingleUserPromptText(prompt) ?? extractLatestUserText(prompt)
				: extractLatestUserText(prompt));
		let tokenIndex =
			typeof tokenIndexOffset === "number" && Number.isFinite(tokenIndexOffset)
				? Math.max(0, Math.floor(tokenIndexOffset))
				: this.callMode === "completion"
					? 0
					: chunkText(extractTrailingAssistantText(prompt) ?? "").length;
		const textId = this.idGenerator();
		const reasoningId = reasoningText ? this.idGenerator() : null;
		const delay = 1000 / this.tokensPerSecond;
		const reasoningChunks = reasoningText ? chunkText(reasoningText) : [];
		const textChunks = chunkText(contentText);

		const stream = new ReadableStream<LanguageModelV2StreamPart>({
			start: async (controller) => {
				const abortError = () =>
					abortSignal?.reason ?? new DOMException("Aborted", "AbortError");

				let abortListener: (() => void) | undefined;
				const abortPromise = abortSignal
					? new Promise<never>((_, reject) => {
							abortListener = () => reject(abortError());
							if (abortSignal.aborted) {
								reject(abortError());
								return;
							}
							abortSignal.addEventListener("abort", abortListener, {
								once: true,
							});
						})
					: null;
				// Prevent unhandled rejections if the stream completes before we ever await `abortPromise`.
				void abortPromise?.catch(() => {});

				try {
					if (abortSignal?.aborted) {
						controller.error(abortError());
						return;
					}

					controller.enqueue({ type: "stream-start", warnings });

					const sleepOrAbort = async () => {
						if (delay <= 0) {
							return;
						}
						if (abortPromise) {
							await Promise.race([sleep(delay), abortPromise]);
							return;
						}
						await sleep(delay);
					};

					if (reasoningId) {
						controller.enqueue({ type: "reasoning-start", id: reasoningId });
						for (const chunk of reasoningChunks) {
							if (abortSignal?.aborted) {
								throw abortError();
							}
							const tokenLogprob: TokenLogprob = {
								...generateFakeLogprobs(chunk, this.modelId, {
									seed: resolvedLogprobSeed,
									tokenIndex,
								}),
								segment: "reasoning",
							};
							tokenIndex += 1;
							controller.enqueue({
								type: "reasoning-delta",
								id: reasoningId,
								delta: chunk,
								providerMetadata: toDummyProviderMetadata([tokenLogprob]),
							});
							await sleepOrAbort();
						}
						controller.enqueue({ type: "reasoning-end", id: reasoningId });
					}

					controller.enqueue({ type: "text-start", id: textId });
					for (const chunk of textChunks) {
						if (abortSignal?.aborted) {
							throw abortError();
						}
						const tokenLogprob = generateFakeLogprobs(chunk, this.modelId, {
							seed: resolvedLogprobSeed,
							tokenIndex,
						});
						tokenIndex += 1;
						controller.enqueue({
							type: "text-delta",
							id: textId,
							delta: chunk,
							providerMetadata: toDummyProviderMetadata([tokenLogprob]),
						});
						await sleepOrAbort();
					}

					if (abortSignal?.aborted) {
						throw abortError();
					}

					controller.enqueue({ type: "text-end", id: textId });
					controller.enqueue({
						type: "finish",
						finishReason: "stop" as const,
						usage,
					});
					controller.close();
				} catch (error) {
					controller.error(error);
				} finally {
					if (abortSignal && abortListener) {
						abortSignal.removeEventListener("abort", abortListener);
					}
				}
			},
		});

		return { stream };
	}

	private buildWarnings(options: LanguageModelV2CallOptions) {
		const warnings: LanguageModelV2CallWarning[] = [];

		if (options.tools?.length) {
			for (const tool of options.tools) {
				warnings.push({
					type: "unsupported-tool",
					tool,
					details: "Dummy provider does not execute tools.",
				});
			}
		}

		if (options.responseFormat && options.responseFormat.type === "json") {
			warnings.push({
				type: "unsupported-setting",
				setting: "responseFormat",
				details: "Dummy provider emits text only.",
			});
		}

		if (options.stopSequences?.length) {
			warnings.push({
				type: "unsupported-setting",
				setting: "stopSequences",
				details: "Stop sequences are ignored by the dummy provider.",
			});
		}

		return warnings;
	}

	private buildUsage(
		prompt: LanguageModelV2Prompt,
		content: string,
		reasoning?: string,
	): LanguageModelV2Usage {
		const inputLength = chunkText(extractLatestUserText(prompt)).length;
		const outputLength =
			chunkText(content).length + (reasoning ? chunkText(reasoning).length : 0);
		return {
			inputTokens: inputLength,
			outputTokens: outputLength,
			totalTokens: inputLength + outputLength,
		};
	}

	private buildScratchResponse(latestUserText: string) {
		switch (this.modelId) {
			case "markdown-stress-tester":
				return [
					"# Hello\n\n",
					"This is a **bold** and *italic* sentence to stress-test your renderer.\n\n",
					"```javascript\nconsole.log('Hello world');\n```\n\n",
					"| Feature | Status |\n| --- | --- |\n| Code blocks | Ready |\n| Tables | Ready |\n\n",
					"- Item one\n- Item two\n- Item three\n\n",
					"1. First\n2. Second\n3. Third\n",
				].join("");

			case "reasoning-stream":
				return [
					"Here’s the final answer (with reasoning streamed above).",
					latestUserText ? `You said: “${latestUserText}”.` : "",
					"Dummy providers are great for testing UI behaviors like streaming, cancel, and token overlays without relying on a real model.",
				]
					.filter(Boolean)
					.join("\n\n");

			case "corporate-ipm": {
				const rng = createSeededRng(
					hashInput(`${this.modelId}:${latestUserText}`),
				);
				const pick = (list: string[]) => pickFrom(list, rng);
				const sentenceLength = 2 + Math.floor(rng() * 3);
				const sentences: string[] = [];
				for (let index = 0; index < sentenceLength; index += 1) {
					sentences.push(
						`We need to ${pick(CORPORATE_VERBS)} the ${pick(CORPORATE_ADJECTIVES)} ${pick(CORPORATE_NOUNS)} to ${pick(CORPORATE_VERBS)} into the ${pick(CORPORATE_ADJECTIVES)} ${pick(CORPORATE_NOUNS)}.`,
					);
				}
				return sentences.join(" ");
			}

			case "eliza-lite": {
				const matchIdentity =
					latestUserText.match(/\bI\s+am\s+([^.,!?]*)/i) ||
					latestUserText.match(/\bI'm\s+([^.,!?]*)/i);
				if (matchIdentity?.[1]) {
					return `Why are you ${matchIdentity[1].trim()}?`;
				}
				return "That is interesting. Please go on.";
			}

			case "unhelpful-cat": {
				const wordCount = Math.max(
					1,
					latestUserText.split(/\s+/).filter(Boolean).length,
				);
				const meows = "Meow ".repeat(Math.min(wordCount * 2, 32)).trimEnd();
				const mash = KEYBOARD_MASH[wordCount % KEYBOARD_MASH.length];
				return `${meows}\n${mash}`;
			}

			case "magic-8-ball": {
				const question =
					latestUserText || "Ask a question to reveal the future.";
				const index = hashInput(question) % MAGIC_8_BALL_ANSWERS.length;
				return MAGIC_8_BALL_ANSWERS[index];
			}

			case "random-prose": {
				// Generate random word sequences - coherent with any reroll point
				const rng = createSeededRng(
					hashInput(`${this.modelId}:${latestUserText}`),
				);
				const wordCount = 15 + Math.floor(rng() * 20);
				const words: string[] = [];
				for (let i = 0; i < wordCount; i++) {
					words.push(pickFrom(RANDOM_PROSE_WORDS, rng));
				}
				// Add some punctuation
				let result = words.join(" ");
				result = result.charAt(0).toUpperCase() + result.slice(1) + ".";
				return result;
			}

			default:
				return "Dummy provider is ready.";
		}
	}

	private buildContinuationFromPrefix(latestUserText: string, prefix: string) {
		const rng = createSeededRng(
			hashInput(`${this.modelId}:${latestUserText}:${prefix}`),
		);

		const needsSpace =
			prefix.length > 0 && !/[\s\n]$/.test(prefix) && !/[({[\-]$/.test(prefix);
		const leading = needsSpace ? " " : "";

		switch (this.modelId) {
			case "markdown-stress-tester":
				return (
					"\n\n## More Markdown\n\n" +
					"- A fresh bullet\n- Another bullet\n\n" +
					"```txt\ncontinued...\n```\n"
				);

			case "corporate-ipm": {
				const pick = (list: string[]) => pickFrom(list, rng);
				const sentenceLength = 1 + Math.floor(rng() * 3);
				const sentences: string[] = [];
				for (let index = 0; index < sentenceLength; index += 1) {
					sentences.push(
						`We should ${pick(CORPORATE_VERBS)} ${pick(CORPORATE_ADJECTIVES)} ${pick(CORPORATE_NOUNS)} across ${pick(CORPORATE_ADJECTIVES)} ${pick(CORPORATE_NOUNS)}.`,
					);
				}
				return leading + sentences.join(" ");
			}

			case "eliza-lite": {
				if (!latestUserText) {
					return `${leading}Tell me more.`;
				}
				return `${leading}How does that make you feel?`;
			}

			case "unhelpful-cat": {
				const mash = KEYBOARD_MASH[hashInput(prefix) % KEYBOARD_MASH.length];
				return `${leading}Meow.\n${mash}`;
			}

			case "magic-8-ball":
				return `${leading}Ask again later.`;

			case "random-prose": {
				const wordCount = 10 + Math.floor(rng() * 20);
				const words: string[] = [];
				for (let i = 0; i < wordCount; i++) {
					words.push(pickFrom(RANDOM_PROSE_WORDS, rng));
				}
				let result = words.join(" ");
				if (result.length > 0) {
					result = result.charAt(0).toLowerCase() + result.slice(1);
				}
				return `${leading}${result}.`;
			}

			default:
				return `${leading}...`;
		}
	}

	private buildResponse(prompt: LanguageModelV2Prompt) {
		const assistantPrefix = extractTrailingAssistantText(prompt);
		const latestUserText = extractLatestUserText(prompt);

		if (assistantPrefix === null) {
			if (this.callMode === "completion") {
				const completionPrefix = extractSingleUserPromptText(prompt);
				if (completionPrefix !== null) {
					return this.buildContinuationFromPrefix(
						completionPrefix,
						completionPrefix,
					);
				}
			}
			return this.buildScratchResponse(latestUserText);
		}

		const scratch = this.buildScratchResponse(latestUserText);
		if (!assistantPrefix) {
			return scratch;
		}

		if (scratch.startsWith(assistantPrefix)) {
			return scratch.slice(assistantPrefix.length);
		}

		return this.buildContinuationFromPrefix(latestUserText, assistantPrefix);
	}

	private buildReasoningStreamResponse(prompt: LanguageModelV2Prompt) {
		const assistantPrefix = extractTrailingAssistantText(prompt);
		if (this.callMode === "completion" || assistantPrefix) {
			return { reasoningText: "", contentText: this.buildResponse(prompt) };
		}

		const latestUserText = extractLatestUserText(prompt);
		const reasoningText = [
			"Goal: produce a helpful final answer.",
			`Input: ${latestUserText || "(no user text)"}`,
			"Approach:",
			"- Identify intent",
			"- Gather constraints",
			"- Produce a concise answer",
		].join("\n");

		return { reasoningText, contentText: this.buildResponse(prompt) };
	}

	private buildResponseParts(prompt: LanguageModelV2Prompt) {
		if (this.modelId === "reasoning-stream") {
			return this.buildReasoningStreamResponse(prompt);
		}
		return { reasoningText: "", contentText: this.buildResponse(prompt) };
	}
}

export const createDummyProvider = (
	settings: DummyProviderSettings = {},
): DummyProvider => {
	const validateModelId = (modelId: string): DummyModelId => {
		if (DUMMY_MODELS.some((model) => model.id === modelId)) {
			return modelId as DummyModelId;
		}
		throw new NoSuchModelError({
			modelId,
			modelType: "languageModel",
			errorName: "DummyNoSuchModelError",
		});
	};

	const createModel = (modelId: string, callMode: "chat" | "completion") =>
		new DummyLanguageModel(validateModelId(modelId), callMode, {
			tokensPerSecond: settings.tokensPerSecond,
		});

	const provider = ((modelId: string) =>
		createModel(modelId, "chat")) as DummyProvider;

	provider.languageModel = (modelId) => createModel(modelId, "chat");
	provider.chatModel = (modelId) => createModel(modelId, "chat");
	provider.completionModel = (modelId) => createModel(modelId, "completion");
	provider.textEmbeddingModel = (modelId) => {
		throw new NoSuchModelError({
			modelId,
			modelType: "textEmbeddingModel",
			errorName: "DummyNoSuchModelError",
		});
	};
	provider.imageModel = (modelId) => {
		throw new NoSuchModelError({
			modelId,
			modelType: "imageModel",
			errorName: "DummyNoSuchModelError",
		});
	};

	return provider;
};

export const fetchDummyModels = async (): Promise<ModelInfo[]> =>
	DUMMY_MODELS.map((model) => ({
		id: model.id,
		name: model.name,
		owned_by: DUMMY_PROVIDER_NAME,
		object: "model",
	}));
