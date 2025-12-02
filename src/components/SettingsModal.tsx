import { builtInAI } from "@built-in-ai/core";
import {
	Button,
	Group,
	Modal,
	NavLink,
	PasswordInput,
	Progress,
	Select,
	Stack,
	Text,
	TextInput,
	Title,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "../state/useSettingsStore";
import type { BuiltInAvailability, ProviderKind } from "../types";

interface SettingsFormValues {
	baseURL: string;
	apiKey: string;
	providerKind: ProviderKind;
}

interface SettingsModalProps {
	open: boolean;
	onClose: () => void;
}

type SettingsTab = "general" | "provider";

const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
	const {
		baseURL,
		apiKey,
		providerKind,
		builtInAvailability,
		setBuiltInAvailability,
		refreshBuiltInAvailability,
		saveSettings,
		syncModels,
	} = useSettingsStore(
		useShallow((state) => ({
			baseURL: state.baseURL,
			apiKey: state.apiKey,
			providerKind: state.providerKind,
			builtInAvailability: state.builtInAvailability,
			setBuiltInAvailability: state.setBuiltInAvailability,
			refreshBuiltInAvailability: state.refreshBuiltInAvailability,
			saveSettings: state.saveSettings,
			syncModels: state.syncModels,
		})),
	);
	const { register, handleSubmit, reset, watch, setValue } =
		useForm<SettingsFormValues>({
			defaultValues: {
				baseURL,
				apiKey,
				providerKind,
			},
		});

	const [activeTab, setActiveTab] = useState<SettingsTab>("general");
	const selectedProvider = watch("providerKind");
	const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
	const [downloadError, setDownloadError] = useState<string | null>(null);
	const [isDownloading, setIsDownloading] = useState(false);
	const downloadModelRef = useRef<ReturnType<typeof builtInAI> | null>(null);

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
		}
	}, [open]);

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

	useEffect(() => {
		if (open) {
			reset({ baseURL, apiKey, providerKind });
		}
	}, [apiKey, baseURL, open, providerKind, reset]);

	useEffect(() => {
		if (builtInAvailability === "available") {
			setDownloadError(null);
		}
	}, [builtInAvailability]);

	const renderGeneralTab = () => (
		<Stack gap="md">
			<Title order={4}>General Settings</Title>
			<Text c="dimmed" size="sm">
				General application settings will appear here.
			</Text>
		</Stack>
	);

	const renderProviderTab = () => (
		<Stack gap="md">
			<Title order={4}>AI Provider</Title>
			<Select
				label="Provider"
				data={[
					{ label: "OpenAI-Compatible", value: "openai-compatible" },
					{ label: "Built-in AI (Chrome/Edge)", value: "built-in" },
				]}
				value={selectedProvider}
				onChange={(value) => {
					if (value) {
						setValue("providerKind", value as ProviderKind);
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
						label="API Key"
						placeholder="sk-..."
						withAsterisk
						{...register("apiKey", {
							required: selectedProvider === "openai-compatible",
						})}
					/>
					<div className="flex items-center justify-between mt-2">
						<Text size="sm">Models</Text>
						<Button
							variant="light"
							size="xs"
							onClick={() => {
								void syncModels();
							}}
						>
							Sync from API
						</Button>
					</div>
				</>
			) : null}
			{selectedProvider === "built-in" && (
				<div className="mt-2 space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
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
							disabled={isDownloading || builtInAvailability !== "downloadable"}
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
			<form
				onSubmit={handleSubmit(async (values) => {
					await saveSettings(values);
					onClose();
				})}
				className="flex flex-1 h-full"
			>
				{/* Sidebar */}
				<div className="w-48 border-r border-gray-200 bg-gray-50 p-2 flex flex-col gap-1">
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
						{activeTab === "provider" && renderProviderTab()}
					</div>
					<div className="p-4 border-t border-gray-200 bg-white flex justify-end">
						<Button type="submit">Save Changes</Button>
					</div>
				</div>
			</form>
		</Modal>
	);
};

export default SettingsModal;
