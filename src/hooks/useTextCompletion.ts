import { streamText } from "ai";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useImmer } from "use-immer";
import { createDummyProvider, generateFakeLogprobs } from "../ai/dummyProvider";
import { OPENAI_COMPATIBLE_PROVIDER_NAME } from "../ai/openaiCompatible";
import {
	buildCompletionLogprobOptions,
	parseCompletionLogprobsChunk,
} from "../ai/openaiLogprobs";
import { processFullStream } from "../ai/streamUtils";
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
		async (seedText: string, updateSeed = true, startTokenIndex = 0) => {
			const hasActiveGeneration =
				abortControllerRef.current &&
				abortControllerRef.current.signal.aborted === false;
			if (hasActiveGeneration) {
				return;
			}
			const readiness = ensureCompletionReady();
			if (!readiness) {
				return;
			}
			const abortController = new AbortController();
			abortControllerRef.current = abortController;
			if (updateSeed) {
				seedRef.current = seedText;
			}
			const logprobSeed = seedRef.current;
			let tokenIndex = startTokenIndex;
			setIsGenerating(true);
			try {
				if (readiness.kind === "dummy") {
					// Dummy provider: custom streaming with fake logprobs
					const dummyProvider = createDummyProvider({
						tokensPerSecond: readiness.tokensPerSecond,
					});
					const stream = streamText({
						model: dummyProvider.completionModel(readiness.modelId),
						prompt: seedText,
						abortSignal: abortController.signal,
					});
					for await (const part of stream.fullStream) {
						if (part.type === "text-delta" && part.text) {
							const tokenLogprob = generateFakeLogprobs(
								part.text,
								readiness.modelId,
								{ seed: logprobSeed, tokenIndex },
							);
							tokenIndex += 1;
							setTextContent((draft) => draft + part.text);
							setTokenLogprobs((draft) => {
								draft.push(tokenLogprob);
							});
						}
						if (part.type === "error") {
							throw new Error(
								typeof part.error === "string"
									? part.error
									: part.error instanceof Error
										? part.error.message
										: "Failed to stream response",
							);
						}
					}
				} else {
					// OpenAI-compatible provider
					const stream = streamText({
						model: readiness.openAIProvider.completionModel(readiness.modelId),
						prompt: seedText,
						temperature: 0.3,
						abortSignal: abortController.signal,
						includeRawChunks: true,
						providerOptions: buildCompletionLogprobOptions(
							OPENAI_COMPATIBLE_PROVIDER_NAME,
						),
					});
					await processFullStream(stream.fullStream, {
						append: (delta) => {
							if (delta.content) {
								setTextContent((draft) => draft + delta.content!);
							}
							if (delta.tokenLogprobs?.length) {
								setTokenLogprobs((draft) => {
									draft.push(...delta.tokenLogprobs!);
								});
							}
						},
						parseRawChunk: parseCompletionLogprobsChunk,
					});
				}
			} catch (error) {
				if (abortController.signal.aborted) {
					return;
				}
				console.error(error);
				toast.error("Failed to generate completion");
			} finally {
				if (abortControllerRef.current === abortController) {
					setIsGenerating(false);
					abortControllerRef.current = null;
				}
			}
		},
		[ensureCompletionReady, setTextContent, setTokenLogprobs],
	);

	const predict = useCallback(async () => {
		if (isGenerating) {
			return;
		}
		// If the user only appended text to the existing seed, we can keep previously
		// streamed token probabilities and continue generation instead of restarting.
		const canReuseTokens =
			seedRef.current.length > 0 &&
			textContent.startsWith(seedRef.current) &&
			tokenLogprobs.length > 0;
		let validTokenCount = 0;
		let textAlignedWithTokens = false;

		if (canReuseTokens) {
			let currentCheck = seedRef.current;

			for (const token of tokenLogprobs) {
				const nextCheck = currentCheck + token.token;
				if (textContent.startsWith(nextCheck)) {
					validTokenCount++;
					currentCheck = nextCheck;
				} else {
					break;
				}
			}
			textAlignedWithTokens = textContent.length === currentCheck.length;
		}

		if (canReuseTokens && textAlignedWithTokens) {
			setTokenLogprobs((draft) => {
				if (validTokenCount < draft.length) {
					return draft.slice(0, validTokenCount);
				}
				return draft;
			});
			// Keep existing probabilities: generate more without moving tokens into the seed.
			await runGeneration(textContent, false, validTokenCount);
		} else {
			// Edits introduced a gap; treat the current text as the new seed.
			setTokenLogprobs([]);
			await runGeneration(textContent, true, 0);
		}
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
				segment: target.segment,
			};
			const newSeed =
				seedRef.current +
				prefixTokens.map((entry) => entry.token).join("") +
				replacement.token;
			setTextContent(newSeed);
			setTokenLogprobs([...prefixTokens, newTokenEntry]);
			await runGeneration(newSeed, false, prefixTokens.length + 1);
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
			if (isGenerating) {
				cancel();
			}
			seedRef.current = value;
			setTokenLogprobs([]);
			setTextContent(value);
		},
		[cancel, isGenerating, setTextContent, setTokenLogprobs],
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
