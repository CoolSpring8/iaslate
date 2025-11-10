import { Button, Group, Modal, PasswordInput, TextInput } from "@mantine/core";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

interface SettingsFormValues {
	baseURL: string;
	apiKey: string;
}

interface SettingsModalProps {
	open: boolean;
	baseURL: string;
	apiKey: string;
	onClose: () => void;
	onSave: (values: SettingsFormValues) => Promise<void> | void;
	onSyncModels: () => Promise<void> | void;
}

const SettingsModal = ({
	open,
	baseURL,
	apiKey,
	onClose,
	onSave,
	onSyncModels,
}: SettingsModalProps) => {
	const { register, handleSubmit, reset } = useForm<SettingsFormValues>({
		defaultValues: {
			baseURL,
			apiKey,
		},
	});
	useEffect(() => {
		if (open) {
			reset({ baseURL, apiKey });
		}
	}, [apiKey, baseURL, open, reset]);

	return (
		<Modal opened={open} onClose={onClose} title="Settings">
			<form
				onSubmit={handleSubmit(async (values) => {
					await onSave(values);
				})}
			>
				<TextInput
					label="OpenAI-Compatible API Base"
					placeholder="https://.../v1"
					type="url"
					{...register("baseURL", { required: true })}
				/>
				<PasswordInput
					mt="md"
					label="API Key"
					placeholder="sk-..."
					withAsterisk
					{...register("apiKey", { required: true })}
				/>
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
				<Group justify="flex-end" mt="md">
					<Button type="submit">Save</Button>
				</Group>
			</form>
		</Modal>
	);
};

export default SettingsModal;
