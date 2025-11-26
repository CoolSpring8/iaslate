import { type LanguageModel, type ModelMessage, streamText } from "ai";
import type { StreamManager } from "../hooks/useStreamManager";
import type { ChatProviderReady, Message, MessageContent } from "../types";

export interface SendMessageContext {
	provider: ChatProviderReady;
	activeTargetId?: string;
	activeTail: () => string | undefined;
	createSystemMessage: (text: string) => string;
	createUserAfter: (parentId: string, content: MessageContent) => string;
	createAssistantAfter: (parentId: string) => string;
	setNodeStatus: (
		id: string,
		status: "draft" | "streaming" | "final" | "error",
	) => void;
	setActiveTarget: (id: string) => void;
	appendToNode: (
		nodeId: string,
		delta: { content?: string; reasoning?: string },
	) => void;
	compilePathTo: (nodeId: string) => Message[];
	streamManager: StreamManager;
	setIsGenerating: (value: boolean) => void;
	defaultSystemPrompt: string;
}

const hasMessageContent = (content: MessageContent) => {
	if (typeof content === "string") {
		return content.trim().length > 0;
	}
	return content.some((part) =>
		part.type === "image" ? part.image.length > 0 : part.text.trim().length > 0,
	);
};

export const sendMessage = async (
	promptContent: MessageContent,
	{
		provider,
		activeTargetId,
		activeTail,
		createSystemMessage,
		createUserAfter,
		createAssistantAfter,
		setNodeStatus,
		setActiveTarget,
		appendToNode,
		compilePathTo,
		streamManager,
		setIsGenerating,
		defaultSystemPrompt,
	}: SendMessageContext,
) => {
	const model: LanguageModel =
		provider.kind === "openai-compatible"
			? provider.openAIProvider.chatModel(provider.modelId)
			: provider.getBuiltInChatModel();
	const hasContent = hasMessageContent(promptContent);
	let resolvedParentId = activeTail() ?? activeTargetId;
	if (!resolvedParentId) {
		resolvedParentId = createSystemMessage(defaultSystemPrompt);
	}
	if (hasContent) {
		resolvedParentId = createUserAfter(resolvedParentId, promptContent);
	}
	const contextMessages = compilePathTo(resolvedParentId);
	const lastMessage = contextMessages[contextMessages.length - 1];
	const shouldAppendToAssistant =
		!hasContent && lastMessage?.role === "assistant";
	const assistantId = shouldAppendToAssistant
		? lastMessage._metadata.uuid
		: createAssistantAfter(resolvedParentId);
	setNodeStatus(assistantId, "streaming");
	setActiveTarget(assistantId);
	const abortController = new AbortController();
	streamManager.register(assistantId, abortController);
	const modelMessages = contextMessages
		.filter((message) => message.role !== "tool")
		.map((message) => ({
			role: message.role as "system" | "user" | "assistant",
			content: message.content,
		})) as ModelMessage[];
	try {
		const stream = streamText({
			model,
			messages: modelMessages,
			temperature: 0.3,
			abortSignal: abortController.signal,
		});
		setIsGenerating(true);
		for await (const part of stream.fullStream) {
			if (part.type === "text-delta" && part.text) {
				appendToNode(assistantId, {
					content: part.text,
				});
			}
			if (part.type === "reasoning-delta" && part.text) {
				appendToNode(assistantId, {
					reasoning: part.text,
				});
			}
		}
		setNodeStatus(assistantId, "final");
	} catch (error) {
		if (abortController.signal.aborted) {
			setNodeStatus(assistantId, "draft");
		} else {
			setNodeStatus(assistantId, "error");
			throw error;
		}
	} finally {
		setIsGenerating(false);
		streamManager.clearLatestIf(assistantId);
	}
};
