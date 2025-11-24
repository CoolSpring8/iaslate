import { useMemo } from "react";
import type { BuiltInAvailability, ProviderKind } from "../types";

export const useBuiltInStatus = ({
	providerKind,
	builtInAvailability,
}: {
	providerKind: ProviderKind;
	builtInAvailability: BuiltInAvailability;
}) => {
	return useMemo(() => {
		if (providerKind !== "built-in") {
			return undefined;
		}
		switch (builtInAvailability) {
			case "downloading":
				return "Built-in AI downloading...";
			case "available":
				return "Built-in AI ready";
			case "downloadable":
				return "Download model in Settings";
			case "unavailable":
				return "Built-in AI unavailable";
			default:
				return "Built-in AI";
		}
	}, [builtInAvailability, providerKind]);
};
