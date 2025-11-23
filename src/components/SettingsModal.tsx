import { builtInAI } from "@built-in-ai/core";
import {
	Button,
	Group,
	Modal,
	PasswordInput,
	Progress,
	Select,
	TextInput,
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

const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
	const {
		baseURL,
		apiKey,
		providerKind,
		builtInAvailability,
		setBuiltInAvailability,
		saveSettings,
		syncModels,
	} = useSettingsStore(
		useShallow((state) => ({
			baseURL: state.baseURL,
			apiKey: state.apiKey,
			providerKind: state.providerKind,
			builtInAvailability: state.builtInAvailability,
			setBuiltInAvailability: state.setBuiltInAvailability,
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
			const model = builtInAI();
			const availability = await model.availability();
			setBuiltInAvailability(availability as BuiltInAvailability);
		} catch (error) {
			console.error(error);
			setBuiltInAvailability("unavailable");
			setDownloadError(
				error instanceof Error
					? error.message
					: "Failed to check built-in model status",
			);
		}
	}, [isDownloading, setBuiltInAvailability]);

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

	return (
		<Modal opened={open} onClose={onClose} title="Settings">
			<form
				onSubmit={handleSubmit(async (values) => {
					await saveSettings(values);
					onClose();
				})}
			>
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
					mb="md"
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
							mt="md"
							label="API Key"
							placeholder="sk-..."
							withAsterisk
							{...register("apiKey", {
								required: selectedProvider === "openai-compatible",
							})}
						/>
					</>
				) : null}
				{selectedProvider === "openai-compatible" && (
					<div className="flex items-center justify-between mt-4">
						<p>Models</p>
						<Button
							onClick={() => {
								void syncModels();
							}}
						>
							Sync from API
						</Button>
					</div>
				)}
				{selectedProvider === "built-in" && (
					<div className="mt-4 space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
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
				<Group justify="flex-end" mt="md">
					<Button type="submit">Save</Button>
				</Group>
			</form>
		</Modal>
	);
};

export default SettingsModal;
