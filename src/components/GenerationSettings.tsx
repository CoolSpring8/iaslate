import { NumberInput, Slider, Stack, Switch, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
	MAX_GENERATION_MAX_TOKENS,
	MIN_GENERATION_MAX_TOKENS,
	useSettingsStore,
} from "../state/useSettingsStore";
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
		maxTokens: false,
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

const normalizeMaxTokensInput = (value: string | number) => {
	if (value === "") {
		return undefined;
	}
	const numericValue = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numericValue)) {
		return null;
	}
	return Math.min(
		MAX_GENERATION_MAX_TOKENS,
		Math.max(MIN_GENERATION_MAX_TOKENS, Math.trunc(numericValue)),
	);
};

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
								const maxTokens = normalizeMaxTokensInput(value);
								if (maxTokens === null) {
									return;
								}
								void setGenerationParams({
									maxTokens,
								});
							}}
							min={MIN_GENERATION_MAX_TOKENS}
							max={MAX_GENERATION_MAX_TOKENS}
							placeholder="Unlimited"
							size="xs"
							aria-label="Max tokens"
							allowDecimal={false}
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
