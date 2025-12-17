import { streamText } from "ai";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { OPENAI_COMPATIBLE_PROVIDER_NAME } from "../ai/openaiCompatible";
import {
	buildChatLogprobOptions,
	parseChatLogprobsChunk,
	toModelMessages,
} from "../ai/openaiLogprobs";
import { sendMessage } from "../ai/sendMessage";
import { processFullStream } from "../ai/streamUtils";
import { useConversationTree } from "../tree/useConversationTree";
import type {
	ChatProviderReady,
	Message,
	MessageContent,
	TokenAlternative,
	TokenLogprob,
} from "../types";
import { deleteMessage } from "../utils/chatActions";
import { useStreamManager } from "./useStreamManager";

interface UseConversationControllerOptions {
	defaultSystemPrompt: string;
	ensureChatReady: () => ChatProviderReady | null;
}

export const useConversationController = ({
	defaultSystemPrompt,
	ensureChatReady,
}: UseConversationControllerOptions) => {
	const streamManager = useStreamManager();
	const [isGenerating, setIsGenerating] = useState(false);
	const [editingMessageId, setEditingMessageId] = useState<string | undefined>(
		undefined,
	);
	const [composerResetSignal, setComposerResetSignal] = useState(0);
	const [isPromptDirty, setIsPromptDirty] = useState(false);
	const {
		activeTargetId,
		setActiveTarget,
		createSystemMessage,
		isEmpty: isTreeEmpty,
		createUserAfter,
		createAssistantAfter,
		appendToNode,
		setNodeStatus,
		cloneNode,
		replaceNodeWithEditedClone,
		predecessorOf,
		compilePathTo,
		activeTail,
		removeNode: removeNodeFromTree,
		reset: resetTree,
		exportSnapshot,
		importSnapshot,
	} = useConversationTree(
		useShallow((state) => ({
			activeTargetId: state.activeTargetId,
			setActiveTarget: state.setActiveTarget,
			createSystemMessage: state.createSystemMessage,
			isEmpty: state.isEmpty,
			createUserAfter: state.createUserAfter,
			createAssistantAfter: state.createAssistantAfter,
			appendToNode: state.appendToNode,
			setNodeStatus: state.setNodeStatus,
			cloneNode: state.cloneNode,
			replaceNodeWithEditedClone: state.replaceNodeWithEditedClone,
			predecessorOf: state.predecessorOf,
			compilePathTo: state.compilePathTo,
			activeTail: state.activeTail,
			removeNode: state.removeNode,
			reset: state.reset,
			exportSnapshot: state.exportSnapshot,
			importSnapshot: state.importSnapshot,
		})),
	);

	const areContentsEqual = useCallback(
		(aContent: MessageContent, bContent: MessageContent) => {
			if (aContent === bContent) {
				return true;
			}
			if (typeof aContent === "string" || typeof bContent === "string") {
				return aContent === bContent;
			}
			if (aContent.length !== bContent.length) {
				return false;
			}
			for (let index = 0; index < aContent.length; index++) {
				const partA = aContent[index]!;
				const partB = bContent[index]!;
				if (partA.type !== partB.type) {
					return false;
				}
				if (partA.type === "text" && partB.type === "text") {
					if (partA.text !== partB.text) {
						return false;
					}
					continue;
				}
				if (partA.type === "image" && partB.type === "image") {
					if (
						partA.image !== partB.image ||
						partA.mimeType !== partB.mimeType
					) {
						return false;
					}
					continue;
				}
			}
			return true;
		},
		[],
	);

	const areTokenLogprobsEqual = useCallback(
		(a?: TokenLogprob[], b?: TokenLogprob[]) => {
			if (a === b) {
				return true;
			}
			if (!a || !b) {
				return !a && !b;
			}
			if (a.length !== b.length) {
				return false;
			}
			for (let index = 0; index < a.length; index++) {
				const tokA = a[index];
				const tokB = b[index];
				if (!tokA || !tokB) {
					return false;
				}
				if (
					tokA.token !== tokB.token ||
					tokA.probability !== tokB.probability ||
					tokA.segment !== tokB.segment
				) {
					return false;
				}
				if (tokA.alternatives.length !== tokB.alternatives.length) {
					return false;
				}
				for (let j = 0; j < tokA.alternatives.length; j++) {
					const altA = tokA.alternatives[j];
					const altB = tokB.alternatives[j];
					if (!altA || !altB) {
						return false;
					}
					if (
						altA.token !== altB.token ||
						altA.probability !== altB.probability
					) {
						return false;
					}
				}
			}
			return true;
		},
		[],
	);

	const areMessagesEqual = useCallback(
		(next: Message[], prev: Message[]) => {
			if (next === prev) {
				return true;
			}
			if (next.length !== prev.length) {
				return false;
			}
			for (let index = 0; index < next.length; index++) {
				const a = next[index]!;
				const b = prev[index]!;
				if (
					a._metadata.uuid !== b._metadata.uuid ||
					a.role !== b.role ||
					!areContentsEqual(a.content, b.content) ||
					a.reasoning_content !== b.reasoning_content ||
					!areTokenLogprobsEqual(
						a._metadata.tokenLogprobs,
						b._metadata.tokenLogprobs,
					)
				) {
					return false;
				}
			}
			return true;
		},
		[areContentsEqual, areTokenLogprobsEqual],
	);

	const chatMessages = useConversationTree(
		useCallback((state) => state.compileActive(), []),
		areMessagesEqual,
	);

	const abortActiveStreams = useCallback(() => {
		streamManager.abortAll();
		setIsGenerating(false);
	}, [streamManager]);

	const resetComposerState = useCallback(() => {
		if (editingMessageId) {
			setNodeStatus(editingMessageId, "final");
		}
		setEditingMessageId(undefined);
		setComposerResetSignal((value) => value + 1);
		setIsPromptDirty(false);
	}, [editingMessageId, setNodeStatus]);

	const clearConversation = useCallback(() => {
		abortActiveStreams();
		resetComposerState();
		resetTree();
		const systemId = createSystemMessage(defaultSystemPrompt);
		setActiveTarget(systemId);
	}, [
		abortActiveStreams,
		createSystemMessage,
		defaultSystemPrompt,
		resetComposerState,
		resetTree,
		setActiveTarget,
	]);

	const handleSend = useCallback(
		async (promptContent: MessageContent) => {
			const chatProvider = ensureChatReady();
			if (!chatProvider) {
				return;
			}
			try {
				await sendMessage(promptContent, {
					provider: chatProvider,
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
				});
			} catch (error) {
				console.error(error);
				toast.error("Failed to generate response");
			}
		},
		[
			activeTail,
			activeTargetId,
			appendToNode,
			compilePathTo,
			createAssistantAfter,
			createSystemMessage,
			createUserAfter,
			defaultSystemPrompt,
			ensureChatReady,
			setActiveTarget,
			setIsGenerating,
			setNodeStatus,
			streamManager,
		],
	);

	const handleDuplicateFromNode = useCallback(
		(nodeId: string) => {
			void cloneNode(nodeId);
		},
		[cloneNode],
	);

	const handleEditMessage = useCallback(
		(nodeId: string) => {
			setNodeStatus(nodeId, "draft");
			setEditingMessageId(nodeId);
		},
		[setNodeStatus],
	);

	const handleDeleteMessage = useCallback(
		(nodeId: string) => {
			deleteMessage({
				nodeId,
				editingNodeId: editingMessageId,
				streamManager,
				setIsGenerating,
				removeNodeFromTree,
				resetComposerState,
				activeTail,
				isTreeEmpty,
				createSystemMessage,
				setActiveTarget,
				defaultSystemPrompt,
			});
		},
		[
			activeTail,
			createSystemMessage,
			defaultSystemPrompt,
			editingMessageId,
			isTreeEmpty,
			removeNodeFromTree,
			resetComposerState,
			setActiveTarget,
			setIsGenerating,
			streamManager,
		],
	);

	const handleDetachMessage = useCallback(
		(nodeId: string) => {
			const prevId = predecessorOf(nodeId);
			if (!prevId) {
				return;
			}
			if (editingMessageId === nodeId) {
				resetComposerState();
			}
			setActiveTarget(prevId);
		},
		[editingMessageId, predecessorOf, resetComposerState, setActiveTarget],
	);

	const handleFinishEdit = useCallback(
		(nodeId: string, content: MessageContent) => {
			const replacementId = replaceNodeWithEditedClone(nodeId, {
				content,
				tokenLogprobs: undefined,
			});
			if (!replacementId) {
				return;
			}
			if (activeTargetId === nodeId) {
				setActiveTarget(replacementId);
			}
			resetComposerState();
		},
		[
			activeTargetId,
			replaceNodeWithEditedClone,
			resetComposerState,
			setActiveTarget,
		],
	);

	const handleActivateThread = useCallback(
		(targetId: string | undefined) => {
			if (!targetId) {
				return;
			}
			setActiveTarget(targetId);
			resetComposerState();
			setIsGenerating(false);
		},
		[resetComposerState, setActiveTarget],
	);

	const handleRerollFromToken = useCallback(
		async (
			messageId: string,
			tokenIndex: number,
			replacement: TokenAlternative,
		) => {
			const readiness = ensureChatReady();
			if (!readiness) {
				return undefined;
			}
			if (
				readiness.kind !== "openai-compatible" &&
				readiness.kind !== "dummy"
			) {
				toast.error("Token rerolls require an OpenAI-compatible provider");
				return undefined;
			}
			if (isGenerating) {
				abortActiveStreams();
			}
			const { nodes } = useConversationTree.getState();
			const target = nodes[messageId];
			if (!target || target.role !== "assistant") {
				return undefined;
			}
			const parentId = predecessorOf(messageId);
			if (!parentId) {
				return undefined;
			}
			const existingTokens = target.tokenLogprobs ?? [];
			const targetToken = existingTokens[tokenIndex];
			if (!targetToken) {
				return undefined;
			}
			const prefixTokens = existingTokens.slice(0, tokenIndex);
			const replacementEntry: TokenLogprob = {
				token: replacement.token,
				probability: replacement.probability,
				alternatives: [
					replacement,
					...targetToken.alternatives.filter(
						(alt) => alt.token !== replacement.token,
					),
				],
				segment: targetToken.segment,
			};
			const seedTokens = [...prefixTokens, replacementEntry];
			const seedText = seedTokens.map((entry) => entry.token).join("");
			const seedReasoning = seedTokens
				.filter((entry) => entry.segment === "reasoning")
				.map((entry) => entry.token)
				.join("");
			const seedContent = seedTokens
				.filter((entry) => entry.segment !== "reasoning")
				.map((entry) => entry.token)
				.join("");
			const assistantId = createAssistantAfter(parentId);
			setNodeStatus(assistantId, "streaming");
			setActiveTarget(assistantId);
			appendToNode(assistantId, {
				content: seedContent || undefined,
				reasoning: seedReasoning || undefined,
				tokenLogprobs: seedTokens,
			});
			const abortController = new AbortController();
			streamManager.register(assistantId, abortController);
			void (async () => {
				try {
					setIsGenerating(true);
					if (readiness.kind === "dummy") {
						// Dummy provider: use custom streaming with fake logprobs
						const { createDummyProvider, generateFakeLogprobs } = await import(
							"../ai/dummyProvider"
						);
						const dummyProvider = createDummyProvider({
							tokensPerSecond: readiness.tokensPerSecond,
						});
						const stream = streamText({
							model: dummyProvider.chatModel(readiness.modelId),
							messages: toModelMessages(
								compilePathTo(parentId),
								seedText || undefined,
							),
							abortSignal: abortController.signal,
						});
						for await (const part of stream.fullStream) {
							if (part.type === "text-delta" && part.text) {
								const tokenLogprob = generateFakeLogprobs(
									part.text,
									readiness.modelId,
								);
								appendToNode(assistantId, {
									content: part.text,
									tokenLogprobs: [tokenLogprob],
								});
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
					} else {
						// OpenAI-compatible provider
						const stream = streamText({
							model: readiness.openAIProvider.chatModel(readiness.modelId),
							messages: toModelMessages(
								compilePathTo(parentId),
								seedText || undefined,
							),
							temperature: 0.3,
							abortSignal: abortController.signal,
							includeRawChunks: true,
							providerOptions: buildChatLogprobOptions(
								OPENAI_COMPATIBLE_PROVIDER_NAME,
							),
						});
						await processFullStream(stream.fullStream, {
							append: (delta) => appendToNode(assistantId, delta),
							parseRawChunk: parseChatLogprobsChunk,
						});
						setNodeStatus(assistantId, "final");
					}
				} catch (error) {
					if (abortController.signal.aborted) {
						setNodeStatus(assistantId, "draft");
					} else {
						setNodeStatus(assistantId, "error");
						toast.error("Failed to regenerate from token");
						console.error(error);
					}
				} finally {
					if (streamManager.getLatest() === assistantId) {
						setIsGenerating(false);
					}
					streamManager.clearLatestIf(assistantId);
				}
			})();
			return assistantId;
		},
		[
			abortActiveStreams,
			appendToNode,
			compilePathTo,
			createAssistantAfter,
			ensureChatReady,
			isGenerating,
			predecessorOf,
			setActiveTarget,
			setIsGenerating,
			setNodeStatus,
			streamManager,
		],
	);

	return {
		chatMessages,
		isGenerating,
		editingMessageId,
		resetSignal: composerResetSignal,
		isPromptDirty,
		setIsPromptDirty,
		send: handleSend,
		stop: abortActiveStreams,
		deleteMessage: handleDeleteMessage,
		detachMessage: handleDetachMessage,
		startEdit: handleEditMessage,
		submitEdit: handleFinishEdit,
		cancelEdit: resetComposerState,
		clearConversation,
		duplicateFromNode: handleDuplicateFromNode,
		activateThread: handleActivateThread,
		exportSnapshot,
		importSnapshot,
		abortActiveStreams,
		resetComposerState,
		isTreeEmpty,
		createSystemMessage,
		setActiveTarget,
		activeTail,
		rerollFromToken: handleRerollFromToken,
	};
};
