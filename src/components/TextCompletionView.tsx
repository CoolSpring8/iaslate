import { Button, Textarea } from "@mantine/core";

interface TextCompletionViewProps {
	value: string;
	isGenerating: boolean;
	onChange: (value: string) => void;
	onPredict: () => void;
	onCancel: () => void;
}

const TextCompletionView = ({
	value,
	isGenerating,
	onChange,
	onPredict,
	onCancel,
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
		</div>
		<div className="flex justify-end">
			<Button
				radius="xl"
				size="md"
				variant={isGenerating ? "light" : "filled"}
				color={isGenerating ? "red" : "blue"}
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
