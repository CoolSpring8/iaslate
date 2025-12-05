import type {
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
import type { ModelInfo } from "../types";

export const DUMMY_PROVIDER_NAME = "dummy";

export const DUMMY_MODELS = [
	{
		id: "markdown-stress-tester",
		name: "Markdown Stress Tester",
		description: "Streams structured Markdown elements to test rendering.",
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TOKEN_CHUNK_SIZE = 6;

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

const hashInput = (input: string) => {
	let hash = 0;
	for (let index = 0; index < input.length; index += 1) {
		hash = (hash << 5) - hash + input.charCodeAt(index);
		hash |= 0;
	}
	return Math.abs(hash);
};

const chunkText = (text: string, chunkSize = TOKEN_CHUNK_SIZE) => {
	if (!text) {
		return [];
	}
	const chunks: string[] = [];
	let buffer = "";
	for (const char of text) {
		buffer += char;
		if (buffer.length >= chunkSize) {
			chunks.push(buffer);
			buffer = "";
		}
	}
	if (buffer) {
		chunks.push(buffer);
	}
	return chunks;
};

class DummyLanguageModel implements LanguageModelV2 {
	readonly specificationVersion = "v2";
	readonly provider = DUMMY_PROVIDER_NAME;
	readonly modelId: DummyModelId;
	readonly supportedUrls: Record<string, RegExp[]> = {};

	private readonly tokensPerSecond: number;
	private readonly idGenerator: () => string;

	constructor(
		modelId: DummyModelId,
		settings: DummyProviderSettings,
		idGenerator = generateId,
	) {
		this.modelId = modelId;
		this.tokensPerSecond = clampTokensPerSecond(settings.tokensPerSecond);
		this.idGenerator = idGenerator;
	}

	async doGenerate(options: LanguageModelV2CallOptions) {
		const { prompt } = options;
		const warnings = this.buildWarnings(options);
		const contentText = this.buildResponse(prompt);
		const usage = this.buildUsage(prompt, contentText);
		const content: LanguageModelV2Content[] = contentText
			? [{ type: "text", text: contentText }]
			: [];

		return {
			content,
			finishReason: "stop" as const,
			usage,
			warnings,
			request: { body: { modelId: this.modelId } },
			response: { body: { content: contentText } },
		};
	}

	async doStream(options: LanguageModelV2CallOptions) {
		const { prompt, abortSignal } = options;
		const warnings = this.buildWarnings(options);
		const contentText = this.buildResponse(prompt);
		const usage = this.buildUsage(prompt, contentText);
		const textId = this.idGenerator();
		const delay = 1000 / this.tokensPerSecond;
		const chunks = chunkText(contentText);

		const stream = new ReadableStream<LanguageModelV2StreamPart>({
			start: async (controller) => {
				if (abortSignal?.aborted) {
					controller.error(
						abortSignal.reason ?? new DOMException("Aborted", "AbortError"),
					);
					return;
				}

				const handleAbort = () => {
					controller.error(
						abortSignal?.reason ?? new DOMException("Aborted", "AbortError"),
					);
				};

				if (abortSignal) {
					abortSignal.addEventListener("abort", handleAbort);
				}

				controller.enqueue({ type: "stream-start", warnings });
				controller.enqueue({ type: "text-start", id: textId });

				for (const chunk of chunks) {
					if (abortSignal?.aborted) {
						if (abortSignal) {
							abortSignal.removeEventListener("abort", handleAbort);
						}
						controller.error(
							abortSignal?.reason ?? new DOMException("Aborted", "AbortError"),
						);
						return;
					}
					controller.enqueue({ type: "text-delta", id: textId, delta: chunk });
					if (delay > 0) {
						await sleep(delay);
					}
				}

				controller.enqueue({ type: "text-end", id: textId });
				controller.enqueue({
					type: "finish",
					finishReason: "stop" as const,
					usage,
				});

				if (abortSignal) {
					abortSignal.removeEventListener("abort", handleAbort);
				}
				controller.close();
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
	): LanguageModelV2Usage {
		const inputLength = chunkText(extractLatestUserText(prompt)).length;
		const outputLength = chunkText(content).length;
		return {
			inputTokens: inputLength,
			outputTokens: outputLength,
			totalTokens: inputLength + outputLength,
		};
	}

	private buildResponse(prompt: LanguageModelV2Prompt) {
		const latestUserText = extractLatestUserText(prompt);
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

			case "corporate-ipm": {
				const pick = (list: string[]) =>
					list[Math.floor(Math.random() * list.length)];
				const sentenceLength = 2 + Math.floor(Math.random() * 3);
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

			default:
				return "Dummy provider is ready.";
		}
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

	const createModel = (modelId: string) =>
		new DummyLanguageModel(validateModelId(modelId), {
			tokensPerSecond: settings.tokensPerSecond,
		});

	const provider = ((modelId: string) => createModel(modelId)) as DummyProvider;

	provider.languageModel = (modelId) => createModel(modelId);
	provider.chatModel = (modelId) => createModel(modelId);
	provider.completionModel = (modelId) => createModel(modelId);
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
