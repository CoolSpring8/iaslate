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
		async (seedText: string, updateSeed = true) => {
			if (isGenerating) {
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

		// If the current text content matches the start of the expected text (or vice versa),
		// we can preserve the valid logprobs.
		if (expectedText && textContent.startsWith(seedRef.current)) {
			// Calculate how many tokens are still valid
			let validTokenCount = 0;
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

			if (validTokenCount < tokenLogprobs.length) {
				// We have some invalid tokens at the end (or text was edited in the middle of tokens)
				// But wait, if textContent is LONGER than expectedText, and starts with it, all tokens are valid.
				// If textContent is SHORTER, we only keep the ones that fit.

				// Actually, simpler logic:
				// 1. Construct the full string from seed + tokens.
				// 2. Compare with textContent.
				// 3. Find the common prefix length.
				// 4. Keep tokens that fall entirely within that common prefix.

				// However, since we only have the token strings, we can just iterate and check.
				setTokenLogprobs((draft) => {
					// This is a bit tricky with Immer and strict mode, so let's just slice the array
					return draft.slice(0, validTokenCount);
				});

				// Update seedRef to be the text *before* the first token?
				// No, seedRef should remain the original seed.
				// But if we edited the text, the "seed" for the *next* generation might be different.
				// The `runGeneration` call below will update `seedRef` if we pass `true` (default).
				// But we want to preserve the `tokenLogprobs` relative to the *new* seed?
				// No, `tokenLogprobs` are relative to the `seedRef`.

				// If we edited the text, `textContent` is the new truth.
				// If we keep some tokens, they must be valid continuations of the *original* seedRef?
				// Yes, because we checked `textContent.startsWith(seedRef.current)`.

				// So:
				// 1. `seedRef` is unchanged (it's the anchor).
				// 2. We keep tokens that are still present in `textContent` immediately following `seedRef`.
				// 3. The REST of `textContent` (after the preserved tokens) becomes the new "prompt" for generation.
				// 4. Wait, `runGeneration` takes `seedText`. If we pass `textContent`, `runGeneration` sets `seedRef = textContent`.
				//    This invalidates all previous logprobs because they were relative to the OLD `seedRef`.

				// CRITICAL: To preserve logprobs, we must NOT update `seedRef` to include the preserved tokens.
				// `seedRef` must stay "behind" the preserved tokens.
				// But `runGeneration` sets `seedRef` to the input `seedText`.

				// So we need to call `runGeneration` with the *end* of the preserved tokens as the "effective" seed?
				// No, `runGeneration` appends new tokens to the list.

				// Let's look at `runGeneration`:
				// It sets `seedRef.current = seedText` (if updateSeed is true).
				// It appends new tokens to `tokenLogprobs`.

				// So if we want to keep existing tokens, we must:
				// 1. Determine which tokens are valid.
				// 2. Keep them in state.
				// 3. Call `runGeneration` with `textContent` but...
				//    If we call with `textContent`, `seedRef` becomes `textContent`. The existing tokens are now "before" the seed.
				//    This means they are effectively "solidified" into the seed.

				// The user wants to *preserve probabilities* of early text.
				// This means those tokens must remain in `tokenLogprobs` and NOT be moved to `seedRef`.

				// So, we should:
				// 1. Identify valid tokens.
				// 2. Prune invalid tokens.
				// 3. Call `runGeneration` with `textContent`, but pass `updateSeed = false`?
				//    If `updateSeed = false`, `seedRef` stays as is (the old anchor).
				//    The generator will receive `textContent` as the prompt.
				//    It will generate a completion.
				//    The completion will start *after* `textContent`.
				//    The new tokens will be appended to `tokenLogprobs`.

				// BUT, `tokenLogprobs` currently contains tokens that make up `textContent` (partially).
				// If `seedRef` is at index 0, and we have tokens A, B, C.
				// `textContent` is "A B C".
				// We call `runGeneration("A B C", false)`.
				// `seedRef` is still 0.
				// Generator returns D.
				// `tokenLogprobs` becomes A, B, C, D.
				// `textContent` becomes "A B C D".
				// This looks correct!

				// The only catch is if `textContent` has extra text that is NOT in tokens.
				// e.g. User typed " X" at the end. `textContent` is "A B C X".
				// Tokens are A, B, C.
				// We call `runGeneration("A B C X", false)`.
				// Generator returns Y.
				// `tokenLogprobs` becomes A, B, C, Y?
				// NO. The generator returns tokens for the *completion*.
				// The "X" is part of the prompt, but it's NOT in `tokenLogprobs`.
				// So we have a gap. `tokenLogprobs` has A, B, C. Then there's "X" (no probs). Then Y (probs).
				// Our `TokenInlineRenderer` expects a continuous list of tokens.

				// If there is a gap (text without probs), we must "solidify" everything before the gap?
				// Or at least solidify the gap?

				// If we have "A B C X", and A,B,C have probs.
				// We probably have to solidify A,B,C because X breaks the chain?
				// Or we can keep A,B,C as tokens, and X is just... text?
				// But `TextCompletionView` renders `prefixText` (seed) + `tokenLogprobs`.
				// It assumes `value` = `prefix` + `tokens`.
				// If `value` has extra stuff, it might break.

				// Let's check `TextCompletionView`:
				// `const generatedTail = prefixText.length > 0 ? value.slice(prefixText.length) : value;`
				// It renders `TokenInlineRenderer` with `tokenLogprobs`.
				// `TokenInlineRenderer` renders the tokens.
				// If `tokenLogprobs` sums up to "A B C", but `value` is "A B C X".
				// The view renders "A B C" (from tokens).
				// Where does "X" go?
				// `TextCompletionView` logic:
				// `{showTokens && ... ? ( ... TokenInlineRenderer ... ) : ( ... generatedTail ... )}`
				// Wait, inside the `if (showTokens)` block:
				// It renders `prefixText`.
				// Then `TokenInlineRenderer`.
				// It does NOT render `generatedTail` if `showTokenOverlay` is true.
				// So "X" would be INVISIBLE if it's not in `tokenLogprobs`!

				// This implies that `tokenLogprobs` MUST cover the entire tail of the text relative to `seedRef`.
				// If there is text in `textContent` that is NOT in `tokenLogprobs`, we MUST solidify the tokens up to that point
				// so that the new `seedRef` includes the extra text.

				// So, if user types "X" at the end:
				// We must solidify A,B,C. `seedRef` becomes "A B C X". `tokenLogprobs` becomes empty.
				// Then generate Y. `tokenLogprobs` -> Y.

				// But the user request is: "preserve token probabilities of early text".
				// This implies they want to keep A,B,C as tokens even if they restart generation.
				// If they restart generation *without modifying text*, we should definitely keep A,B,C.

				// So:
				// If `textContent` == `seedRef` + `tokens A,B,C`.
				// User clicks "Predict".
				// We should NOT clear A,B,C.
				// We should call `runGeneration("A B C", false)`.
				// `seedRef` stays.
				// Generator returns D.
				// `tokenLogprobs` -> A,B,C,D.

				// This works!

				// What if `textContent` == `seedRef` + `tokens A,B` (C was deleted).
				// We keep A,B. Call `runGeneration("A B", false)`.
				// Works.

				// What if `textContent` == `seedRef` + `tokens A,B` + "X" (inserted).
				// We keep A,B.
				// But "X" is not a token.
				// We cannot represent "X" in `tokenLogprobs` unless we have a dummy token?
				// But we don't have probs for X.
				// So we MUST solidify A,B and X into the new seed.

				// So the logic is:
				// 1. Find the longest prefix of `tokenLogprobs` that matches `textContent` (relative to `seedRef`).
				// 2. Check if there is any "extra" text in `textContent` after that prefix.
				// 3. If NO extra text (perfect match or just truncation):
				//    - Keep the matching tokens.
				//    - Call `runGeneration(textContent, false)`.
				// 4. If YES extra text (insertion or mismatch):
				//    - We MUST solidify.
				//    - `seedRef` = `textContent`.
				//    - `tokenLogprobs` = [].
				//    - Call `runGeneration(textContent, true)`.
			}
		}

		// Let's implement this logic.

		let keepTokens = false;
		let validTokenCount = 0;

		if (seedRef.current && textContent.startsWith(seedRef.current)) {
			let currentCheck = seedRef.current;
			let matchCount = 0;

			for (const token of tokenLogprobs) {
				const nextCheck = currentCheck + token.token;
				if (textContent.startsWith(nextCheck)) {
					matchCount++;
					currentCheck = nextCheck;
				} else {
					break;
				}
			}

			// Check if there is extra text after the matched tokens
			if (textContent.length === currentCheck.length) {
				// Perfect match (or truncation). No extra text.
				keepTokens = true;
				validTokenCount = matchCount;
			}
		}

		if (keepTokens) {
			setTokenLogprobs((draft) => {
				if (validTokenCount < draft.length) {
					return draft.slice(0, validTokenCount);
				}
				return draft;
			});
			await runGeneration(textContent, false);
		} else {
			setTokenLogprobs([]);
			await runGeneration(textContent, true);
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
			};
			const newSeed =
				seedRef.current +
				prefixTokens.map((entry) => entry.token).join("") +
				replacement.token;
			setTextContent(newSeed);
			setTokenLogprobs([...prefixTokens, newTokenEntry]);
			await runGeneration(newSeed, false);
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
