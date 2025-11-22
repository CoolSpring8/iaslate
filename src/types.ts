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
