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
