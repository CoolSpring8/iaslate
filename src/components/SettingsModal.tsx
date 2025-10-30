import { Button, Group, Input, Modal, UnstyledButton } from "@mantine/core";
import { useEffect, useState } from "react";
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
	const [isVisible, setIsVisible] = useState(false);

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
				<Input
					{...register("baseURL", { required: true })}
					// In Mantine, use "rightSection" instead of "endContent"
					rightSection={
						<div className="i-lucide-server text-lg text-default-400 pointer-events-none flex-shrink-0" />
					}
					label="OpenAI-Compatible API Base"
					placeholder="https://.../v1"
					type="url"
				/>
				<Input
					{...register("apiKey", { required: true })}
					rightSection={
						<UnstyledButton
							className="focus:outline-none"
							type="button"
							onClick={() => setIsVisible((value) => !value)}
						>
							{isVisible ? (
								<div className="i-lucide-eye text-lg text-default-400 pointer-events-none" />
							) : (
								<div className="i-lucide-eye-off text-lg text-default-400 pointer-events-none" />
							)}
						</UnstyledButton>
					}
					label="API Key"
					placeholder="sk-..."
					type={isVisible ? "text" : "password"}
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
