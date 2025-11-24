import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { sendMessage } from "../ai/sendMessage";
import { useConversationTree } from "../tree/useConversationTree";
import type { ChatProviderReady, Message } from "../types";
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
		nodes,
		edges,
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
			nodes: state.nodes,
			edges: state.edges,
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

	const chatMessages = useMemo<Message[]>(() => {
		const target = activeTargetId ?? activeTail();
		if (!target) {
			return [];
		}
		return compilePathTo(target);
	}, [activeTargetId, activeTail, compilePathTo, edges, nodes]);

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
		async (promptText: string) => {
			const chatProvider = ensureChatReady();
			if (!chatProvider) {
				return;
			}
			try {
				await sendMessage(promptText, {
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
		(nodeId: string, text: string) => {
			const replacementId = replaceNodeWithEditedClone(nodeId, {
				text,
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
