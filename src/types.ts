import type { LanguageModel } from "ai";

export type AppView = "chat" | "diagram" | "text";

export interface MessageMetadata {
	uuid: string;
}

export interface Message {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
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
