import type { LanguageModel } from "ai";
import { useCallback } from "react";
import { toast } from "sonner";
import type {
	BuiltInAvailability,
	ChatProviderReady,
	CompletionProviderReady,
	OpenAIProviderAdapter,
	ProviderKind,
} from "../types";

interface UseProviderReadinessOptions {
	providerKind: ProviderKind;
	builtInAvailability: BuiltInAvailability;
	activeModel: string | null;
	openAIProvider: OpenAIProviderAdapter | null;
	getBuiltInChatModel: () => LanguageModel;
	baseURL: string;
	apiKey: string;
}

export const useProviderReadiness = ({
	providerKind,
	builtInAvailability,
	activeModel,
	openAIProvider,
	getBuiltInChatModel,
	baseURL,
	apiKey,
}: UseProviderReadinessOptions) => {
	const ensureChatReady = useCallback((): ChatProviderReady | null => {
		if (providerKind === "openai-compatible") {
			if (!activeModel) {
				toast.error("Select a model before sending");
				return null;
			}
			if (!openAIProvider) {
				toast.error("Set an API base URL before sending");
				return null;
			}
			return {
				kind: "openai-compatible",
				modelId: activeModel,
				openAIProvider,
				baseURL,
				apiKey,
			};
		}
		if (builtInAvailability !== "available") {
			toast.error("Download the built-in model in Settings before chatting");
			return null;
		}
		return {
			kind: "built-in",
			getBuiltInChatModel,
		};
	}, [
		activeModel,
		builtInAvailability,
		getBuiltInChatModel,
		apiKey,
		baseURL,
		openAIProvider,
		providerKind,
	]);

	const ensureCompletionReady =
		useCallback((): CompletionProviderReady | null => {
			if (providerKind !== "openai-compatible") {
				toast.error("Built-in AI supports chat only");
				return null;
			}
			if (!activeModel) {
				toast.error("Select a model before predicting");
				return null;
			}
			if (!openAIProvider) {
				toast.error("Set an API base URL before predicting");
				return null;
			}
			return {
				kind: "openai-compatible",
				modelId: activeModel,
				openAIProvider,
				baseURL,
				apiKey,
			};
		}, [activeModel, apiKey, baseURL, openAIProvider, providerKind]);

	return { ensureChatReady, ensureCompletionReady };
};
