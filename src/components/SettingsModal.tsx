import {
	Button,
	Group,
	Modal,
	PasswordInput,
	Select,
	TextInput,
} from "@mantine/core";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { ProviderKind } from "../types";

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
	onClose: () => void;
	onSave: (values: SettingsFormValues) => Promise<void> | void;
	onSyncModels: () => Promise<void> | void;
}

const SettingsModal = ({
	open,
	baseURL,
	apiKey,
	providerKind,
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

	useEffect(() => {
		if (open) {
			reset({ baseURL, apiKey, providerKind });
		}
	}, [apiKey, baseURL, open, providerKind, reset]);

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
				<Group justify="flex-end" mt="md">
					<Button type="submit">Save</Button>
				</Group>
			</form>
		</Modal>
	);
};

export default SettingsModal;
