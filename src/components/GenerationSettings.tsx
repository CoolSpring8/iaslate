import { NumberInput, Slider, Stack, Switch, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "../state/useSettingsStore";
import type { ProviderKind } from "../types";

interface GenerationSettingsProps {
	providerKind: ProviderKind;
}

interface ControlBlockProps {
	label: string;
	value?: string;
	children: ReactNode;
}

const providerSettings: Record<
	ProviderKind,
	{
		temperature: boolean;
		maxTokens: boolean;
		logprobs: boolean;
	}
> = {
	"openai-compatible": {
		temperature: true,
		maxTokens: true,
		logprobs: true,
	},
	"built-in": {
		temperature: true,
		maxTokens: true,
		logprobs: false,
	},
	dummy: {
		temperature: false,
		maxTokens: false,
		logprobs: true,
	},
};

const formatTemperature = (value: number) =>
	value.toFixed(2).replace(/\.00$/, "");

const ControlBlock = ({ label, value, children }: ControlBlockProps) => (
	<section className="space-y-2">
		<div className="flex items-center justify-between gap-3">
			<Text size="xs" fw={600} className="text-slate-700 dark:text-slate-200">
				{label}
			</Text>
			{value ? (
				<Text
					size="xs"
					className="font-mono tabular-nums text-slate-500 dark:text-slate-400"
				>
					{value}
				</Text>
			) : null}
		</div>
		{children}
	</section>
);

const GenerationSettings = ({ providerKind }: GenerationSettingsProps) => {
	const { generationParams, setGenerationParams } = useSettingsStore(
		useShallow((state) => ({
			generationParams: state.generationParams,
			setGenerationParams: state.setGenerationParams,
		})),
	);

	const availableSettings = providerSettings[providerKind];
	const temperature = generationParams.temperature ?? 0.7;
	const logprobs = generationParams.logprobs ?? true;

	return (
		<div className="p-3">
			<Stack gap="md">
				{availableSettings.temperature ? (
					<ControlBlock
						label="Temperature"
						value={formatTemperature(temperature)}
					>
						<Slider
							value={temperature}
							onChange={(value) => {
								void setGenerationParams({ temperature: value });
							}}
							min={0}
							max={2}
							step={0.05}
							size="xs"
							aria-label="Temperature"
						/>
					</ControlBlock>
				) : null}

				{availableSettings.maxTokens ? (
					<ControlBlock label="Max tokens">
						<NumberInput
							value={generationParams.maxTokens ?? ""}
							onChange={(value) => {
								void setGenerationParams({
									maxTokens: value === "" ? undefined : Number(value),
								});
							}}
							min={1}
							max={32768}
							placeholder="Unlimited"
							size="xs"
							aria-label="Max tokens"
							hideControls
						/>
					</ControlBlock>
				) : null}

				{availableSettings.logprobs ? (
					<div className="flex items-center justify-between gap-3">
						<Text
							size="xs"
							fw={600}
							className="text-slate-700 dark:text-slate-200"
						>
							Logprobs
						</Text>
						<Switch
							checked={logprobs}
							onChange={(event) => {
								void setGenerationParams({
									logprobs: event.currentTarget.checked,
								});
							}}
							size="xs"
							aria-label="Toggle token logprobs"
						/>
					</div>
				) : null}
			</Stack>
		</div>
	);
};

export default GenerationSettings;
