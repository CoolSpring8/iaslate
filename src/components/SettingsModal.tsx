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
import type { BuiltInAvailability, ProviderKind } from "../types";

interface SettingsFormValues {
	baseURL: string;
	apiKey: string;
	providerKind: ProviderKind;
}

interface SettingsModalProps {
	open: boolean;
	baseURL: string;
	apiKey: string;
	providerKind: ProviderKind;
	builtInAvailability: BuiltInAvailability;
	onBuiltInAvailabilityChange: (availability: BuiltInAvailability) => void;
	onClose: () => void;
	onSave: (values: SettingsFormValues) => Promise<void> | void;
	onSyncModels: () => Promise<void> | void;
}

const SettingsModal = ({
	open,
	baseURL,
	apiKey,
	providerKind,
	builtInAvailability,
	onBuiltInAvailabilityChange,
	onClose,
	onSave,
	onSyncModels,
}: SettingsModalProps) => {
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

	const normalizeAvailability = useCallback(
		(availability: string | undefined): BuiltInAvailability => {
			if (availability === "available") {
				return "available";
			}
			if (availability === "downloading") {
				return "downloading";
			}
			if (
				availability === "downloadable" ||
				availability === "available-after-download"
			) {
				return "downloadable";
			}
			return "unavailable";
		},
		[],
	);

	const handleCheckBuiltInAvailability = useCallback(async () => {
		if (isDownloading) {
			return;
		}
		onBuiltInAvailabilityChange("unknown");
		setDownloadError(null);
		try {
			const model = builtInAI();
			const availability = await model.availability();
			onBuiltInAvailabilityChange(normalizeAvailability(availability));
		} catch (error) {
			console.error(error);
			onBuiltInAvailabilityChange("unavailable");
			setDownloadError(
				error instanceof Error
					? error.message
					: "Failed to check built-in model status",
			);
		}
	}, [isDownloading, normalizeAvailability, onBuiltInAvailabilityChange]);

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
			const availability = normalizeAvailability(await model.availability());
			switch (availability) {
				case "unavailable": {
					onBuiltInAvailabilityChange("unavailable");
					setDownloadError("Browser does not support built-in AI");
					return;
				}
				case "downloading": {
					onBuiltInAvailabilityChange("downloading");
					return;
				}
				case "available": {
					onBuiltInAvailabilityChange("available");
					return;
				}
				case "downloadable": {
					await model.createSessionWithProgress((progress) => {
						setDownloadProgress(progress);
					});
					onBuiltInAvailabilityChange("available");
					return;
				}
				default: {
					onBuiltInAvailabilityChange("unavailable");
				}
			}
		} catch (error) {
			console.error(error);
			setDownloadError(
				error instanceof Error
					? error.message
					: "Failed to download built-in model",
			);
			onBuiltInAvailabilityChange("downloadable");
		} finally {
			downloadModelRef.current = null;
			setIsDownloading(false);
			setDownloadProgress(null);
		}
	}, [
		builtInAvailability,
		isDownloading,
		normalizeAvailability,
		onBuiltInAvailabilityChange,
	]);

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
		if (open && builtInAvailability === "unknown") {
			void handleCheckBuiltInAvailability();
		}
	}, [builtInAvailability, handleCheckBuiltInAvailability, open]);

	useEffect(() => {
		if (open && selectedProvider === "built-in") {
			void handleCheckBuiltInAvailability();
		}
	}, [handleCheckBuiltInAvailability, open, selectedProvider]);

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
					await onSave(values);
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
								void onSyncModels();
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
