import { Button, Textarea } from "@mantine/core";
import type { TokenAlternative, TokenLogprob } from "../types";
import TokenChips from "./TokenChips";

interface TextCompletionViewProps {
	value: string;
	isGenerating: boolean;
	isPredictDisabled?: boolean;
	disabledReason?: string;
	onChange: (value: string) => void;
	onPredict: () => void;
	onCancel: () => void;
	tokenLogprobs?: TokenLogprob[];
	onTokenReroll?: (tokenIndex: number, alternative: TokenAlternative) => void;
}

const TextCompletionView = ({
	value,
	isGenerating,
	isPredictDisabled = false,
	disabledReason,
	onChange,
	onPredict,
	onCancel,
	tokenLogprobs,
	onTokenReroll,
}: TextCompletionViewProps) => (
	<div className="flex flex-1 min-h-0 flex-col gap-6 px-6 py-4">
		<div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-slate-50/90 p-4 backdrop-blur dark:bg-slate-900/40">
			<Textarea
				size="lg"
				value={value}
				onChange={(event) => {
					onChange(event.target.value);
				}}
				placeholder="Provide a seed paragraph and let the model continue it…"
				classNames={{
					root: "flex h-full flex-1 flex-col",
					wrapper: "flex-1 min-h-0",
					input:
						"h-full min-h-[18rem] resize-none overflow-y-auto border-none bg-transparent text-lg leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100",
				}}
			/>
			{tokenLogprobs && tokenLogprobs.length > 0 && (
				<div className="mt-3 rounded-xl border border-solid border-slate-200 bg-white/70 p-3 shadow-sm dark:bg-slate-900/60">
					<div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
						Token Probabilities
						{isGenerating && (
							<span className="text-[10px] font-normal text-slate-400">
								Reroll after streaming finishes
							</span>
						)}
					</div>
					<TokenChips
						tokens={tokenLogprobs}
						onSelectAlternative={
							onTokenReroll
								? (index, alternative) => onTokenReroll(index, alternative)
								: undefined
						}
						disabled={isPredictDisabled || isGenerating || !onTokenReroll}
					/>
				</div>
			)}
		</div>
		<div className="flex justify-end">
			<Button
				radius="xl"
				size="md"
				variant={isGenerating ? "light" : "filled"}
				color={isGenerating ? "red" : "blue"}
				disabled={isPredictDisabled && !isGenerating}
				title={isPredictDisabled ? disabledReason : undefined}
				onClick={isGenerating ? onCancel : onPredict}
				leftSection={
					<span
						className={
							isGenerating
								? "w-4 h-4 i-lucide-loader-2 animate-spin"
								: "w-4 h-4 i-lucide-wand-2"
						}
						aria-hidden="true"
					/>
				}
			>
				{isGenerating ? "Stop" : "Predict"}
			</Button>
		</div>
	</div>
);

export default TextCompletionView;
