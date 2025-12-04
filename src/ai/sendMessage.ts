import { type ModelMessage, streamText } from "ai";
import type { StreamManager } from "../hooks/useStreamManager";
import type {
	ChatProviderReady,
	Message,
	MessageContent,
	TokenLogprob,
} from "../types";
import { OPENAI_COMPATIBLE_PROVIDER_NAME } from "./openaiCompatible";
import {
	buildChatLogprobOptions,
	parseChatLogprobsChunk,
	toModelMessages,
} from "./openaiLogprobs";

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
		delta: {
			content?: string;
			reasoning?: string;
			tokenLogprobs?: TokenLogprob[];
		},
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
		provider.kind === "built-in" &&
		!hasContent &&
		lastMessage?.role === "assistant";
	const assistantId = shouldAppendToAssistant
		? lastMessage._metadata.uuid
		: createAssistantAfter(resolvedParentId);
	const shouldPrefixAssistant =
		provider.kind === "built-in" && shouldAppendToAssistant;
	setNodeStatus(assistantId, "streaming");
	setActiveTarget(assistantId);
	const abortController = new AbortController();
	streamManager.register(assistantId, abortController);
	const filteredContext = contextMessages.filter(
		(message) => message.role !== "tool",
	);
	try {
		setIsGenerating(true);
		if (provider.kind === "built-in") {
			const modelMessages = filteredContext.map((message) => {
				const base = {
					role: message.role as "system" | "user" | "assistant",
					content: message.content,
				};
				if (shouldPrefixAssistant && message._metadata.uuid === assistantId) {
					return {
						...base,
						providerOptions: {
							"browser-ai": { prefix: true },
						},
					};
				}
				return base;
			}) as ModelMessage[];
			const stream = streamText({
				model: provider.getBuiltInChatModel(),
				messages: modelMessages,
				temperature: 0.3,
				abortSignal: abortController.signal,
			});
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
		} else {
			const modelMessages = toModelMessages(filteredContext);
			const stream = streamText({
				model: provider.openAIProvider.chatModel(provider.modelId),
				messages: modelMessages,
				temperature: 0.3,
				abortSignal: abortController.signal,
				includeRawChunks: true,
				providerOptions: buildChatLogprobOptions(
					OPENAI_COMPATIBLE_PROVIDER_NAME,
				),
			});
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
				if (part.type === "raw") {
					const chunk = parseChatLogprobsChunk(part.rawValue);
					if (chunk?.tokenLogprobs?.length) {
						appendToNode(assistantId, {
							tokenLogprobs: chunk.tokenLogprobs,
						});
					}
				}
				if (part.type === "error") {
					throw new Error(
						typeof part.error === "string"
							? part.error
							: part.error instanceof Error
								? part.error.message
								: "Failed to stream response",
					);
				}
			}
			setNodeStatus(assistantId, "final");
		}
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
