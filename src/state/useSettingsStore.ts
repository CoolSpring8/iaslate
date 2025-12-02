import { builtInAI } from "@built-in-ai/core";
import { get as getValue, set as setValue } from "idb-keyval";
import { toast } from "sonner";
import { create } from "zustand";
import { fetchOpenAICompatibleModels } from "../ai/openaiCompatible";
import { settingsKey } from "../constants/storageKeys";
import type { BuiltInAvailability, ModelInfo, ProviderKind } from "../types";

interface SettingsState {
	baseURL: string;
	apiKey: string;
	models: ModelInfo[];
	activeModel: string | null;
	providerKind: ProviderKind;
	builtInAvailability: BuiltInAvailability;
	isHydrated: boolean;
	setActiveModel: (model: string | null) => void;
	setBuiltInAvailability: (availability: BuiltInAvailability) => void;
	refreshBuiltInAvailability: () => Promise<void>;
	hydrate: () => Promise<void>;
	saveSettings: (values: {
		baseURL: string;
		apiKey: string;
		providerKind: ProviderKind;
	}) => Promise<void>;
	syncModels: (options?: {
		baseURLOverride?: string;
		apiKeyOverride?: string;
		silent?: boolean;
		force?: boolean;
	}) => Promise<ModelInfo[]>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
	baseURL: "",
	apiKey: "",
	models: [],
	activeModel: null,
	providerKind: "openai-compatible",
	builtInAvailability: "unknown",
	isHydrated: false,
	setActiveModel: (model) => set({ activeModel: model }),
	setBuiltInAvailability: (availability) =>
		set({ builtInAvailability: availability }),
	refreshBuiltInAvailability: async () => {
		try {
			const availability = await builtInAI().availability();
			set({ builtInAvailability: availability as BuiltInAvailability });
		} catch (error) {
			console.error(error);
			set({ builtInAvailability: "unavailable" });
		}
	},
	hydrate: async () => {
		const storedSettings = await getValue<{
			baseURL: string;
			apiKey: string;
			providerKind: ProviderKind;
			models: ModelInfo[];
		}>(settingsKey);

		if (storedSettings) {
			set({
				...storedSettings,
				activeModel: storedSettings.models?.at(0)?.id ?? null,
				isHydrated: true,
			});
		} else {
			// Initialize with defaults if no settings found
			set({ isHydrated: true });
		}
	},
	saveSettings: async ({ baseURL, apiKey, providerKind }) => {
		const currentSettings = {
			baseURL,
			apiKey,
			providerKind,
			models: get().models,
		};
		set(currentSettings);
		await setValue(settingsKey, currentSettings);

		if (providerKind === "openai-compatible") {
			await get().syncModels({
				baseURLOverride: baseURL,
				apiKeyOverride: apiKey,
				silent: true,
				force: true,
			});
		} else {
			set({ activeModel: null });
		}
	},
	syncModels: async ({
		baseURLOverride,
		apiKeyOverride,
		silent = false,
		force = false,
	} = {}) => {
		const currentProviderKind = get().providerKind;
		if (!force && currentProviderKind !== "openai-compatible") {
			return [];
		}
		const targetBaseURL = (baseURLOverride ?? get().baseURL).trim();
		const targetAPIKey = apiKeyOverride ?? get().apiKey;
		if (!targetBaseURL) {
			if (!silent) {
				toast.error("Set an API base URL before syncing");
			}
			return [];
		}
		try {
			const fetchedModels = await fetchOpenAICompatibleModels({
				baseURL: targetBaseURL,
				apiKey: targetAPIKey,
			});
			set({ models: fetchedModels });

			// Update storage with new models
			const currentSettings = {
				baseURL: get().baseURL,
				apiKey: get().apiKey,
				providerKind: get().providerKind,
				models: fetchedModels,
			};
			await setValue(settingsKey, currentSettings);

			const currentModel = get().activeModel;
			const currentModelStillValid = fetchedModels.some(
				(model) => model.id === currentModel,
			);
			const nextModelId =
				(currentModelStillValid && currentModel) || fetchedModels.at(0)?.id;
			set({ activeModel: nextModelId ?? null });
			if (!silent) {
				toast.success("Synced models");
			}
			return fetchedModels;
		} catch (error) {
			console.error(error);
			if (!silent) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to fetch models from API";
				toast.error(message);
			}
			return [];
		}
	},
}));
