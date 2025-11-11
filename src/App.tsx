import { Textarea, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { get, set } from "idb-keyval";
import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
	type ChangeEvent,
	type MutableRefObject,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Toaster, toast } from "sonner";
import { twJoin } from "tailwind-merge";
import { useImmer } from "use-immer";
import { useShallow } from "zustand/react/shallow";
import DiagramView from "./components/DiagramView";
import Header from "./components/Header";
import MessageItem from "./components/MessageItem";
import SettingsModal from "./components/SettingsModal";
import type { ConversationSnapshot } from "./tree/types";
import { useConversationTree } from "./tree/useConversationTree";

const baseURLKey = "iaslate_baseURL";
const apiKeyKey = "iaslate_apiKey";
const modelsKey = "iaslate_models";

const defaultSystemPrompt = "You are a helpful assistant.";

const extractTextDelta = (input: unknown): string => {
	if (!input) {
		return "";
	}
	if (typeof input === "string") {
		return input;
	}
	if (Array.isArray(input)) {
		return input
			.map((part) => {
				if (typeof part === "string") {
					return part;
				}
				if (typeof part === "object" && part !== null) {
					if (
						"text" in part &&
						typeof (part as { text?: unknown }).text === "string"
					) {
						return (part as { text?: string }).text ?? "";
					}
					if (
						"content" in part &&
						typeof (part as { content?: unknown }).content === "string"
					) {
						return (part as { content?: string }).content ?? "";
					}
				}
				return "";
			})
			.join("");
	}
	return "";
};

const App = () => {
	const [baseURL, setBaseURL] = useState("");
	const [apiKey, setAPIKey] = useState("");
	const [models, setModels] = useImmer<OpenAI.Model[]>([]);
	const [activeModel, setActiveModel] = useImmer<string | null>(null);

	const client = (() => {
		const ref = useRef<OpenAI | null>(null);
		if (!ref.current) {
			ref.current = new OpenAI({
				baseURL,
				apiKey: apiKey || "_PLACEHOLDER_",
				dangerouslyAllowBrowser: true,
			});
		}
		return ref as MutableRefObject<OpenAI>;
	})();

	useEffect(() => {
		(async () => {
			const storedBaseURL = await get<string>(baseURLKey);
			if (storedBaseURL) {
				setBaseURL(storedBaseURL);
			}
			const storedAPIKey = await get<string>(apiKeyKey);
			if (storedAPIKey) {
				setAPIKey(storedAPIKey);
			}
			const storedModels = await get<OpenAI.Model[]>(modelsKey);
			if (storedModels) {
				setModels(storedModels);
			}
			client.current = new OpenAI({
				baseURL: storedBaseURL,
				apiKey: storedAPIKey || "_PLACEHOLDER_",
				dangerouslyAllowBrowser: true,
			});
			if (!storedModels) {
				const response = await client.current.models.list();
				setModels(response.data);
				await set(modelsKey, response.data);
				setActiveModel(response.data[0].id);
			}
		})();
	}, []);

	const [isGenerating, setIsGenerating] = useState(false);
	const [prompt, setPrompt] = useImmer("");
	const [isSettingsOpen, { open: onSettingsOpen, close: onSettingsClose }] =
		useDisclosure();
	const [editingNodeId, setEditingNodeId] = useState<string | undefined>(
		undefined,
	);
	const [view, setView] = useState<"chat" | "diagram">("chat");
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
	}, [isGenerating, prompt, editingNodeId, chatMessages.length]);

	useEffect(() => {
		if (isTreeEmpty() && chatMessages.length === 0) {
			const systemId = createSystemMessage(defaultSystemPrompt);
			setActiveTarget(systemId);
		}
	}, [isTreeEmpty, createSystemMessage, setActiveTarget, chatMessages.length]);

	const streamControllersRef = useRef<Record<string, AbortController>>({});
	const latestAssistantIdRef = useRef<string | undefined>(undefined);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

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

	const handleSend = async () => {
		if (!activeModel) {
			toast.error("Select a model before sending");
			return;
		}
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
		const contextMessages = compilePathTo(resolvedParentId)
			.filter((message) => message.role !== "tool")
			.map<ChatCompletionMessageParam>((message) => ({
				role: message.role as "system" | "user" | "assistant",
				content: message.content,
			}));
		try {
			const stream = await client.current.chat.completions.create(
				{
					model: activeModel,
					messages: contextMessages,
					stream: true,
					temperature: 0.3,
				},
				{ signal: abortController.signal },
			);
			setIsGenerating(true);
			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta;
				const contentDelta = extractTextDelta(delta?.content);
				const reasoningDelta = extractTextDelta(
					(delta as { reasoning_content?: unknown } | undefined)
						?.reasoning_content,
				);
				if (!contentDelta && !reasoningDelta) {
					continue;
				}
				appendToNode(assistantId, {
					content: contentDelta,
					reasoning: reasoningDelta,
				});
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
	}: {
		baseURL: string;
		apiKey: string;
	}) => {
		setBaseURL(nextBaseURL);
		await set(baseURLKey, nextBaseURL);
		setAPIKey(nextAPIKey);
		await set(apiKeyKey, nextAPIKey);
		client.current = new OpenAI({
			baseURL: nextBaseURL,
			apiKey: nextAPIKey,
			dangerouslyAllowBrowser: true,
		});
		onSettingsClose();
	};

	const handleSyncModels = async () => {
		const response = await client.current.models.list();
		setModels(response.data);
		await set(modelsKey, response.data);
		if (!activeModel) {
			setActiveModel(response.data[0].id);
		}
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
			) : (
				<div className="flex-1 overflow-hidden px-2 py-2">
					<DiagramView
						onNodeDoubleClick={handleActivateThread}
						onSetActiveNode={handleActivateThread}
						onDuplicateFromNode={handleDuplicateFromNode}
					/>
				</div>
			)}
			<SettingsModal
				open={isSettingsOpen}
				baseURL={baseURL}
				apiKey={apiKey}
				onClose={onSettingsClose}
				onSave={handleSettingsSave}
				onSyncModels={handleSyncModels}
			/>
			<Toaster />
		</div>
	);
};

export default App;
