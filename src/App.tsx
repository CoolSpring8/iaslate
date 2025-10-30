import { Textarea, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { get, set } from "idb-keyval";
import { OpenAI } from "openai";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { twJoin } from "tailwind-merge";
import { useImmer } from "use-immer";
import { v4 as uuidv4 } from "uuid";
import DiagramView from "./components/DiagramView";
import Header from "./components/Header";
import MessageItem from "./components/MessageItem";
import SettingsModal from "./components/SettingsModal";
import { useConversationGraph } from "./graph/useConversationGraph";
import type { Message } from "./types";

const baseURLKey = "iaslate_baseURL";
const apiKeyKey = "iaslate_apiKey";
const modelsKey = "iaslate_models";

const App = () => {
	const [messagesList, setMessagesList] = useImmer<Message[]>([
		{
			role: "system",
			content: "You are a helpful assistant.",
			_metadata: {
				uuid: uuidv4(),
			},
		},
	]);

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
	const [editingIndex, setEditingIndex] = useState<number | undefined>(
		undefined,
	);
	const [view, setView] = useState<"chat" | "diagram">("chat");
	const isComposing = useRef(false);
	const syncLinearTail = useConversationGraph((state) => state.syncLinearTail);
	const detachBetween = useConversationGraph((state) => state.detachBetween);
	const compilePathTo = useConversationGraph((state) => state.compilePathTo);
	const compileActive = useConversationGraph((state) => state.compileActive);
	const setActiveTarget = useConversationGraph(
		(state) => state.setActiveTarget,
	);
	const findTailOfThread = useConversationGraph(
		(state) => state.findTailOfThread,
	);
	const activeTargetId = useConversationGraph((state) => state.activeTargetId);
	const removeNodeFromGraph = useConversationGraph((state) => state.removeNode);
	const resetGraph = useConversationGraph((state) => state.reset);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			const hasSessionState =
				isGenerating ||
				prompt.trim().length > 0 ||
				typeof editingIndex !== "undefined" ||
				messagesList.length > 1;
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
	}, [isGenerating, prompt, editingIndex, messagesList.length]);

	useEffect(() => {
		syncLinearTail(messagesList);
		if (!activeTargetId && messagesList.length > 0) {
			setActiveTarget(messagesList[messagesList.length - 1]._metadata.uuid);
		}
	}, [messagesList, syncLinearTail, activeTargetId, setActiveTarget]);

	const handleClearConversation = () => {
		messagesList.forEach((message) => {
			message._abortController?.abort?.();
		});
		setIsGenerating(false);
		setEditingIndex(undefined);
		setPrompt("");
		setMessagesList([]);
		setActiveTarget(undefined);
		resetGraph();
	};

	const handleExport = () => {
		const blob = new Blob([JSON.stringify(messagesList, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `messages_${new Date().toISOString()}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
		toast.success("Exported to JSON");
	};

	const handleActivateThread = (targetId: string) => {
		if (!targetId) {
			return;
		}
		const compiled = compilePathTo(targetId);
		setActiveTarget(targetId);
		if (compiled.length > 0) {
			setMessagesList(compiled);
		} else {
			setMessagesList([]);
		}
		setEditingIndex(undefined);
		setPrompt("");
		setIsGenerating(false);
		setView("chat");
	};

	const handleEditMessage = (index: number) => {
		const targetMessage = messagesList[index];
		if (!targetMessage) {
			return;
		}
		setEditingIndex(index);
		setPrompt(targetMessage.content);
	};

	const handleDeleteMessage = (index: number) => {
		const targetMessage = messagesList[index];
		if (!targetMessage) {
			return;
		}
		targetMessage._abortController?.abort?.();
		const deletedId = targetMessage._metadata.uuid;
		removeNodeFromGraph(deletedId);
		if (typeof editingIndex !== "undefined") {
			if (editingIndex === index) {
				setEditingIndex(undefined);
				setPrompt("");
			} else if (editingIndex > index) {
				setEditingIndex(editingIndex - 1);
			}
		}
		setIsGenerating(false);
		setMessagesList((draft) => {
			draft.splice(index, 1);
		});
		if (activeTargetId === deletedId) {
			const fallbackId =
				(index > 0
					? messagesList[index - 1]?._metadata.uuid
					: messagesList[index + 1]?._metadata.uuid) ??
				messagesList[0]?._metadata.uuid;
			if (fallbackId) {
				handleActivateThread(fallbackId);
			} else {
				setActiveTarget(undefined);
				const compiledFallback = compileActive();
				if (compiledFallback.length > 0) {
					setMessagesList(compiledFallback);
				} else {
					setMessagesList([]);
				}
			}
		}
	};

	const handleDetachMessages = (index: number) => {
		if (index === 0) {
			return;
		}
		const currentMessage = messagesList[index];
		const previousMessage = messagesList[index - 1];
		if (!currentMessage || !previousMessage) {
			return;
		}
		currentMessage._abortController?.abort?.();
		setIsGenerating(false);
		if (typeof editingIndex !== "undefined" && editingIndex >= index) {
			setEditingIndex(undefined);
			setPrompt("");
		}
		const prevId = previousMessage._metadata.uuid;
		const currentId = currentMessage._metadata.uuid;
		if (!prevId || !currentId) {
			return;
		}
		detachBetween(prevId, currentId);
		const newTargetId = findTailOfThread(prevId);
		handleActivateThread(newTargetId);
	};

	const handleSend = async () => {
		setPrompt("");
		const assistantMessageUUID = uuidv4();
		const assistantAbortController = new AbortController();
		const messagesNew = prompt
			? [
					...messagesList,
					{
						role: "user",
						content: prompt,
						_metadata: {
							uuid: uuidv4(),
						},
					},
					{
						role: "assistant",
						content: "",
						_metadata: {
							uuid: assistantMessageUUID,
						},
						_abortController: assistantAbortController,
					},
				]
			: [
					...messagesList,
					{
						role: "assistant",
						content: "",
						_metadata: {
							uuid: assistantMessageUUID,
						},
						_abortController: assistantAbortController,
					},
				];
		setMessagesList(messagesNew);
		setActiveTarget(assistantMessageUUID);
		const stream = await client.current.chat.completions.create(
			{
				model: activeModel,
				messages: messagesNew
					.map((message) => ({
						role: message.role,
						content: message.content,
					}))
					.slice(0, -1),
				// max_tokens: 2048,
				stream: true,
				temperature: 0.3,
				// cache_prompt: true,
			},
			{
				signal: assistantAbortController.signal,
			},
		);
		setIsGenerating(true);
		for await (const chunk of stream) {
			setMessagesList((draft) => {
				const targetMessage = draft.find(
					(message) => message._metadata.uuid === assistantMessageUUID,
				);
				if (
					chunk.choices[0].delta.content &&
					!assistantAbortController.signal.aborted &&
					typeof targetMessage !== "undefined"
				) {
					targetMessage.content =
						targetMessage.content + chunk.choices[0].delta.content;
				}
			});
		}
		setIsGenerating(false);
	};

	const handleFinishEdit = () => {
		if (typeof editingIndex === "undefined") {
			return;
		}
		setMessagesList((draft) => {
			draft[editingIndex].content = prompt;
		});
		setEditingIndex(undefined);
		setPrompt("");
	};

	const handleSubmit = () => {
		if (isGenerating) {
			messagesList[messagesList.length - 1]?._abortController?.abort?.();
			return;
		}
		if (typeof editingIndex !== "undefined") {
			handleFinishEdit();
			return;
		}
		void handleSend();
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

	return (
		<div className="flex flex-col h-screen">
			<Header
				models={models}
				activeModel={activeModel}
				onModelChange={setActiveModel}
				view={view}
				onViewChange={setView}
				onClear={handleClearConversation}
				onExport={handleExport}
				onOpenSettings={onSettingsOpen}
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
						{messagesList.map((message, index) => (
							<MessageItem
								key={message._metadata.uuid}
								message={message}
								isEditing={editingIndex === index}
								isLast={index === messagesList.length - 1}
								isGenerating={isGenerating}
								onEdit={() => handleEditMessage(index)}
								onDelete={() => handleDeleteMessage(index)}
								onDetach={() => handleDetachMessages(index)}
								onBranch={() => handleActivateThread(message._metadata.uuid)}
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
										typeof editingIndex !== "undefined"
											? "i-lucide-check"
											: "i-lucide-send-horizontal",
										isGenerating ? "animate-spin" : "",
									)}
								/>
							</UnstyledButton>
						</div>
						{typeof editingIndex !== "undefined" && (
							<div className="absolute left-4 -top-8 h-8 w-[calc(100%-2rem)] rounded bg-orange-300 p-2 flex items-center text-slate-700 text-sm">
								<div className="i-lucide-edit flex-none" />
								<p className="ml-1 line-clamp-1">
									Editing: {messagesList[editingIndex].content}
								</p>
								<UnstyledButton
									className="i-lucide-x ml-auto flex-none"
									onClick={() => {
										setEditingIndex(undefined);
										setPrompt("");
									}}
								/>
							</div>
						)}
					</div>
				</>
			) : (
				<div className="flex-1 overflow-hidden px-2 py-2">
					<DiagramView
						onNodeDoubleClick={(nodeId) => {
							handleActivateThread(nodeId);
						}}
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
