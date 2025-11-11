import { Textarea } from "@mantine/core";
import { twJoin } from "tailwind-merge";

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
	<div className="flex flex-1 flex-col gap-4 px-4 py-2">
		<Textarea
			className="flex-1"
			minRows={8}
			autosize
			value={value}
			onChange={(event) => {
				onChange(event.target.value);
			}}
			placeholder="Provide some starter text and let the model continue it..."
		/>
		<div className="flex gap-2">
			<button
				type="button"
				className={twJoin(
					"rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors",
					"hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2",
					isGenerating ? "cursor-not-allowed opacity-60" : "",
				)}
				onClick={onPredict}
				disabled={isGenerating}
			>
				Predict
			</button>
			<button
				type="button"
				className={twJoin(
					"rounded border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition-colors",
					"hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2",
					!isGenerating ? "cursor-not-allowed opacity-60" : "",
				)}
				onClick={onCancel}
				disabled={!isGenerating}
			>
				Cancel
			</button>
		</div>
	</div>
);

export default TextCompletionView;
