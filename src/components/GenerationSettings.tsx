import { NumberInput, Slider, Stack, Switch, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "../state/useSettingsStore";
import type { ProviderKind } from "../types";

interface GenerationSettingsProps {
	providerKind: ProviderKind;
}

interface ControlBlockProps {
	title: string;
	value?: string;
	description: string;
	children: ReactNode;
}

const providerSettings: Record<
	ProviderKind,
	{
		temperature: boolean;
		maxTokens: boolean;
		logprobs: boolean;
		description: string;
	}
> = {
	"openai-compatible": {
		temperature: true,
		maxTokens: true,
		logprobs: true,
		description: "Chat and text completion controls for the active model.",
	},
	"built-in": {
		temperature: true,
		maxTokens: true,
		logprobs: false,
		description: "Built-in chat supports sampling and length controls.",
	},
	dummy: {
		temperature: false,
		maxTokens: false,
		logprobs: true,
		description: "Dummy streams expose token probabilities for UI checks.",
	},
};

const formatTemperature = (value: number) =>
	value.toFixed(2).replace(/\.00$/, "");

const ControlBlock = ({
	title,
	value,
	description,
	children,
}: ControlBlockProps) => (
	<section className="rounded-md border border-solid border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
		<div className="mb-3 flex items-start justify-between gap-3">
			<div>
				<Text size="sm" fw={600}>
					{title}
				</Text>
				<Text size="xs" c="dimmed">
					{description}
				</Text>
			</div>
			{value ? (
				<Text
					size="xs"
					className="shrink-0 rounded border border-solid border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
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
		<div className="h-full flex flex-col bg-slate-50/50 dark:bg-slate-950/30">
			<div className="px-3 py-3 border-b border-solid border-slate-200 dark:border-slate-800">
				<Title order={5} className="text-slate-800 dark:text-slate-100">
					Generation
				</Title>
				<Text size="xs" c="dimmed">
					{availableSettings.description}
				</Text>
			</div>
			<div className="flex-1 overflow-y-auto px-3 py-3">
				<Stack gap="sm">
					{availableSettings.temperature ? (
						<ControlBlock
							title="Temperature"
							value={formatTemperature(temperature)}
							description="Lower is steadier; higher is more varied."
						>
							<Slider
								value={temperature}
								onChange={(value) => {
									void setGenerationParams({ temperature: value });
								}}
								min={0}
								max={2}
								step={0.05}
								size="sm"
								aria-label="Temperature"
							/>
							<div className="mt-2 flex justify-between text-[11px] leading-none text-slate-500 dark:text-slate-400">
								<span>Focused</span>
								<span>Balanced</span>
								<span>Creative</span>
							</div>
						</ControlBlock>
					) : null}

					{availableSettings.maxTokens ? (
						<ControlBlock
							title="Max tokens"
							value={
								generationParams.maxTokens?.toLocaleString() ?? "Unlimited"
							}
							description="Optional cap for the next generated response."
						>
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
								size="sm"
								aria-label="Max tokens"
								hideControls
							/>
						</ControlBlock>
					) : null}

					{availableSettings.logprobs ? (
						<ControlBlock
							title="Token logprobs"
							description="Collect probabilities for token inspection."
						>
							<div className="flex items-center justify-between gap-3">
								<Text size="sm" c={logprobs ? undefined : "dimmed"}>
									{logprobs ? "Enabled" : "Disabled"}
								</Text>
								<Switch
									checked={logprobs}
									onChange={(event) => {
										void setGenerationParams({
											logprobs: event.currentTarget.checked,
										});
									}}
									size="sm"
									aria-label="Toggle token logprobs"
								/>
							</div>
						</ControlBlock>
					) : null}
				</Stack>
			</div>
		</div>
	);
};

export default GenerationSettings;
