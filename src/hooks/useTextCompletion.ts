import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useImmer } from "use-immer";
import { streamCompletionWithProbs } from "../ai/openaiLogprobStream";
import type {
	CompletionProviderReady,
	TokenAlternative,
	TokenLogprob,
} from "../types";

interface UseTextCompletionOptions {
	ensureCompletionReady: () => CompletionProviderReady | null;
}

export const useTextCompletion = ({
	ensureCompletionReady,
}: UseTextCompletionOptions) => {
	const [textContent, setTextContent] = useImmer("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [tokenLogprobs, setTokenLogprobs] = useImmer<TokenLogprob[]>([]);
	const abortControllerRef = useRef<AbortController | null>(null);
	const seedRef = useRef("");

	const runGeneration = useCallback(
		async (seedText: string) => {
			if (isGenerating) {
				return;
			}
			const readiness = ensureCompletionReady();
			if (!readiness) {
				return;
			}
			const abortController = new AbortController();
			abortControllerRef.current = abortController;
			seedRef.current = seedText;
			setIsGenerating(true);
			try {
				const stream = streamCompletionWithProbs({
					baseURL: readiness.baseURL,
					apiKey: readiness.apiKey,
					model: readiness.modelId,
					prompt: seedText,
					temperature: 0.3,
					signal: abortController.signal,
				});
				for await (const chunk of stream) {
					if (chunk.content) {
						setTextContent((draft) => draft + chunk.content);
					}
					if (chunk.tokenLogprobs?.length) {
						setTokenLogprobs((draft) => {
							draft.push(...chunk.tokenLogprobs!);
						});
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
		},
		[ensureCompletionReady, isGenerating, setTextContent, setTokenLogprobs],
	);

	const predict = useCallback(async () => {
		if (isGenerating) {
			return;
		}
		const expectedText =
			seedRef.current && tokenLogprobs.length > 0
				? seedRef.current + tokenLogprobs.map((entry) => entry.token).join("")
				: seedRef.current;
		if (!expectedText || expectedText !== textContent) {
			setTokenLogprobs([]);
		}
		await runGeneration(textContent);
	}, [
		isGenerating,
		runGeneration,
		setTokenLogprobs,
		textContent,
		tokenLogprobs,
	]);

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

	const rerollFromToken = useCallback(
		async (tokenIndex: number, replacement: TokenAlternative) => {
			const target = tokenLogprobs[tokenIndex];
			if (!target) {
				return;
			}
			if (isGenerating) {
				cancel();
			}
			const prefixTokens = tokenLogprobs.slice(0, tokenIndex);
			const updatedAlternatives = [
				replacement,
				...target.alternatives.filter((alt) => alt.token !== replacement.token),
			];
			const newTokenEntry: TokenLogprob = {
				token: replacement.token,
				probability: replacement.probability,
				alternatives: updatedAlternatives,
			};
			const newSeed =
				seedRef.current +
				prefixTokens.map((entry) => entry.token).join("") +
				replacement.token;
			setTextContent(newSeed);
			setTokenLogprobs([...prefixTokens, newTokenEntry]);
			await runGeneration(newSeed);
		},
		[
			cancel,
			isGenerating,
			runGeneration,
			setTextContent,
			setTokenLogprobs,
			tokenLogprobs,
		],
	);

	const overwriteTextContent = useCallback(
		(value: string) => {
			seedRef.current = value;
			setTokenLogprobs([]);
			setTextContent(value);
		},
		[setTextContent, setTokenLogprobs],
	);

	return {
		textContent,
		setTextContent,
		overwriteTextContent,
		isGenerating,
		predict,
		cancel,
		tokenLogprobs,
		rerollFromToken,
		seedText: seedRef.current,
	};
};
