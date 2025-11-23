import { type LanguageModel, type ModelMessage, streamText } from "ai";
import { toast } from "sonner";
import type { StreamManager } from "../hooks/useStreamManager";
import type { Message, ProviderKind } from "../types";

export interface SendMessageContext {
	providerKind: ProviderKind;
	builtInAvailability:
		| "unknown"
		| "unavailable"
		| "downloadable"
		| "downloading"
		| "available";
	activeModel: string | null;
	openAIProvider: {
		chatModel: (id: string) => LanguageModel;
	} | null;
	getBuiltInChatModel: () => LanguageModel;
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
		providerKind,
		builtInAvailability,
		activeModel,
		openAIProvider,
		getBuiltInChatModel,
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
	const usingOpenAI = providerKind === "openai-compatible";
	if (usingOpenAI) {
		if (!activeModel) {
			toast.error("Select a model before sending");
			return;
		}
		if (!openAIProvider) {
			toast.error("Set an API base URL before sending");
			return;
		}
	} else if (builtInAvailability !== "available") {
		toast.error("Download the built-in model in Settings before chatting");
		return;
	}
	const builtInModel = usingOpenAI ? null : getBuiltInChatModel();
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
			model: usingOpenAI
				? openAIProvider!.chatModel(activeModel!)
				: builtInModel!,
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
