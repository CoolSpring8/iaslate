import { useEffect } from "react";

interface UseEnsureSystemMessageOptions {
	isTreeEmpty: () => boolean;
	chatMessagesLength: number;
	createSystemMessage: (text: string) => string;
	setActiveTarget: (id: string) => void;
	defaultSystemPrompt: string;
}

export const useEnsureSystemMessage = ({
	isTreeEmpty,
	chatMessagesLength,
	createSystemMessage,
	setActiveTarget,
	defaultSystemPrompt,
}: UseEnsureSystemMessageOptions) => {
	useEffect(() => {
		if (isTreeEmpty() && chatMessagesLength === 0) {
			const systemId = createSystemMessage(defaultSystemPrompt);
			setActiveTarget(systemId);
		}
	}, [
		chatMessagesLength,
		createSystemMessage,
		defaultSystemPrompt,
		isTreeEmpty,
		setActiveTarget,
	]);
};
