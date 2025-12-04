import { Button } from "@mantine/core";
import { useRef, useState } from "react";
import type { TokenAlternative, TokenLogprob } from "../types";
import TokenInlineRenderer from "./TokenInlineRenderer";

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
	showTokenOverlay?: boolean;
	generatedPrefix?: string;
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
	generatedPrefix = "",
}: TextCompletionViewProps) => {
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const prefixText =
		generatedPrefix && value.startsWith(generatedPrefix) ? generatedPrefix : "";

	const generatedTail =
		prefixText.length > 0 ? value.slice(prefixText.length) : value;

	const requestRef = useRef<number>();

	const handleMouseMove = (e: React.MouseEvent<HTMLTextAreaElement>) => {
		const clientX = e.clientX;
		const clientY = e.clientY;

		if (requestRef.current) {
			cancelAnimationFrame(requestRef.current);
		}

		requestRef.current = requestAnimationFrame(() => {
			if (!textareaRef.current) return;
			// Temporarily disable pointer events on textarea to hit-test the overlay
			const prevPointerEvents = textareaRef.current.style.pointerEvents;
			textareaRef.current.style.pointerEvents = "none";
			const element = document.elementFromPoint(clientX, clientY);
			textareaRef.current.style.pointerEvents = prevPointerEvents;

			if (element instanceof HTMLElement) {
				// If we are hovering over the menu, don't change the selection
				if (element.closest("[data-token-menu]")) {
					return;
				}

				const indexStr = element.getAttribute("data-token-index");
				if (indexStr) {
					setHoveredIndex(parseInt(indexStr, 10));
				} else {
					setHoveredIndex(null);
				}
			} else {
				setHoveredIndex(null);
			}
		});
	};

	const handleMouseLeave = () => {
		setHoveredIndex(null);
	};

	return (
		<div className="flex flex-1 min-h-0 flex-col gap-6 px-6 py-4">
			<div className="flex items-center justify-between px-1">
				<p className="text-sm font-medium text-slate-700 dark:text-slate-200">
					Text Completion
				</p>
			</div>
			<div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-slate-50/90 p-4 backdrop-blur dark:bg-slate-900/40">
				<div className="flex-1 overflow-y-auto rounded-xl border border-solid border-slate-200 bg-white/70 shadow-sm dark:bg-slate-900/60">
					<div className="relative min-h-full">
						{/* Overlay Layer (Relative, dictates height) */}
						<div
							className="min-h-[18rem] w-full whitespace-pre-wrap p-3 font-sans text-base leading-8 text-[#374151] dark:text-slate-100"
							aria-hidden="true"
						>
							{prefixText.length > 0 && (
								<span className="text-[#374151] dark:text-slate-100">
									{prefixText}
								</span>
							)}
							{tokenLogprobs && tokenLogprobs.length > 0 ? (
								<TokenInlineRenderer
									inline
									tokens={tokenLogprobs}
									onSelectAlternative={
										onTokenReroll
											? (index, alternative) =>
													onTokenReroll(index, alternative)
											: undefined
									}
									disabled={isPredictDisabled || !onTokenReroll}
									hoveredIndex={hoveredIndex}
								/>
							) : (
								<span className="text-[#374151] dark:text-slate-100">
									{generatedTail}
								</span>
							)}
							{/* Add a trailing space to ensure caret at end works visually if needed, though textarea handles it */}
							<span className="invisible">{"\u200b"}</span>
						</div>

						{/* Textarea Layer (Absolute, covers overlay) */}
						<textarea
							ref={textareaRef}
							value={value}
							onChange={(event) => onChange(event.target.value)}
							onMouseMove={handleMouseMove}
							onMouseLeave={handleMouseLeave}
							placeholder="Provide a seed paragraph and let the model continue it…"
							className="absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent p-3 font-sans text-base leading-8 text-transparent caret-slate-900 focus:outline-none dark:text-transparent dark:caret-slate-100 border-none outline-none ring-0"
							spellCheck={false}
						/>
					</div>
				</div>
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
};

export default TextCompletionView;
