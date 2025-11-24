import { streamText } from "ai";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useImmer } from "use-immer";
import type { CompletionProviderReady } from "../types";

interface UseTextCompletionOptions {
	ensureCompletionReady: () => CompletionProviderReady | null;
}

export const useTextCompletion = ({
	ensureCompletionReady,
}: UseTextCompletionOptions) => {
	const [textContent, setTextContent] = useImmer("");
	const [isGenerating, setIsGenerating] = useState(false);
	const abortControllerRef = useRef<AbortController | null>(null);

	const predict = useCallback(async () => {
		if (isGenerating) {
			return;
		}
		const readiness = ensureCompletionReady();
		if (!readiness) {
			return;
		}
		const abortController = new AbortController();
		abortControllerRef.current = abortController;
		setIsGenerating(true);
		try {
			const stream = streamText({
				model: readiness.openAIProvider.completionModel(readiness.modelId),
				prompt: textContent,
				temperature: 0.3,
				abortSignal: abortController.signal,
			});
			for await (const delta of stream.textStream) {
				if (delta) {
					setTextContent((draft) => draft + delta);
				}
			}
		} catch (error) {
			if (abortController.signal.aborted) {
				return;
			}
			console.error(error);
			toast.error("Failed to generate completion");
		} finally {
			setIsGenerating(false);
			if (abortControllerRef.current === abortController) {
				abortControllerRef.current = null;
			}
		}
	}, [ensureCompletionReady, isGenerating, setTextContent, textContent]);

	const cancel = useCallback(() => {
		const controller = abortControllerRef.current;
		if (!controller) {
			setIsGenerating(false);
			return;
		}
		controller.abort();
		abortControllerRef.current = null;
		setIsGenerating(false);
	}, []);

	return {
		textContent,
		setTextContent,
		isGenerating,
		predict,
		cancel,
	};
};
