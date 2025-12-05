import { builtInAI } from "@built-in-ai/core";
import { get as getValue, set as setValue } from "idb-keyval";
import { toast } from "sonner";
import { create } from "zustand";
import { fetchOpenAICompatibleModels } from "../ai/openaiCompatible";
import { settingsKey } from "../constants/storageKeys";
import type { BuiltInAvailability, ModelInfo, ProviderEntry } from "../types";

import { v4 as uuidv4 } from "uuid";

export const HEATMAP_THEMES = [
	"traffic-light",
	"monochrome-red",
	"monochrome-blue",
] as const;

export type HeatmapTheme = (typeof HEATMAP_THEMES)[number];

type StoredSettings = {
	providers: ProviderEntry[];
	activeProviderId: string | null;
	enableBeforeUnloadWarning: boolean;
	enableTokenHeatmap: boolean;
	heatmapTheme: HeatmapTheme;
	// Legacy fields retained for backward compatibility; they are ignored in favor of per-provider storage
	models?: ModelInfo[];
	activeModel?: string | null;
};

interface SettingsState {
	providers: ProviderEntry[];
	activeProviderId: string | null;
	enableBeforeUnloadWarning: boolean;
	enableTokenHeatmap: boolean;
	heatmapTheme: HeatmapTheme;
	builtInAvailability: BuiltInAvailability;
	isHydrated: boolean;
	setActiveModel: (model: string | null) => void;
	setEnableBeforeUnloadWarning: (enabled: boolean) => Promise<void>;
	setEnableTokenHeatmap: (enabled: boolean) => Promise<void>;
	setHeatmapTheme: (theme: HeatmapTheme) => Promise<void>;
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
		const {
			providers,
			activeProviderId,
			enableBeforeUnloadWarning,
			enableTokenHeatmap,
			heatmapTheme,
		} = get();
		await setValue(settingsKey, {
			providers,
			activeProviderId,
			enableBeforeUnloadWarning,
			enableTokenHeatmap,
			heatmapTheme,
			...overrides,
		});
	};

	return {
		providers: [],
		activeProviderId: null,
		enableBeforeUnloadWarning: true,
		enableTokenHeatmap: false,
		heatmapTheme: "traffic-light",
		builtInAvailability: "unknown",
		isHydrated: false,
		setActiveModel: (model) => {
			const { activeProviderId, providers } = get();
			if (!activeProviderId) {
				return;
			}

			let didChange = false;
			const updatedProviders = providers.map((provider) => {
				if (provider.id !== activeProviderId) {
					return provider;
				}
				if (
					model &&
					provider.models &&
					provider.models.every((entry) => entry.id !== model)
				) {
					return provider;
				}
				if (provider.activeModelId === model) {
					return provider;
				}
				didChange = true;
				return { ...provider, activeModelId: model };
			});

			if (!didChange) {
				return;
			}

			set({ providers: updatedProviders });
			void persistSettings({ providers: updatedProviders });
		},
		setEnableBeforeUnloadWarning: async (enabled) => {
			set({ enableBeforeUnloadWarning: enabled });
			await persistSettings({ enableBeforeUnloadWarning: enabled });
		},
		setEnableTokenHeatmap: async (enabled) => {
			set({ enableTokenHeatmap: enabled });
			await persistSettings({ enableTokenHeatmap: enabled });
		},
		setHeatmapTheme: async (theme) => {
			set({ heatmapTheme: theme });
			await persistSettings({ heatmapTheme: theme });
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
					providers: storedSettings.providers ?? [],
					activeProviderId: storedSettings.activeProviderId ?? null,
					enableBeforeUnloadWarning:
						storedSettings.enableBeforeUnloadWarning ?? true,
					enableTokenHeatmap: storedSettings.enableTokenHeatmap ?? false,
					heatmapTheme: storedSettings.heatmapTheme ?? "traffic-light",
					isHydrated: true,
				});
			} else {
				set({ isHydrated: true });
			}
		},
		addProvider: async (entry) => {
			const newProvider = {
				...entry,
				id: uuidv4(),
				models: [],
				activeModelId: null,
			};
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
			const { providers } = get();
			const newProviders = providers.map((p) =>
				p.id === id ? { ...p, ...updates } : p,
			);
			set({ providers: newProviders });

			await persistSettings({ providers: newProviders });
		},
		removeProvider: async (id) => {
			const { providers, activeProviderId } = get();
			const newProviders = providers.filter((p) => p.id !== id);
			let newActiveId = activeProviderId;

			if (activeProviderId === id) {
				newActiveId = newProviders[0]?.id ?? null;
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
			}
		},
		syncModels: async ({ silent = false, force = false } = {}) => {
			const { activeProviderId, providers } = get();
			const activeProvider = providers.find((p) => p.id === activeProviderId);

			if (!activeProvider) {
				return [];
			}

			if (
				!force &&
				activeProvider.kind !== "openai-compatible" &&
				activeProvider.kind !== "dummy"
			) {
				return [];
			}

			if (activeProvider.kind === "dummy") {
				try {
					const { fetchDummyModels } = await import("../ai/dummyProvider");
					const fetchedModels = await fetchDummyModels();
					const currentModel = activeProvider.activeModelId;
					const currentModelStillValid = fetchedModels.some(
						(model) => model.id === currentModel,
					);
					const nextModelId =
						(currentModelStillValid && currentModel) ||
						fetchedModels.at(0)?.id ||
						null;
					const updatedProviders = providers.map((provider) =>
						provider.id === activeProviderId
							? {
									...provider,
									models: fetchedModels,
									activeModelId: nextModelId,
								}
							: provider,
					);

					set({ providers: updatedProviders });
					await persistSettings({ providers: updatedProviders });
					if (!silent) {
						toast.success("Synced models");
					}
					return fetchedModels;
				} catch (error) {
					console.error(error);
					if (!silent) {
						toast.error("Failed to fetch dummy models");
					}
					return [];
				}
			}

			const targetBaseURL = activeProvider.config.baseURL?.trim();
			const targetAPIKey = activeProvider.config.apiKey;

			if (activeProvider.kind !== "openai-compatible") {
				return [];
			}

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
				const currentModel = activeProvider.activeModelId;
				const currentModelStillValid = fetchedModels.some(
					(model) => model.id === currentModel,
				);
				const nextModelId =
					(currentModelStillValid && currentModel) ||
					fetchedModels.at(0)?.id ||
					null;
				const updatedProviders = providers.map((provider) =>
					provider.id === activeProviderId
						? {
								...provider,
								models: fetchedModels,
								activeModelId: nextModelId,
							}
						: provider,
				);

				set({ providers: updatedProviders });

				await persistSettings({ providers: updatedProviders });
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
