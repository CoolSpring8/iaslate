import { builtInAI } from "@built-in-ai/core";
import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { buildOpenAICompatibleProvider } from "./ai/openaiCompatible";
import ChatView from "./components/ChatView";
import DiagramView from "./components/DiagramView";
import Header from "./components/Header";
import SettingsModal from "./components/SettingsModal";
import SnapshotIO from "./components/SnapshotIO";
import TextCompletionView from "./components/TextCompletionView";
import { useBeforeUnloadGuard } from "./hooks/useBeforeUnloadGuard";
import { useBuiltInAvailability } from "./hooks/useBuiltInAvailability";
import { useBuiltInStatus } from "./hooks/useBuiltInStatus";
import { useConversationController } from "./hooks/useConversationController";
import { useEnsureSystemMessage } from "./hooks/useEnsureSystemMessage";
import { useProviderReadiness } from "./hooks/useProviderReadiness";
import { useTextCompletion } from "./hooks/useTextCompletion";
import { useSettingsStore } from "./state/useSettingsStore";
import type { AppView } from "./types";

const defaultSystemPrompt = "You are a helpful assistant.";

const App = () => {
	const {
		providers,
		activeProviderId,
		models,
		activeModel,
		setActiveModel,
		enableBeforeUnloadWarning,
		builtInAvailability,
		hydrate,
		refreshBuiltInAvailability,
	} = useSettingsStore(
		useShallow((state) => ({
			providers: state.providers,
			activeProviderId: state.activeProviderId,
			models: state.models,
			activeModel: state.activeModel,
			setActiveModel: state.setActiveModel,
			enableBeforeUnloadWarning: state.enableBeforeUnloadWarning,
			builtInAvailability: state.builtInAvailability,
			hydrate: state.hydrate,
			refreshBuiltInAvailability: state.refreshBuiltInAvailability,
		})),
	);
	const [view, setView] = useState<AppView>("chat");

	const activeProvider = useMemo(
		() => providers.find((p) => p.id === activeProviderId),
		[providers, activeProviderId],
	);

	const providerKind = activeProvider?.kind ?? "openai-compatible";

	const openAIProvider = useMemo(
		() =>
			buildOpenAICompatibleProvider({
				baseURL: activeProvider?.config.baseURL ?? "",
				apiKey: activeProvider?.config.apiKey ?? "",
			}),
		[activeProvider],
	);

	const getBuiltInChatModel = useCallback(() => builtInAI(), []);

	const builtInStatusText = useBuiltInStatus({
		providerKind,
		builtInAvailability,
	});

	useEffect(() => {
		void hydrate();
	}, [hydrate]);

	useBuiltInAvailability({
		providerKind,
		onBuiltInSelected: () => setActiveModel(null),
		refreshBuiltInAvailability,
	});

	const { ensureChatReady, ensureCompletionReady } = useProviderReadiness({
		providerKind,
		builtInAvailability,
		activeModel,
		openAIProvider,
		getBuiltInChatModel,
	});

	const {
		chatMessages,
		isGenerating,
		editingMessageId,
		resetSignal,
		isPromptDirty,
		setIsPromptDirty,
		send,
		stop,
		deleteMessage,
		detachMessage,
		startEdit,
		submitEdit,
		cancelEdit,
		clearConversation,
		duplicateFromNode,
		activateThread,
		exportSnapshot,
		importSnapshot,
		abortActiveStreams,
		resetComposerState,
		isTreeEmpty,
		createSystemMessage,
		setActiveTarget,
	} = useConversationController({
		defaultSystemPrompt,
		ensureChatReady,
	});

	const {
		textContent,
		setTextContent,
		isGenerating: isTextGenerating,
		predict,
		cancel,
	} = useTextCompletion({
		ensureCompletionReady,
	});

	useEnsureSystemMessage({
		isTreeEmpty,
		chatMessagesLength: chatMessages.length,
		createSystemMessage,
		setActiveTarget,
		defaultSystemPrompt,
	});

	useEffect(() => {
		if (view !== "text") {
			cancel();
		}
		return () => {
			cancel();
		};
	}, [cancel, view]);

	useEffect(() => {
		if (view === "text" && providerKind === "built-in") {
			toast.error("Built-in AI supports chat only");
		}
	}, [providerKind, view]);

	const [isSettingsOpen, { open: onSettingsOpen, close: onSettingsClose }] =
		useDisclosure();

	const hasSessionState =
		isGenerating ||
		isPromptDirty ||
		isTextGenerating ||
		textContent.trim().length > 0 ||
		typeof editingMessageId !== "undefined" ||
		chatMessages.length > 1;

	useBeforeUnloadGuard(enableBeforeUnloadWarning && hasSessionState);

	const handleClearConversation = useCallback(() => {
		clearConversation();
		cancel();
		setTextContent("");
	}, [cancel, clearConversation, setTextContent]);

	const handleImportPreparation = useCallback(() => {
		abortActiveStreams();
		cancel();
		resetComposerState();
	}, [abortActiveStreams, cancel, resetComposerState]);

	return (
		<SnapshotIO
			exportSnapshot={exportSnapshot}
			importSnapshot={importSnapshot}
			onImportStart={handleImportPreparation}
		>
			{({ triggerImport, triggerExport }) => (
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
						onImport={triggerImport}
						onExport={triggerExport}
						onOpenSettings={onSettingsOpen}
					/>
					{view === "chat" ? (
						<div className="flex-1 min-h-0">
							<ChatView
								messages={chatMessages}
								isGenerating={isGenerating}
								editingMessageId={editingMessageId}
								onSend={send}
								onStop={stop}
								onDeleteMessage={deleteMessage}
								onDetachMessage={detachMessage}
								onEditStart={startEdit}
								onEditSubmit={submitEdit}
								onEditCancel={cancelEdit}
								onPromptDirtyChange={setIsPromptDirty}
								resetSignal={resetSignal}
							/>
						</div>
					) : view === "diagram" ? (
						<div className="flex-1 overflow-hidden px-2 py-2">
							<DiagramView
								onNodeDoubleClick={activateThread}
								onSetActiveNode={activateThread}
								onDuplicateFromNode={duplicateFromNode}
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
							onPredict={predict}
							onCancel={cancel}
						/>
					)}
					<SettingsModal open={isSettingsOpen} onClose={onSettingsClose} />
					<Toaster />
				</div>
			)}
		</SnapshotIO>
	);
};

export default App;
