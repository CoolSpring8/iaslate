import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { sendMessage } from "../ai/sendMessage";
import { useConversationTree } from "../tree/useConversationTree";
import type { ChatProviderReady, Message, MessageContent } from "../types";
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
					a.reasoning_content !== b.reasoning_content
				) {
					return false;
				}
			}
			return true;
		},
		[areContentsEqual],
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
	};
};
