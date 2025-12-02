import type { LanguageModel } from "ai";

export type AppView = "chat" | "diagram" | "text";

export interface MessageMetadata {
	uuid: string;
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

export interface ModelInfo {
	id: string;
	name?: string | null;
	object?: string;
	owned_by?: string;
}

export type ProviderKind = "openai-compatible" | "built-in";

export interface ProviderEntry {
	id: string;
	name: string;
	kind: ProviderKind;
	config: {
		baseURL?: string;
		apiKey?: string;
	};
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
	  }
	| {
			kind: "built-in";
			getBuiltInChatModel: () => LanguageModel;
	  };

export type CompletionProviderReady = Extract<
	ChatProviderReady,
	{ kind: "openai-compatible" }
>;
