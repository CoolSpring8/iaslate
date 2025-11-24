import { type LanguageModel, type ModelMessage, streamText } from "ai";
import type { StreamManager } from "../hooks/useStreamManager";
import type { ChatProviderReady, Message } from "../types";

export interface SendMessageContext {
	provider: ChatProviderReady;
	activeTargetId?: string;
	activeTail: () => string | undefined;
	createSystemMessage: (text: string) => string;
	createUserAfter: (parentId: string, text: string) => string;
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

export const sendMessage = async (
	promptText: string,
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
	const trimmedPrompt = promptText.trim();
	let resolvedParentId = activeTail() ?? activeTargetId;
	if (!resolvedParentId) {
		resolvedParentId = createSystemMessage(defaultSystemPrompt);
	}
	if (trimmedPrompt.length > 0) {
		resolvedParentId = createUserAfter(resolvedParentId, trimmedPrompt);
	}
	const assistantId = createAssistantAfter(resolvedParentId);
	setNodeStatus(assistantId, "streaming");
	setActiveTarget(assistantId);
	const abortController = new AbortController();
	streamManager.register(assistantId, abortController);
	const contextMessages: ModelMessage[] = compilePathTo(resolvedParentId)
		.filter((message) => message.role !== "tool")
		.map((message) => ({
			role: message.role as "system" | "user" | "assistant",
			content: message.content,
		}));
	try {
		const stream = streamText({
			model,
			messages: contextMessages,
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
