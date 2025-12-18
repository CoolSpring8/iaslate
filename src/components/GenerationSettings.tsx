import { NumberInput, Slider, Stack, Switch, Text, Title } from "@mantine/core";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "../state/useSettingsStore";
import type { ProviderKind } from "../types";

interface GenerationSettingsProps {
	providerKind: ProviderKind;
}

const GenerationSettings = ({ providerKind }: GenerationSettingsProps) => {
	const { generationParams, setGenerationParams } = useSettingsStore(
		useShallow((state) => ({
			generationParams: state.generationParams,
			setGenerationParams: state.setGenerationParams,
		})),
	);

	const availableSettings = useMemo(() => {
		switch (providerKind) {
			case "openai-compatible":
				return {
					temperature: true,
					topP: true,
					minP: true,
					topK: true,
					repetitionPenalty: true,
					maxTokens: true,
					logprobs: true,
				};
			case "built-in":
				return {
					temperature: true,
					topP: false,
					minP: false,
					topK: true,
					repetitionPenalty: false,
					maxTokens: true,
					logprobs: false,
				};
			case "dummy":
				return {
					temperature: false,
					topP: false,
					minP: false,
					topK: false,
					repetitionPenalty: false,
					maxTokens: false,
					logprobs: true,
				};
			default:
				return {
					temperature: true,
					topP: true,
					minP: false,
					topK: false,
					repetitionPenalty: false,
					maxTokens: true,
					logprobs: true,
				};
		}
	}, [providerKind]);

	return (
		<div className="h-full flex flex-col">
			<div className="px-3 py-2 border-b border-solid border-slate-200 dark:border-slate-700">
				<Title order={5} className="text-slate-700 dark:text-slate-200">
					Generation Settings
				</Title>
				<Text size="xs" c="dimmed">
					Adjust parameters for message generation
				</Text>
			</div>
			<div className="flex-1 overflow-y-auto px-3 py-3">
				<Stack gap="lg">
					{availableSettings.temperature && (
						<div>
							<div className="flex items-center justify-between mb-2">
								<Text size="sm" fw={500}>
									Temperature
								</Text>
								<Text size="xs" c="dimmed">
									{generationParams.temperature ?? 0.7}
								</Text>
							</div>
							<Slider
								value={generationParams.temperature ?? 0.7}
								onChange={(value) => {
									void setGenerationParams({ temperature: value });
								}}
								min={0}
								max={2}
								step={0.05}
								marks={[
									{ value: 0, label: "0" },
									{ value: 1, label: "1" },
									{ value: 2, label: "2" },
								]}
								size="sm"
							/>
							<Text size="xs" c="dimmed" mt="xs">
								Lower = more focused, higher = more creative
							</Text>
						</div>
					)}

					{availableSettings.topP && (
						<div>
							<div className="flex items-center justify-between mb-2">
								<Text size="sm" fw={500}>
									Top-P (Nucleus Sampling)
								</Text>
								<Text size="xs" c="dimmed">
									{generationParams.topP ?? 1}
								</Text>
							</div>
							<Slider
								value={generationParams.topP ?? 1}
								onChange={(value) => {
									void setGenerationParams({ topP: value });
								}}
								min={0}
								max={1}
								step={0.05}
								marks={[
									{ value: 0, label: "0" },
									{ value: 0.5, label: "0.5" },
									{ value: 1, label: "1" },
								]}
								size="sm"
							/>
							<Text size="xs" c="dimmed" mt="xs">
								Cumulative probability cutoff for token selection
							</Text>
						</div>
					)}

					{availableSettings.minP && (
						<div>
							<div className="flex items-center justify-between mb-2">
								<Text size="sm" fw={500}>
									Min-P
								</Text>
								<Text size="xs" c="dimmed">
									{generationParams.minP ?? 0}
								</Text>
							</div>
							<Slider
								value={generationParams.minP ?? 0}
								onChange={(value) => {
									void setGenerationParams({ minP: value });
								}}
								min={0}
								max={1}
								step={0.01}
								size="sm"
							/>
							<Text size="xs" c="dimmed" mt="xs">
								Minimum probability threshold (relative to top token)
							</Text>
						</div>
					)}

					{availableSettings.topK && (
						<div>
							<div className="flex items-center justify-between mb-2">
								<Text size="sm" fw={500}>
									Top-K
								</Text>
								<Text size="xs" c="dimmed">
									{generationParams.topK ?? "off"}
								</Text>
							</div>
							<NumberInput
								value={generationParams.topK ?? ""}
								onChange={(value) => {
									void setGenerationParams({
										topK: value === "" ? undefined : Number(value),
									});
								}}
								min={1}
								max={100}
								placeholder="Off (no limit)"
								size="xs"
							/>
							<Text size="xs" c="dimmed" mt="xs">
								Number of top tokens to consider
							</Text>
						</div>
					)}

					{availableSettings.repetitionPenalty && (
						<div>
							<div className="flex items-center justify-between mb-2">
								<Text size="sm" fw={500}>
									Repetition Penalty
								</Text>
								<Text size="xs" c="dimmed">
									{generationParams.repetitionPenalty ?? 1}
								</Text>
							</div>
							<Slider
								value={generationParams.repetitionPenalty ?? 1}
								onChange={(value) => {
									void setGenerationParams({ repetitionPenalty: value });
								}}
								min={1}
								max={2}
								step={0.05}
								marks={[
									{ value: 1, label: "1" },
									{ value: 1.5, label: "1.5" },
									{ value: 2, label: "2" },
								]}
								size="sm"
							/>
							<Text size="xs" c="dimmed" mt="xs">
								Penalizes repeated tokens (1 = no penalty)
							</Text>
						</div>
					)}

					{availableSettings.maxTokens && (
						<div>
							<Text size="sm" fw={500} mb="xs">
								Max Tokens
							</Text>
							<NumberInput
								value={generationParams.maxTokens ?? ""}
								onChange={(value) => {
									void setGenerationParams({
										maxTokens: value === "" ? undefined : Number(value),
									});
								}}
								min={1}
								max={32768}
								placeholder="No limit"
								size="xs"
							/>
							<Text size="xs" c="dimmed" mt="xs">
								Maximum tokens to generate (blank = no limit)
							</Text>
						</div>
					)}

					{availableSettings.logprobs && (
						<div className="flex items-center justify-between">
							<div>
								<Text size="sm" fw={500}>
									Token Logprobs
								</Text>
								<Text size="xs" c="dimmed">
									Enable token probability inspection
								</Text>
							</div>
							<Switch
								checked={generationParams.logprobs ?? true}
								onChange={(event) => {
									void setGenerationParams({
										logprobs: event.currentTarget.checked,
									});
								}}
								size="sm"
							/>
						</div>
					)}
				</Stack>
			</div>
		</div>
	);
};

export default GenerationSettings;
