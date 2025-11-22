import { builtInAI } from "@built-in-ai/core";
import { Textarea, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { type ModelMessage, streamText } from "ai";
import { get, set } from "idb-keyval";
import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Toaster, toast } from "sonner";
import { twJoin } from "tailwind-merge";
import { useImmer } from "use-immer";
import { useShallow } from "zustand/react/shallow";
import {
	buildOpenAICompatibleProvider,
	fetchOpenAICompatibleModels,
} from "./ai/openaiCompatible";
import DiagramView from "./components/DiagramView";
import Header from "./components/Header";
import MessageItem from "./components/MessageItem";
import SettingsModal from "./components/SettingsModal";
import TextCompletionView from "./components/TextCompletionView";
import type { ConversationSnapshot } from "./tree/types";
import { useConversationTree } from "./tree/useConversationTree";
import type {
	AppView,
	BuiltInAvailability,
	ModelInfo,
	ProviderKind,
} from "./types";

const baseURLKey = "iaslate_baseURL";
const apiKeyKey = "iaslate_apiKey";
const modelsKey = "iaslate_models";
const providerKindKey = "iaslate_provider_kind";

const defaultSystemPrompt = "You are a helpful assistant.";

const App = () => {
	const [baseURL, setBaseURL] = useState("");
	const [apiKey, setAPIKey] = useState("");
	const [models, setModels] = useImmer<ModelInfo[]>([]);
	const [activeModel, setActiveModel] = useImmer<string | null>(null);
	const [providerKind, setProviderKind] =
		useState<ProviderKind>("openai-compatible");
	const [builtInAvailability, setBuiltInAvailability] =
		useState<BuiltInAvailability>("unknown");

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

	const refreshBuiltInAvailability = useCallback(async () => {
		try {
			const availability = await builtInAI().availability();
			setBuiltInAvailability(availability as BuiltInAvailability);
		} catch (error) {
			console.error(error);
			setBuiltInAvailability("unavailable");
		}
	}, []);

	const syncModels = useCallback(
		async ({
			baseURLOverride,
			apiKeyOverride,
			silent = false,
			force = false,
		}: {
			baseURLOverride?: string;
			apiKeyOverride?: string;
			silent?: boolean;
			force?: boolean;
		} = {}) => {
			if (!force && providerKind !== "openai-compatible") {
				return [];
			}
			const targetBaseURL = (baseURLOverride ?? baseURL).trim();
			const targetAPIKey = apiKeyOverride ?? apiKey;

			if (!targetBaseURL) {
				if (!silent) {
					toast.error("Set an API base URL before syncing");
				}
				return [];
			}

			try {
				const fetchedModels = await fetchOpenAICompatibleModels({
					baseURL: targetBaseURL,
					apiKey: targetAPIKey,
				});
				setModels(fetchedModels);
				await set(modelsKey, fetchedModels);
				const currentModelStillValid = fetchedModels.some(
					(model) => model.id === activeModel,
				);
				const nextModelId =
					(currentModelStillValid && activeModel) || fetchedModels.at(0)?.id;
				setActiveModel(nextModelId ?? null);
				if (!silent) {
					toast.success("Synced models");
				}
				return fetchedModels;
			} catch (error) {
				console.error(error);
				if (!silent) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to fetch models from API";
					toast.error(message);
				}
				return [];
			}
		},
		[activeModel, apiKey, baseURL, providerKind, setActiveModel, setModels],
	);

	useEffect(() => {
		(async () => {
			const storedProvider = await get<ProviderKind>(providerKindKey);
			if (storedProvider) {
				setProviderKind(storedProvider);
			}
			const storedBaseURL = await get<string>(baseURLKey);
			if (storedBaseURL) {
				setBaseURL(storedBaseURL);
			}
			const storedAPIKey = await get<string>(apiKeyKey);
			if (storedAPIKey) {
				setAPIKey(storedAPIKey);
			}
			const storedModels = await get<ModelInfo[]>(modelsKey);
			if (storedModels?.length) {
				setModels(storedModels);
				const nextModelId = storedModels.at(0)?.id;
				if (nextModelId) {
					setActiveModel(nextModelId);
				}
				return;
			}
			if (storedBaseURL) {
				await syncModels({
					baseURLOverride: storedBaseURL,
					apiKeyOverride: storedAPIKey,
					silent: true,
				});
			}
		})();
	}, [setActiveModel, setModels, syncModels]);

	useEffect(() => {
		void refreshBuiltInAvailability();
	}, [refreshBuiltInAvailability]);

	useEffect(() => {
		if (providerKind === "built-in") {
			setActiveModel(null);
		}
	}, [providerKind, setActiveModel]);

	const [isGenerating, setIsGenerating] = useState(false);
	const [prompt, setPrompt] = useImmer("");
	const [textContent, setTextContent] = useImmer("");
	const [isTextGenerating, setIsTextGenerating] = useState(false);
	const [isSettingsOpen, { open: onSettingsOpen, close: onSettingsClose }] =
		useDisclosure();
	const [editingNodeId, setEditingNodeId] = useState<string | undefined>(
		undefined,
	);
	const [view, setView] = useState<AppView>("chat");
	const isComposing = useRef(false);
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
				prompt.trim().length > 0 ||
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
		prompt,
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

	const streamControllersRef = useRef<Record<string, AbortController>>({});
	const latestAssistantIdRef = useRef<string | undefined>(undefined);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const textAbortControllerRef = useRef<AbortController | null>(null);

	const abortActiveStreams = () => {
		Object.values(streamControllersRef.current).forEach((controller) => {
			controller.abort();
		});
		streamControllersRef.current = {};
		latestAssistantIdRef.current = undefined;
		setIsGenerating(false);
	};

	const resetComposerState = () => {
		if (editingNodeId) {
			setNodeStatus(editingNodeId, "final");
		}
		setEditingNodeId(undefined);
		setPrompt("");
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
		const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		const safeTimestamp = snapshot.exportedAt.replace(/[:]/g, "-");
		anchor.href = url;
		anchor.download = `iaslate_tree_${safeTimestamp}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
		toast.success("Exported conversation tree");
	};

	const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			event.target.value = "";
			return;
		}
		try {
			const fileContents = await file.text();
			const snapshot = JSON.parse(fileContents) as ConversationSnapshot;
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

	const handleEditMessage = (nodeId: string, content: string) => {
		setNodeStatus(nodeId, "draft");
		setEditingNodeId(nodeId);
		setPrompt(content);
	};

	const handleDeleteMessage = (nodeId: string) => {
		const controller = streamControllersRef.current[nodeId];
		if (controller) {
			controller.abort();
			delete streamControllersRef.current[nodeId];
			setIsGenerating(false);
		}
		if (latestAssistantIdRef.current === nodeId) {
			latestAssistantIdRef.current = undefined;
		}
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

	const handleSend = async () => {
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
		const trimmedPrompt = prompt.trim();
		let resolvedParentId = activeTail() ?? activeTargetId;
		if (!resolvedParentId) {
			resolvedParentId = createSystemMessage(defaultSystemPrompt);
		}
		if (trimmedPrompt.length > 0) {
			resolvedParentId = createUserAfter(resolvedParentId, trimmedPrompt);
			setPrompt("");
		}
		const assistantId = createAssistantAfter(resolvedParentId);
		setNodeStatus(assistantId, "streaming");
		setActiveTarget(assistantId);
		latestAssistantIdRef.current = assistantId;
		const abortController = new AbortController();
		streamControllersRef.current[assistantId] = abortController;
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
			delete streamControllersRef.current[assistantId];
			if (latestAssistantIdRef.current === assistantId) {
				latestAssistantIdRef.current = undefined;
			}
		}
	};

	const handleFinishEdit = () => {
		if (!editingNodeId) {
			return;
		}
		const replacementId = replaceNodeWithEditedClone(editingNodeId, {
			text: prompt,
		});
		if (!replacementId) {
			return;
		}
		if (activeTargetId === editingNodeId) {
			setActiveTarget(replacementId);
		}
		resetComposerState();
	};

	const handleSubmit = () => {
		if (isGenerating) {
			const currentAssistantId = latestAssistantIdRef.current;
			if (currentAssistantId) {
				streamControllersRef.current[currentAssistantId]?.abort();
			}
			setIsGenerating(false);
			return;
		}
		if (editingNodeId) {
			handleFinishEdit();
			return;
		}
		void handleSend().catch((error) => {
			console.error(error);
			toast.error("Failed to generate response");
		});
	};

	const handleSettingsSave = async ({
		baseURL: nextBaseURL,
		apiKey: nextAPIKey,
		providerKind: nextProviderKind,
	}: {
		baseURL: string;
		apiKey: string;
		providerKind: ProviderKind;
	}) => {
		setProviderKind(nextProviderKind);
		await set(providerKindKey, nextProviderKind);
		setBaseURL(nextBaseURL);
		await set(baseURLKey, nextBaseURL);
		setAPIKey(nextAPIKey);
		await set(apiKeyKey, nextAPIKey);
		if (nextProviderKind === "openai-compatible") {
			await syncModels({
				baseURLOverride: nextBaseURL,
				apiKeyOverride: nextAPIKey,
				silent: true,
				force: true,
			});
		} else {
			setActiveModel(null);
		}
		onSettingsClose();
	};

	const handleSyncModels = async () => {
		await syncModels();
	};

	const editingMessage = editingNodeId
		? chatMessages.find((message) => message._metadata.uuid === editingNodeId)
		: undefined;

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
				<>
					<div
						className="flex-1 overflow-y-auto px-4 py-2"
						onDrop={async (event) => {
							event.preventDefault();
							if (event.dataTransfer.items) {
								for (const item of event.dataTransfer.items) {
									if (item.kind === "file") {
										const file = item.getAsFile();
										if (file) {
											const content = await file.text();
											setPrompt((draft) => draft + content);
										}
									}
								}
							}
						}}
						onDragOver={(event) => {
							event.preventDefault();
						}}
					>
						{chatMessages.map((message, index) => (
							<MessageItem
								key={message._metadata.uuid}
								message={message}
								isEditing={editingNodeId === message._metadata.uuid}
								isLast={index === chatMessages.length - 1}
								isGenerating={isGenerating}
								onEdit={() =>
									handleEditMessage(message._metadata.uuid, message.content)
								}
								onDelete={() => handleDeleteMessage(message._metadata.uuid)}
								onDetach={() => handleDetachMessage(message._metadata.uuid)}
							/>
						))}
					</div>
					<div className="relative px-4 py-2">
						<div className="flex items-center">
							<Textarea
								className="w-full"
								minRows={1}
								maxRows={5}
								placeholder="Type your message..."
								value={prompt}
								onChange={(event) => {
									setPrompt(event.target.value);
								}}
								onCompositionStart={() => {
									isComposing.current = true;
								}}
								onCompositionEnd={() => {
									isComposing.current = false;
								}}
								onKeyDown={(event) => {
									if (
										event.key === "Enter" &&
										!event.shiftKey &&
										!event.nativeEvent.isComposing &&
										!isComposing.current
									) {
										event.preventDefault();
										handleSubmit();
									}
								}}
							/>
							<UnstyledButton
								className="ml-2 border rounded-full w-8 h-8 flex items-center justify-center"
								onClick={handleSubmit}
							>
								<div
									className={twJoin(
										"w-4 h-4",
										editingNodeId
											? "i-lucide-check"
											: "i-lucide-send-horizontal",
										isGenerating ? "animate-spin" : "",
									)}
								/>
							</UnstyledButton>
						</div>
						{editingMessage && (
							<div className="absolute left-4 -top-8 h-8 w-[calc(100%-2rem)] rounded bg-orange-300 p-2 flex items-center text-slate-700 text-sm">
								<div className="i-lucide-edit flex-none" />
								<p className="ml-1 line-clamp-1">
									Editing: {editingMessage.content}
								</p>
								<UnstyledButton
									className="i-lucide-x ml-auto flex-none"
									onClick={() => {
										resetComposerState();
									}}
								/>
							</div>
						)}
					</div>
				</>
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
			<SettingsModal
				open={isSettingsOpen}
				baseURL={baseURL}
				apiKey={apiKey}
				providerKind={providerKind}
				builtInAvailability={builtInAvailability}
				onBuiltInAvailabilityChange={setBuiltInAvailability}
				onClose={onSettingsClose}
				onSave={handleSettingsSave}
				onSyncModels={handleSyncModels}
			/>
			<Toaster />
		</div>
	);
};

export default App;
