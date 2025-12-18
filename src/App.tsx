import { builtInAI } from "@built-in-ai/core";
import { Drawer } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { buildOpenAICompatibleProvider } from "./ai/openaiCompatible";
import ChatView from "./components/ChatView";
import Header from "./components/Header";
import SettingsModal from "./components/SettingsModal";
import SidePanel from "./components/SidePanel";
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
import type { AppView, ModelInfo } from "./types";

const defaultSystemPrompt = "You are a helpful assistant.";
const emptyModels: ModelInfo[] = [];

const App = () => {
	const {
		providers,
		activeProviderId,
		setActiveModel,
		enableBeforeUnloadWarning,
		builtInAvailability,
		hydrate,
		refreshBuiltInAvailability,
	} = useSettingsStore(
		useShallow((state) => ({
			providers: state.providers,
			activeProviderId: state.activeProviderId,
			setActiveModel: state.setActiveModel,
			enableBeforeUnloadWarning: state.enableBeforeUnloadWarning,
			builtInAvailability: state.builtInAvailability,
			hydrate: state.hydrate,
			refreshBuiltInAvailability: state.refreshBuiltInAvailability,
		})),
	);
	const [view, setView] = useState<AppView>("chat");
	const [chatSidePanelTab, setChatSidePanelTab] = useState<
		"diagram" | "settings"
	>("settings");
	const isMobile = useMediaQuery("(max-width: 768px)", undefined, {
		getInitialValueInEffect: false,
	});
	const [isSidePanelOpen, { toggle: toggleSidePanel, close: closeSidePanel }] =
		useDisclosure(false);

	const activeProvider = useMemo(
		() => providers.find((p) => p.id === activeProviderId),
		[providers, activeProviderId],
	);

	const models = activeProvider?.models ?? emptyModels;
	const activeModel = activeProvider?.activeModelId ?? null;

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
		baseURL: activeProvider?.config.baseURL ?? "",
		apiKey: activeProvider?.config.apiKey ?? "",
		tokensPerSecond: activeProvider?.config.tokensPerSecond,
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
		rerollFromToken,
	} = useConversationController({
		defaultSystemPrompt,
		ensureChatReady,
	});

	const {
		textContent,
		overwriteTextContent,
		isGenerating: isTextGenerating,
		predict,
		cancel,
		tokenLogprobs: textTokenLogprobs,
		rerollFromToken: rerollTextFromToken,
		seedText: textSeed,
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
		overwriteTextContent("");
	}, [cancel, clearConversation, overwriteTextContent]);

	const handleImportPreparation = useCallback(() => {
		abortActiveStreams();
		cancel();
		resetComposerState();
	}, [abortActiveStreams, cancel, resetComposerState]);

	const isModelSelectionSupported =
		providerKind === "openai-compatible" || providerKind === "dummy";

	const chatSidePanelElement = (
		<SidePanel
			providerKind={providerKind}
			activeTab={chatSidePanelTab}
			onActiveTabChange={setChatSidePanelTab}
			onNodeDoubleClick={(id) => {
				activateThread(id);
				if (isMobile) closeSidePanel();
			}}
			onSetActiveNode={activateThread}
			onDuplicateFromNode={duplicateFromNode}
		/>
	);

	const textSidePanelElement = (
		<SidePanel providerKind={providerKind} tabs={["settings"]} />
	);

	const sidePanelContent =
		view === "chat" ? chatSidePanelElement : textSidePanelElement;

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
						modelSelectorDisabled={!isModelSelectionSupported}
						modelPlaceholder={
							isModelSelectionSupported
								? "Select a model"
								: "Built-in AI (no model list)"
						}
						modelStatus={builtInStatusText}
						view={view}
						onViewChange={setView}
						isSidePanelOpen={isSidePanelOpen}
						onToggleSidePanel={toggleSidePanel}
						onClear={handleClearConversation}
						onImport={triggerImport}
						onExport={triggerExport}
						onOpenSettings={onSettingsOpen}
					/>
					<div className="flex-1 min-h-0 flex">
						<div className="min-w-0 min-h-0 flex-1">
							{view === "chat" ? (
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
									onTokenReroll={rerollFromToken}
								/>
							) : (
								<TextCompletionView
									value={textContent}
									isGenerating={isTextGenerating}
									isPredictDisabled={!isModelSelectionSupported}
									disabledReason={
										!isModelSelectionSupported
											? "Built-in AI supports chat only"
											: undefined
									}
									onChange={(value) => {
										overwriteTextContent(value);
									}}
									onPredict={predict}
									onCancel={cancel}
									tokenLogprobs={textTokenLogprobs}
									onTokenReroll={rerollTextFromToken}
									showTokenOverlay
									generatedPrefix={textSeed}
								/>
							)}
						</div>

						{isSidePanelOpen && !isMobile ? (
							<aside className="shrink-0 w-[420px] lg:w-[520px] min-w-0 min-h-0 overflow-hidden shadow-[-2px_0_8px_rgba(0,0,0,0.04)] dark:shadow-[-2px_0_8px_rgba(0,0,0,0.2)]">
								{sidePanelContent}
							</aside>
						) : null}
					</div>

					{isMobile ? (
						<Drawer
							opened={isSidePanelOpen}
							onClose={closeSidePanel}
							position="right"
							size="sm"
							title="Side Panel"
							styles={{
								content: {
									display: "flex",
									flexDirection: "column",
								},
								body: {
									flex: 1,
									minHeight: 0,
								},
							}}
						>
							{sidePanelContent}
						</Drawer>
					) : null}
					<SettingsModal open={isSettingsOpen} onClose={onSettingsClose} />
					<Toaster />
				</div>
			)}
		</SnapshotIO>
	);
};

export default App;
