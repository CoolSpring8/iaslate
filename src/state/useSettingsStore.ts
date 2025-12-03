import { builtInAI } from "@built-in-ai/core";
import { get as getValue, set as setValue } from "idb-keyval";
import { toast } from "sonner";
import { create } from "zustand";
import { fetchOpenAICompatibleModels } from "../ai/openaiCompatible";
import { settingsKey } from "../constants/storageKeys";
import type { BuiltInAvailability, ModelInfo, ProviderEntry } from "../types";

import { v4 as uuidv4 } from "uuid";

type StoredSettings = {
	providers: ProviderEntry[];
	activeProviderId: string | null;
	models: ModelInfo[];
	enableBeforeUnloadWarning: boolean;
};

interface SettingsState {
	providers: ProviderEntry[];
	activeProviderId: string | null;
	models: ModelInfo[];
	activeModel: string | null;
	enableBeforeUnloadWarning: boolean;
	builtInAvailability: BuiltInAvailability;
	isHydrated: boolean;
	setActiveModel: (model: string | null) => void;
	setEnableBeforeUnloadWarning: (enabled: boolean) => Promise<void>;
	setBuiltInAvailability: (availability: BuiltInAvailability) => void;
	refreshBuiltInAvailability: () => Promise<void>;
	hydrate: () => Promise<void>;
	addProvider: (entry: Omit<ProviderEntry, "id">) => Promise<void>;
	updateProvider: (
		id: string,
		updates: Partial<ProviderEntry>,
	) => Promise<void>;
	removeProvider: (id: string) => Promise<void>;
	setActiveProvider: (id: string | null) => Promise<void>;
	syncModels: (options?: {
		silent?: boolean;
		force?: boolean;
	}) => Promise<ModelInfo[]>;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
	const persistSettings = async (overrides: Partial<StoredSettings> = {}) => {
		const { providers, activeProviderId, models, enableBeforeUnloadWarning } =
			get();
		await setValue(settingsKey, {
			providers,
			activeProviderId,
			models,
			enableBeforeUnloadWarning,
			...overrides,
		});
	};

	return {
		providers: [],
		activeProviderId: null,
		models: [],
		activeModel: null,
		enableBeforeUnloadWarning: true,
		builtInAvailability: "unknown",
		isHydrated: false,
		setActiveModel: (model) => set({ activeModel: model }),
		setEnableBeforeUnloadWarning: async (enabled) => {
			set({ enableBeforeUnloadWarning: enabled });
			await persistSettings({ enableBeforeUnloadWarning: enabled });
		},
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
			const storedSettings = await getValue<StoredSettings>(settingsKey);

			if (storedSettings) {
				set({
					...storedSettings,
					activeModel: storedSettings.models?.at(0)?.id ?? null,
					enableBeforeUnloadWarning:
						storedSettings.enableBeforeUnloadWarning ?? true,
					isHydrated: true,
				});
			} else {
				set({ isHydrated: true });
			}
		},
		addProvider: async (entry) => {
			const newProvider = { ...entry, id: uuidv4() };
			const { providers } = get();
			const newProviders = [...providers, newProvider];

			set({ providers: newProviders });

			// If it's the first provider, make it active
			if (newProviders.length === 1) {
				await get().setActiveProvider(newProvider.id);
			} else {
				await persistSettings({ providers: newProviders });
			}
		},
		updateProvider: async (id, updates) => {
			const { providers, activeProviderId } = get();
			const newProviders = providers.map((p) =>
				p.id === id ? { ...p, ...updates } : p,
			);
			set({ providers: newProviders });

			await persistSettings({ providers: newProviders });

			// If updating active provider, re-sync might be needed, but we'll let user trigger it manually or on switch
			if (id === activeProviderId && updates.config) {
				// Optional: auto-sync or clear models?
				// For now, let's just clear models if base URL changed to avoid mismatch
				if (updates.config.baseURL) {
					set({ models: [], activeModel: null });
				}
			}
		},
		removeProvider: async (id) => {
			const { providers, activeProviderId } = get();
			const newProviders = providers.filter((p) => p.id !== id);
			let newActiveId = activeProviderId;

			if (activeProviderId === id) {
				newActiveId = newProviders[0]?.id ?? null;
				set({ models: [], activeModel: null });
			}

			set({ providers: newProviders, activeProviderId: newActiveId });

			await persistSettings({
				providers: newProviders,
				activeProviderId: newActiveId,
			});

			if (newActiveId) {
				await get().syncModels({ silent: true });
			}
		},
		setActiveProvider: async (id) => {
			set({ activeProviderId: id });
			await persistSettings({ activeProviderId: id });
			if (id) {
				await get().syncModels({ silent: true, force: true });
			} else {
				set({ models: [], activeModel: null });
			}
		},
		syncModels: async ({ silent = false, force = false } = {}) => {
			const { activeProviderId, providers } = get();
			const activeProvider = providers.find((p) => p.id === activeProviderId);

			if (!activeProvider) {
				return [];
			}

			if (!force && activeProvider.kind !== "openai-compatible") {
				return [];
			}

			const targetBaseURL = activeProvider.config.baseURL?.trim();
			const targetAPIKey = activeProvider.config.apiKey;

			if (!targetBaseURL) {
				if (!silent) {
					toast.error("Set an API base URL before syncing");
				}
				return [];
			}

			try {
				const fetchedModels = await fetchOpenAICompatibleModels({
					baseURL: targetBaseURL,
					apiKey: targetAPIKey || "",
				});
				set({ models: fetchedModels });

				await persistSettings({ models: fetchedModels });

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
	};
});
