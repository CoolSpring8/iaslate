import { useRef } from "react";

interface StreamManager {
	register: (id: string, controller: AbortController) => void;
	abort: (id: string) => void;
	abortAll: () => void;
	setLatest: (id: string | undefined) => void;
	clearLatestIf: (id: string) => void;
	getLatest: () => string | undefined;
}

export const useStreamManager = (): StreamManager => {
	const controllersRef = useRef<Record<string, AbortController>>({});
	const latestAssistantIdRef = useRef<string | undefined>(undefined);

	const register = (id: string, controller: AbortController) => {
		controllersRef.current[id] = controller;
		latestAssistantIdRef.current = id;
	};

	const abort = (id: string) => {
		const controller = controllersRef.current[id];
		if (!controller) {
			return;
		}
		controller.abort();
		delete controllersRef.current[id];
		if (latestAssistantIdRef.current === id) {
			latestAssistantIdRef.current = undefined;
		}
	};

	const abortAll = () => {
		Object.values(controllersRef.current).forEach((controller) => {
			controller.abort();
		});
		controllersRef.current = {};
		latestAssistantIdRef.current = undefined;
	};

	const clearLatestIf = (id: string) => {
		if (latestAssistantIdRef.current === id) {
			latestAssistantIdRef.current = undefined;
		}
	};

	return {
		register,
		abort,
		abortAll,
		setLatest: (id) => {
			latestAssistantIdRef.current = id;
		},
		clearLatestIf,
		getLatest: () => latestAssistantIdRef.current,
	};
};

export type { StreamManager };
