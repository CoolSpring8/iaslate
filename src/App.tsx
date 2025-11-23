import { builtInAI } from "@built-in-ai/core";
import { useDisclosure } from "@mantine/hooks";
import { streamText } from "ai";
import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Toaster, toast } from "sonner";
import { useImmer } from "use-immer";
import { useShallow } from "zustand/react/shallow";
import { buildOpenAICompatibleProvider } from "./ai/openaiCompatible";
import { sendMessage } from "./ai/sendMessage";
import ChatView from "./components/ChatView";
import DiagramView from "./components/DiagramView";
import Header from "./components/Header";
import SettingsModal from "./components/SettingsModal";
import TextCompletionView from "./components/TextCompletionView";
import { useStreamManager } from "./hooks/useStreamManager";
import { useSettingsStore } from "./state/useSettingsStore";
import { useConversationTree } from "./tree/useConversationTree";
import type { AppView } from "./types";
import { deleteMessage } from "./utils/chatActions";
import { exportSnapshotToFile, parseSnapshotFile } from "./utils/snapshots";

const defaultSystemPrompt = "You are a helpful assistant.";

const App = () => {
	const {
		baseURL,
		apiKey,
		models,
		activeModel,
		setActiveModel,
		providerKind,
		builtInAvailability,
		hydrate,
		refreshBuiltInAvailability,
	} = useSettingsStore(
		useShallow((state) => ({
			baseURL: state.baseURL,
			apiKey: state.apiKey,
			models: state.models,
			activeModel: state.activeModel,
			setActiveModel: state.setActiveModel,
			providerKind: state.providerKind,
			builtInAvailability: state.builtInAvailability,
			hydrate: state.hydrate,
			refreshBuiltInAvailability: state.refreshBuiltInAvailability,
		})),
	);

	const openAIProvider = useMemo(
		() =>
			buildOpenAICompatibleProvider({
				baseURL,
				apiKey,
			}),
		[apiKey, baseURL],
	);

	const builtInStatusText = useMemo(() => {
		if (providerKind !== "built-in") {
			return undefined;
		}
		switch (builtInAvailability) {
			case "downloading":
				return "Built-in AI downloading...";
			case "available":
				return "Built-in AI ready";
			case "downloadable":
				return "Download model in Settings";
			case "unavailable":
				return "Built-in AI unavailable";
			default:
				return "Built-in AI";
		}
	}, [builtInAvailability, providerKind]);

	const getBuiltInChatModel = useCallback(() => {
		// Return a fresh model so each send can create a new session with the latest system prompt.
		return builtInAI();
	}, []);

	useEffect(() => {
		void hydrate();
	}, [hydrate]);

	useEffect(() => {
		void refreshBuiltInAvailability();
	}, [refreshBuiltInAvailability]);

	useEffect(() => {
		if (providerKind === "built-in") {
			setActiveModel(null);
		}
	}, [providerKind, setActiveModel]);

	const [isGenerating, setIsGenerating] = useState(false);
	const [textContent, setTextContent] = useImmer("");
	const [isTextGenerating, setIsTextGenerating] = useState(false);
	const [isSettingsOpen, { open: onSettingsOpen, close: onSettingsClose }] =
		useDisclosure();
	const [editingNodeId, setEditingNodeId] = useState<string | undefined>(
		undefined,
	);
	const [view, setView] = useState<AppView>("chat");
	const [isPromptDirty, setIsPromptDirty] = useState(false);
	const [composerResetSignal, setComposerResetSignal] = useState(0);
	const streamManager = useStreamManager();
	const {
		nodes: treeNodes,
		edges: treeEdges,
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

	const chatMessages = useMemo(() => {
		const target = activeTargetId ?? activeTail();
		if (!target) {
			return [];
		}
		return compilePathTo(target);
	}, [activeTargetId, treeNodes, treeEdges, compilePathTo, activeTail]);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			const hasSessionState =
				isGenerating ||
				isPromptDirty ||
				isTextGenerating ||
				textContent.trim().length > 0 ||
				typeof editingNodeId !== "undefined" ||
				chatMessages.length > 1;
			if (!hasSessionState) {
				return;
			}
			event.preventDefault();
			event.returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [
		isGenerating,
		isPromptDirty,
		isTextGenerating,
		textContent,
		editingNodeId,
		chatMessages.length,
	]);

	useEffect(() => {
		if (isTreeEmpty() && chatMessages.length === 0) {
			const systemId = createSystemMessage(defaultSystemPrompt);
			setActiveTarget(systemId);
		}
	}, [isTreeEmpty, createSystemMessage, setActiveTarget, chatMessages.length]);

	useEffect(() => {
		if (view !== "text" && textAbortControllerRef.current) {
			textAbortControllerRef.current.abort();
			textAbortControllerRef.current = null;
			setIsTextGenerating(false);
		}
		return () => {
			textAbortControllerRef.current?.abort();
			textAbortControllerRef.current = null;
		};
	}, [view]);

	useEffect(() => {
		if (view === "text" && providerKind === "built-in") {
			toast.error("Built-in AI supports chat only");
		}
	}, [providerKind, view]);

	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const textAbortControllerRef = useRef<AbortController | null>(null);

	const abortActiveStreams = () => {
		streamManager.abortAll();
		setIsGenerating(false);
	};

	const resetComposerState = () => {
		if (editingNodeId) {
			setNodeStatus(editingNodeId, "final");
		}
		setEditingNodeId(undefined);
		setComposerResetSignal((value) => value + 1);
		setIsPromptDirty(false);
	};

	const handleClearConversation = () => {
		abortActiveStreams();
		handleTextCancel();
		setTextContent("");
		resetComposerState();
		resetTree();
		const systemId = createSystemMessage(defaultSystemPrompt);
		setActiveTarget(systemId);
	};

	const handleExport = () => {
		const snapshot = exportSnapshot();
		exportSnapshotToFile(snapshot);
		toast.success("Exported conversation tree");
	};

	const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			event.target.value = "";
			return;
		}
		try {
			const snapshot = await parseSnapshotFile(file);
			abortActiveStreams();
			resetComposerState();
			importSnapshot(snapshot);

			toast.success("Conversation imported");
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error
					? error.message
					: "Failed to import conversation";
			toast.error(`Import failed: ${message}`);
		} finally {
			event.target.value = "";
		}
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleActivateThread = (targetId: string | undefined) => {
		if (!targetId) {
			return;
		}
		setActiveTarget(targetId);
		resetComposerState();
		setIsGenerating(false);
	};

	const handleDuplicateFromNode = (nodeId: string) => {
		void cloneNode(nodeId);
	};

	const handleEditMessage = (nodeId: string) => {
		setNodeStatus(nodeId, "draft");
		setEditingNodeId(nodeId);
	};

	const handleDeleteMessage = (nodeId: string) => {
		deleteMessage({
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
		});
	};

	const handleDetachMessage = (nodeId: string) => {
		const prevId = predecessorOf(nodeId);
		if (!prevId) {
			return;
		}
		if (editingNodeId === nodeId) {
			resetComposerState();
		}
		setActiveTarget(prevId);
	};

	const handleTextPredict = async () => {
		if (isTextGenerating) {
			return;
		}
		if (providerKind !== "openai-compatible") {
			toast.error("Built-in AI supports chat only");
			return;
		}
		if (!activeModel) {
			toast.error("Select a model before predicting");
			return;
		}
		if (!openAIProvider) {
			toast.error("Set an API base URL before predicting");
			return;
		}
		const abortController = new AbortController();
		textAbortControllerRef.current = abortController;
		setIsTextGenerating(true);
		try {
			const stream = streamText({
				model: openAIProvider!.completionModel(activeModel!),
				prompt: textContent,
				temperature: 0.3,
				abortSignal: abortController.signal,
			});
			for await (const delta of stream.textStream) {
				if (delta) {
					setTextContent((draft) => draft + delta);
				}
			}
		} catch (error) {
			if (abortController.signal.aborted) {
				return;
			}
			console.error(error);
			toast.error("Failed to generate completion");
		} finally {
			setIsTextGenerating(false);
			if (textAbortControllerRef.current === abortController) {
				textAbortControllerRef.current = null;
			}
		}
	};

	const handleTextCancel = () => {
		const controller = textAbortControllerRef.current;
		if (!controller) {
			setIsTextGenerating(false);
			return;
		}
		controller.abort();
		textAbortControllerRef.current = null;
		setIsTextGenerating(false);
	};

	const handleSend = async (promptText: string) => {
		await sendMessage(promptText, {
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
		});
	};

	const handleFinishEdit = (nodeId: string, text: string) => {
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
	};

	return (
		<div className="flex flex-col h-screen">
			<Header
				models={models}
				activeModel={activeModel}
				onModelChange={setActiveModel}
				modelSelectorDisabled={providerKind !== "openai-compatible"}
				modelPlaceholder={
					providerKind === "openai-compatible"
						? "Select a model"
						: "Built-in AI (no model list)"
				}
				modelStatus={builtInStatusText}
				view={view}
				onViewChange={setView}
				onClear={handleClearConversation}
				onImport={handleImportClick}
				onExport={handleExport}
				onOpenSettings={onSettingsOpen}
			/>
			<input
				ref={fileInputRef}
				type="file"
				accept="application/json"
				className="hidden"
				onChange={handleImportFile}
				aria-hidden="true"
				tabIndex={-1}
			/>
			{view === "chat" ? (
				<div className="flex-1 min-h-0">
					<ChatView
						messages={chatMessages}
						isGenerating={isGenerating}
						editingMessageId={editingNodeId}
						onSend={(value) =>
							void handleSend(value).catch((error) => {
								console.error(error);
								toast.error("Failed to generate response");
							})
						}
						onStop={abortActiveStreams}
						onDeleteMessage={handleDeleteMessage}
						onDetachMessage={handleDetachMessage}
						onEditStart={handleEditMessage}
						onEditSubmit={handleFinishEdit}
						onEditCancel={resetComposerState}
						onPromptDirtyChange={setIsPromptDirty}
						resetSignal={composerResetSignal}
					/>
				</div>
			) : view === "diagram" ? (
				<div className="flex-1 overflow-hidden px-2 py-2">
					<DiagramView
						onNodeDoubleClick={handleActivateThread}
						onSetActiveNode={handleActivateThread}
						onDuplicateFromNode={handleDuplicateFromNode}
					/>
				</div>
			) : (
				<TextCompletionView
					value={textContent}
					isGenerating={isTextGenerating}
					isPredictDisabled={providerKind !== "openai-compatible"}
					disabledReason={
						providerKind !== "openai-compatible"
							? "Built-in AI supports chat only"
							: undefined
					}
					onChange={(value) => {
						setTextContent(value);
					}}
					onPredict={handleTextPredict}
					onCancel={handleTextCancel}
				/>
			)}
			<SettingsModal open={isSettingsOpen} onClose={onSettingsClose} />
			<Toaster />
		</div>
	);
};

export default App;
