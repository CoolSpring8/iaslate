import type { StreamManager } from "../hooks/useStreamManager";

interface DeleteMessageOptions {
	nodeId: string;
	editingNodeId?: string;
	streamManager: StreamManager;
	setIsGenerating: (value: boolean) => void;
	removeNodeFromTree: (id: string) => void;
	resetComposerState: () => void;
	activeTail: () => string | undefined;
	isTreeEmpty: () => boolean;
	createSystemMessage: (text: string) => string;
	setActiveTarget: (id: string | undefined) => void;
	defaultSystemPrompt: string;
}

export const deleteMessage = ({
	nodeId,
	editingNodeId,
	streamManager,
	setIsGenerating,
	removeNodeFromTree,
	resetComposerState,
	activeTail,
	isTreeEmpty,
	createSystemMessage,
	setActiveTarget,
	defaultSystemPrompt,
}: DeleteMessageOptions) => {
	streamManager.abort(nodeId);
	setIsGenerating(false);
	removeNodeFromTree(nodeId);
	if (editingNodeId === nodeId) {
		resetComposerState();
	}
	const tailId = activeTail();
	if (tailId) {
		setActiveTarget(tailId);
	} else if (isTreeEmpty()) {
		const systemId = createSystemMessage(defaultSystemPrompt);
		setActiveTarget(systemId);
	} else {
		setActiveTarget(undefined);
	}
};
