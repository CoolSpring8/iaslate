import { builtInAI } from "@built-in-ai/core";
import {
	ActionIcon,
	Button,
	Card,
	Group,
	Modal,
	NavLink,
	NumberInput,
	PasswordInput,
	Progress,
	Select,
	Stack,
	Switch,
	Text,
	TextInput,
	Title,
	UnstyledButton,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import {
	HEATMAP_THEMES,
	type HeatmapTheme,
	useSettingsStore,
} from "../state/useSettingsStore";
import type {
	BuiltInAvailability,
	ProviderEntry,
	ProviderKind,
} from "../types";

interface SettingsFormValues {
	name: string;
	baseURL: string;
	apiKey: string;
	providerKind: ProviderKind;
	tokensPerSecond: number | null;
}

interface SettingsModalProps {
	open: boolean;
	onClose: () => void;
}

type SettingsTab = "general" | "provider" | "display";

const isHeatmapTheme = (value: string): value is HeatmapTheme =>
	HEATMAP_THEMES.includes(value as HeatmapTheme);

const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
	const {
		providers,
		activeProviderId,
		builtInAvailability,
		setBuiltInAvailability,
		refreshBuiltInAvailability,
		addProvider,
		updateProvider,
		removeProvider,
		setActiveProvider,
		syncModels,
		enableBeforeUnloadWarning,
		setEnableBeforeUnloadWarning,
		enableTokenHeatmap,
		setEnableTokenHeatmap,
		heatmapTheme,
		setHeatmapTheme,
		showChatDiagram,
		setShowChatDiagram,
	} = useSettingsStore(
		useShallow((state) => ({
			providers: state.providers,
			activeProviderId: state.activeProviderId,
			builtInAvailability: state.builtInAvailability,
			setBuiltInAvailability: state.setBuiltInAvailability,
			refreshBuiltInAvailability: state.refreshBuiltInAvailability,
			addProvider: state.addProvider,
			updateProvider: state.updateProvider,
			removeProvider: state.removeProvider,
			setActiveProvider: state.setActiveProvider,
			syncModels: state.syncModels,
			enableBeforeUnloadWarning: state.enableBeforeUnloadWarning,
			setEnableBeforeUnloadWarning: state.setEnableBeforeUnloadWarning,
			enableTokenHeatmap: state.enableTokenHeatmap,
			setEnableTokenHeatmap: state.setEnableTokenHeatmap,
			heatmapTheme: state.heatmapTheme,
			setHeatmapTheme: state.setHeatmapTheme,
			showChatDiagram: state.showChatDiagram,
			setShowChatDiagram: state.setShowChatDiagram,
		})),
	);

	const [isAddingProvider, setIsAddingProvider] = useState(false);
	const [editingProviderId, setEditingProviderId] = useState<string | null>(
		null,
	);

	const { register, handleSubmit, reset, watch, setValue } =
		useForm<SettingsFormValues>({
			mode: "onBlur",
			reValidateMode: "onBlur",
			defaultValues: {
				name: "",
				baseURL: "",
				apiKey: "",
				providerKind: "openai-compatible",
				tokensPerSecond: 10,
			},
		});

	const [activeTab, setActiveTab] = useState<SettingsTab>("general");
	const selectedProvider = watch("providerKind");
	const baseURLValue = watch("baseURL");
	const nameValue = watch("name");
	const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
	const [downloadError, setDownloadError] = useState<string | null>(null);
	const [isDownloading, setIsDownloading] = useState(false);
	const [syncingProviderId, setSyncingProviderId] = useState<string | null>(
		null,
	);
	const [isSavingProvider, setIsSavingProvider] = useState(false);
	const [showNameField, setShowNameField] = useState(false);
	const [isNameManuallySet, setIsNameManuallySet] = useState(false);
	const isSavingProviderRef = useRef(false);
	const downloadModelRef = useRef<ReturnType<typeof builtInAI> | null>(null);

	const handleSelectProvider = useCallback(
		(providerId: string) => {
			void setActiveProvider(providerId);
		},
		[setActiveProvider],
	);

	const computeFallbackName = useCallback(
		(kind: ProviderKind, baseURL: string) => {
			switch (kind) {
				case "openai-compatible":
					return baseURL.trim() || "OpenAI-Compatible";
				case "built-in":
					return "Built-in AI";
				case "dummy":
					return "Dummy Provider";
				default:
					return "Unknown Provider";
			}
		},
		[],
	);

	const handleCheckBuiltInAvailability = useCallback(async () => {
		if (isDownloading) {
			return;
		}
		setBuiltInAvailability("unknown");
		setDownloadError(null);
		try {
			await refreshBuiltInAvailability();
		} catch (error) {
			console.error(error);
			setDownloadError(
				error instanceof Error
					? error.message
					: "Failed to check built-in model status",
			);
		}
	}, [isDownloading, refreshBuiltInAvailability, setBuiltInAvailability]);

	const handleDownloadModel = useCallback(async () => {
		if (
			isDownloading ||
			builtInAvailability === "available" ||
			builtInAvailability === "unavailable" ||
			builtInAvailability === "downloading"
		) {
			return;
		}
		setIsDownloading(true);
		setDownloadError(null);
		setDownloadProgress(0);
		const model = builtInAI();
		downloadModelRef.current = model;
		try {
			const availability = (await model.availability()) as BuiltInAvailability;
			switch (availability) {
				case "unavailable": {
					setBuiltInAvailability("unavailable");
					setDownloadError("Browser does not support built-in AI");
					return;
				}
				case "downloading": {
					setBuiltInAvailability("downloading");
					return;
				}
				case "available": {
					setBuiltInAvailability("available");
					return;
				}
				case "downloadable": {
					await model.createSessionWithProgress((progress) => {
						setDownloadProgress(progress);
					});
					setBuiltInAvailability("available");
					return;
				}
				default: {
					setBuiltInAvailability("unavailable");
				}
			}
		} catch (error) {
			console.error(error);
			setDownloadError(
				error instanceof Error
					? error.message
					: "Failed to download built-in model",
			);
			setBuiltInAvailability("downloadable");
		} finally {
			downloadModelRef.current = null;
			setIsDownloading(false);
			setDownloadProgress(null);
		}
	}, [builtInAvailability, isDownloading, setBuiltInAvailability]);

	const builtInStatusLabel = useMemo(() => {
		switch (builtInAvailability) {
			case "available":
				return "Available";
			case "downloadable":
				return "Download required";
			case "downloading":
				return "Downloading...";
			case "unavailable":
				return "Unavailable";
			default:
				return "Unknown";
		}
	}, [builtInAvailability]);

	useEffect(() => {
		if (!open) {
			downloadModelRef.current = null;
			setIsDownloading(false);
			setDownloadProgress(null);
			setDownloadError(null);
			setActiveTab("general");
			setIsAddingProvider(false);
			setEditingProviderId(null);
			setShowNameField(false);
			setIsNameManuallySet(false);
			reset(undefined, { keepDirty: false, keepTouched: false });
		}
	}, [open, reset]);

	useEffect(() => {
		if (
			open &&
			selectedProvider === "built-in" &&
			builtInAvailability === "unknown"
		) {
			void handleCheckBuiltInAvailability();
		}
	}, [
		builtInAvailability,
		handleCheckBuiltInAvailability,
		open,
		selectedProvider,
	]);

	// Keep name in sync with provider kind/base unless user explicitly edits it
	useEffect(() => {
		if (selectedProvider !== "openai-compatible" || isNameManuallySet) {
			return;
		}
		const fallbackName = computeFallbackName("openai-compatible", baseURLValue);
		if (nameValue !== fallbackName) {
			setValue("name", fallbackName, {
				shouldDirty: true,
				shouldTouch: true,
			});
		}
	}, [
		baseURLValue,
		computeFallbackName,
		isNameManuallySet,
		nameValue,
		selectedProvider,
		setValue,
	]);

	useEffect(() => {
		if (selectedProvider !== "built-in" || isNameManuallySet) {
			return;
		}
		const fallbackName = computeFallbackName("built-in", "");
		if (nameValue !== fallbackName) {
			setValue("name", fallbackName, {
				shouldDirty: true,
				shouldTouch: true,
			});
		}
	}, [
		computeFallbackName,
		isNameManuallySet,
		nameValue,
		selectedProvider,
		setValue,
	]);

	useEffect(() => {
		if (builtInAvailability === "available") {
			setDownloadError(null);
		}
	}, [builtInAvailability]);

	const handleSaveProvider = useCallback(
		async (values: SettingsFormValues) => {
			if (isSavingProviderRef.current) {
				return;
			}
			isSavingProviderRef.current = true;
			setIsSavingProvider(true);
			try {
				const trimmedName = values.name.trim();
				const fallbackName =
					trimmedName ||
					computeFallbackName(values.providerKind, values.baseURL);
				const resolvedTokensPerSecond =
					values.tokensPerSecond && values.tokensPerSecond > 0
						? values.tokensPerSecond
						: 10;
				let config: ProviderEntry["config"] = {};
				if (values.providerKind === "openai-compatible") {
					config = { baseURL: values.baseURL, apiKey: values.apiKey };
				} else if (values.providerKind === "dummy") {
					config = { tokensPerSecond: resolvedTokensPerSecond };
				}

				if (editingProviderId) {
					await updateProvider(editingProviderId, {
						name: fallbackName,
						kind: values.providerKind,
						config,
					});
				} else {
					await addProvider({
						name: fallbackName,
						kind: values.providerKind,
						config,
					});
				}
				setIsAddingProvider(false);
				setEditingProviderId(null);
				setIsNameManuallySet(false);
				setShowNameField(false);
				reset();
				toast.success("Settings saved", { id: "settings-save" });
			} finally {
				isSavingProviderRef.current = false;
				setIsSavingProvider(false);
			}
		},
		[
			addProvider,
			computeFallbackName,
			editingProviderId,
			reset,
			updateProvider,
		],
	);

	const startEditing = (providerId: string) => {
		const provider = providers.find((p) => p.id === providerId);
		if (provider) {
			const fallbackName = computeFallbackName(
				provider.kind,
				provider.config.baseURL || "",
			);
			const hasCustomName = provider.name.trim() !== fallbackName;
			reset(
				{
					name: provider.name,
					providerKind: provider.kind,
					baseURL: provider.config.baseURL || "",
					apiKey: provider.config.apiKey || "",
					tokensPerSecond: provider.config.tokensPerSecond ?? 10,
				},
				{ keepDirty: false, keepTouched: false },
			);
			setIsNameManuallySet(hasCustomName);
			setShowNameField(hasCustomName);
			setEditingProviderId(providerId);
			setIsAddingProvider(true);
		}
	};

	const renderGeneralTab = () => (
		<Stack gap="md">
			<Title order={4}>General Settings</Title>
			<Card withBorder padding="md" radius="md">
				<Group justify="space-between" align="flex-start">
					<div>
						<Text size="sm" fw={500}>
							Warn before leaving
						</Text>
						<Text size="sm" c="dimmed">
							Show a confirmation dialog if you try to close or refresh while
							there are unsent messages or active generations.
						</Text>
					</div>
					<Switch
						checked={enableBeforeUnloadWarning}
						onChange={(event) => {
							void setEnableBeforeUnloadWarning(event.currentTarget.checked);
						}}
						size="md"
						aria-label="Toggle beforeunload warning"
					/>
				</Group>
			</Card>
		</Stack>
	);

	const renderDisplayTab = () => (
		<Stack gap="md">
			<Title order={4}>Display Settings</Title>
			<Card withBorder padding="md" radius="md">
				<Group justify="space-between" align="flex-start">
					<div>
						<Text size="sm" fw={500}>
							Show diagram in chat
						</Text>
						<Text size="sm" c="dimmed">
							Display the thread diagram next to the linear chat view.
						</Text>
					</div>
					<Switch
						checked={showChatDiagram}
						onChange={(event) => {
							void setShowChatDiagram(event.currentTarget.checked);
						}}
						size="md"
						aria-label="Toggle chat diagram"
					/>
				</Group>
			</Card>
			<Card withBorder padding="md" radius="md">
				<Group justify="space-between" align="flex-start">
					<div>
						<Text size="sm" fw={500}>
							Token Probability Heatmap
						</Text>
						<Text size="sm" c="dimmed">
							Colorize tokens based on their probability. Low probability tokens
							will appear redder.
						</Text>
					</div>
					<Switch
						checked={enableTokenHeatmap}
						onChange={(event) => {
							void setEnableTokenHeatmap(event.currentTarget.checked);
						}}
						size="md"
						aria-label="Toggle token heatmap"
					/>
				</Group>
				{enableTokenHeatmap && (
					<Select
						label="Heatmap Theme"
						description="Choose a color scheme for the token probability heatmap."
						data={[
							{
								label: "Traffic Light (Green/Yellow/Red)",
								value: "traffic-light",
							},
							{ label: "Monochrome Red", value: "monochrome-red" },
							{ label: "Monochrome Blue", value: "monochrome-blue" },
						]}
						value={heatmapTheme}
						onChange={(value) => {
							if (value && isHeatmapTheme(value)) {
								void setHeatmapTheme(value);
							}
						}}
						allowDeselect={false}
						mt="md"
					/>
				)}
			</Card>
		</Stack>
	);

	const renderProviderForm = () => {
		const hasBuiltIn = providers.some((p) => p.kind === "built-in");
		const isEditingBuiltIn =
			editingProviderId &&
			providers.find((p) => p.id === editingProviderId)?.kind === "built-in";

		return (
			<Stack gap="md">
				<Select
					label="Provider Type"
					data={[
						{ label: "OpenAI-Compatible", value: "openai-compatible" },
						{
							label: "Built-in AI (Chrome/Edge)",
							value: "built-in",
							disabled: hasBuiltIn && !isEditingBuiltIn,
						},
						{ label: "Dummy Provider", value: "dummy" },
					]}
					value={selectedProvider}
					onChange={(value) => {
						if (value) {
							if (value === "built-in" || value === "dummy") {
								setIsNameManuallySet(false);
								setShowNameField(false);
								setValue(
									"name",
									computeFallbackName(value as ProviderKind, ""),
									{
										shouldDirty: true,
										shouldTouch: true,
									},
								);
							}
							setValue("providerKind", value as ProviderKind, {
								shouldDirty: true,
								shouldTouch: true,
								shouldValidate: true,
							});
						}
					}}
					withAsterisk
				/>
				{selectedProvider === "openai-compatible" ? (
					<>
						<TextInput
							label="OpenAI-Compatible API Base"
							placeholder="https://.../v1"
							type="url"
							{...register("baseURL", {
								required: selectedProvider === "openai-compatible",
							})}
						/>
						<PasswordInput
							label="API Key (optional)"
							placeholder="sk-..."
							{...register("apiKey", {
								required: false,
							})}
						/>
					</>
				) : null}
				{selectedProvider === "built-in" && (
					<div className="mt-2 space-y-2 rounded border border-solid border-slate-200 bg-slate-50 p-3">
						<p className="text-sm text-slate-600">
							Model status:{" "}
							<span className="font-semibold">{builtInStatusLabel}</span>
						</p>
						<Group gap="xs">
							<Button
								onClick={() => {
									void handleDownloadModel();
								}}
								loading={isDownloading}
								disabled={
									isDownloading || builtInAvailability !== "downloadable"
								}
							>
								{builtInAvailability === "available"
									? "Model downloaded"
									: builtInAvailability === "downloading"
										? "Downloading..."
										: "Download model"}
							</Button>
						</Group>
						{isDownloading ? (
							<Progress
								value={(downloadProgress ?? 0) * 100}
								size="sm"
								radius="xl"
							/>
						) : null}
						{downloadError ? (
							<p className="text-sm text-red-600">{downloadError}</p>
						) : null}
					</div>
				)}
				{selectedProvider === "dummy" && (
					<NumberInput
						label="Tokens per Second"
						description="Speed of token generation"
						min={1}
						max={100}
						value={watch("tokensPerSecond") ?? ""}
						onChange={(value) => {
							if (value === "" || value === null) {
								setValue("tokensPerSecond", null, {
									shouldDirty: true,
									shouldTouch: true,
								});
								return;
							}
							setValue("tokensPerSecond", Number(value), {
								shouldDirty: true,
								shouldTouch: true,
							});
						}}
					/>
				)}
				<UnstyledButton
					className="flex items-center gap-2 text-xs font-medium text-slate-600"
					onClick={() => setShowNameField((prev) => !prev)}
					aria-expanded={showNameField}
					aria-controls="provider-name-field"
					type="button"
				>
					<span
						className={
							showNameField
								? `i-lucide-chevron-down w-4 h-4`
								: `i-lucide-chevron-right w-4 h-4`
						}
						aria-hidden="true"
					/>
					<span>Advanced Configurations</span>
				</UnstyledButton>
				{showNameField ? (
					<TextInput
						id="provider-name-field"
						label="Name"
						placeholder="My Provider"
						{...register("name", {
							required: false,
							onChange: () => setIsNameManuallySet(true),
						})}
					/>
				) : null}
				<Group justify="flex-end" mt="md">
					<Button
						variant="subtle"
						onClick={() => {
							setIsAddingProvider(false);
							setEditingProviderId(null);
							reset();
						}}
						disabled={isSavingProvider}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit(handleSaveProvider)}
						loading={isSavingProvider}
						disabled={isSavingProvider}
					>
						{editingProviderId ? "Update" : "Add"}
					</Button>
				</Group>
			</Stack>
		);
	};

	const renderProviderList = () => (
		<Stack gap="md">
			<Group justify="space-between">
				<Title order={4}>AI Providers</Title>
				<Button
					size="xs"
					onClick={() => {
						reset({
							name: "",
							baseURL: "",
							apiKey: "",
							providerKind: "openai-compatible",
							tokensPerSecond: 10,
						});
						setIsNameManuallySet(false);
						setShowNameField(false);
						setIsAddingProvider(true);
					}}
				>
					Add Provider
				</Button>
			</Group>
			{providers.length === 0 ? (
				<Text c="dimmed" size="sm" ta="center" py="xl">
					No providers added yet.
				</Text>
			) : (
				<Stack gap="sm">
					{providers.map((provider) => (
						<Card
							key={provider.id}
							withBorder
							padding="sm"
							radius="md"
							className={
								activeProviderId === provider.id
									? "border-blue-500 bg-blue-50/50 cursor-pointer"
									: "cursor-pointer"
							}
							onClick={() => handleSelectProvider(provider.id)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									handleSelectProvider(provider.id);
								}
							}}
							role="button"
							tabIndex={0}
						>
							<Group justify="space-between" align="center">
								<Group gap="sm">
									<ActionIcon
										variant={
											activeProviderId === provider.id ? "filled" : "default"
										}
										color={activeProviderId === provider.id ? "blue" : "gray"}
										radius="xl"
										size="sm"
										onClick={(event) => {
											event.stopPropagation();
											void setActiveProvider(provider.id);
										}}
										aria-label={
											activeProviderId === provider.id
												? "Active provider"
												: "Set as active"
										}
									>
										<span className="i-lucide-check w-3 h-3" />
									</ActionIcon>
									<div>
										<Group gap="xs" className="max-w-[14rem] truncate">
											<Text size="sm" fw={500} lineClamp={1}>
												{provider.name}
											</Text>
										</Group>
										<Text size="xs" c="dimmed">
											{provider.kind === "openai-compatible"
												? "OpenAI Compatible"
												: provider.kind === "dummy"
													? "Dummy Provider"
													: "Built-in AI"}
										</Text>
									</div>
								</Group>
								<Group gap="xs">
									{activeProviderId === provider.id &&
										provider.kind === "openai-compatible" && (
											<ActionIcon
												variant="light"
												color="blue"
												size="sm"
												disabled={Boolean(syncingProviderId)}
												onClick={async (event) => {
													event.stopPropagation();
													if (syncingProviderId) {
														return;
													}
													setSyncingProviderId(provider.id);
													try {
														await syncModels();
													} finally {
														setSyncingProviderId(null);
													}
												}}
												title="Sync Models"
											>
												<span
													className={`i-lucide-refresh-cw w-3 h-3 ${syncingProviderId === provider.id ? "animate-spin" : ""}`}
												/>
											</ActionIcon>
										)}
									<ActionIcon
										variant="subtle"
										color="gray"
										size="sm"
										onClick={(event) => {
											event.stopPropagation();
											startEditing(provider.id);
										}}
									>
										<span className="i-lucide-pencil w-3 h-3" />
									</ActionIcon>
									<ActionIcon
										variant="subtle"
										color="red"
										size="sm"
										onClick={async (event) => {
											event.stopPropagation();
											const confirmMessage = `Remove provider "${provider.name}"${
												activeProviderId === provider.id
													? "? This may switch the active provider."
													: "?"
											}`;
											if (!window.confirm(confirmMessage)) {
												return;
											}
											await removeProvider(provider.id);
										}}
									>
										<span className="i-lucide-trash w-3 h-3" />
									</ActionIcon>
								</Group>
							</Group>
						</Card>
					))}
				</Stack>
			)}
		</Stack>
	);

	return (
		<Modal
			opened={open}
			onClose={onClose}
			title="Settings"
			size="lg"
			styles={{
				body: { height: "500px", display: "flex", padding: 0 },
			}}
		>
			<div className="flex flex-1 h-full w-full">
				{/* Sidebar */}
				<div className="w-48 border-r border-solid border-gray-200 bg-gray-50 p-2 flex flex-col gap-1">
					<NavLink
						label="General"
						leftSection={
							<span className="i-lucide-sliders-horizontal w-4 h-4" />
						}
						active={activeTab === "general"}
						onClick={() => setActiveTab("general")}
						variant="light"
						className="rounded-md"
					/>
					<NavLink
						label="Display"
						leftSection={<span className="i-lucide-monitor w-4 h-4" />}
						active={activeTab === "display"}
						onClick={() => setActiveTab("display")}
						variant="light"
						className="rounded-md"
					/>
					<NavLink
						label="Provider"
						leftSection={<span className="i-lucide-cloud w-4 h-4" />}
						active={activeTab === "provider"}
						onClick={() => setActiveTab("provider")}
						variant="light"
						className="rounded-md"
					/>
				</div>

				{/* Content */}
				<div className="flex-1 flex flex-col">
					<div className="flex-1 p-4 overflow-y-auto">
						{activeTab === "general" && renderGeneralTab()}
						{activeTab === "display" && renderDisplayTab()}
						{activeTab === "provider" &&
							(isAddingProvider ? renderProviderForm() : renderProviderList())}
					</div>
				</div>
			</div>
		</Modal>
	);
};

export default SettingsModal;
