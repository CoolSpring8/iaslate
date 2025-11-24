import { useEffect } from "react";

export const useBeforeUnloadGuard = (shouldBlock: boolean) => {
	useEffect(() => {
		if (!shouldBlock) {
			return;
		}
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!shouldBlock) {
				return;
			}
			event.preventDefault();
			event.returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [shouldBlock]);
};
