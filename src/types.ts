import type { LanguageModel } from "ai";

export type AppView = "chat" | "diagram" | "text";

export interface MessageMetadata {
	uuid: string;
	tokenLogprobs?: TokenLogprob[];
}

export type MessageContentPart =
	| { type: "text"; text: string }
	| { type: "image"; image: string; mimeType?: string };

export type MessageContent = string | MessageContentPart[];

export interface Message {
	role: "system" | "user" | "assistant" | "tool";
	content: MessageContent;
	reasoning_content?: string;
	_metadata: MessageMetadata;
}

export interface TokenLogprob {
	token: string;
	probability?: number;
	segment?: "content" | "reasoning";
	alternatives: TokenAlternative[];
}

export interface TokenAlternative {
	token: string;
	probability: number;
}

export interface ModelInfo {
	id: string;
	name?: string | null;
	object?: string;
	owned_by?: string;
}

export type ProviderKind = "openai-compatible" | "built-in" | "dummy";

export interface ProviderEntry {
	id: string;
	name: string;
	kind: ProviderKind;
	config: {
		baseURL?: string;
		apiKey?: string;
		tokensPerSecond?: number;
	};
	models?: ModelInfo[];
	activeModelId?: string | null;
}

export type BuiltInAvailability =
	| "unknown"
	| "unavailable"
	| "downloadable"
	| "downloading"
	| "available";

export interface OpenAIProviderAdapter {
	chatModel: (id: string) => LanguageModel;
	completionModel: (id: string) => LanguageModel;
}

export type ChatProviderReady =
	| {
			kind: "openai-compatible";
			modelId: string;
			openAIProvider: OpenAIProviderAdapter;
			baseURL: string;
			apiKey: string;
	  }
	| {
			kind: "built-in";
			getBuiltInChatModel: () => LanguageModel;
	  }
	| {
			kind: "dummy";
			modelId: string;
			tokensPerSecond: number;
	  };

export type CompletionProviderReady = Extract<
	ChatProviderReady,
	{ kind: "openai-compatible" } | { kind: "dummy" }
>;
