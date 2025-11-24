import { useEffect } from "react";
import type { ProviderKind } from "../types";

interface UseBuiltInAvailabilityOptions {
	providerKind: ProviderKind;
	onBuiltInSelected?: () => void;
	refreshBuiltInAvailability: () => Promise<void> | void;
}

export const useBuiltInAvailability = ({
	providerKind,
	onBuiltInSelected,
	refreshBuiltInAvailability,
}: UseBuiltInAvailabilityOptions) => {
	useEffect(() => {
		void refreshBuiltInAvailability();
	}, [refreshBuiltInAvailability]);

	useEffect(() => {
		if (providerKind === "built-in") {
			onBuiltInSelected?.();
		}
	}, [onBuiltInSelected, providerKind]);
};
