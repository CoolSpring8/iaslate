import { Textarea, UnstyledButton } from "@mantine/core";
import { useEffect, useMemo, useRef } from "react";
import { twJoin } from "tailwind-merge";
import { useImmer } from "use-immer";
import type { Message } from "../types";
import MessageItem from "./MessageItem";

interface ChatViewProps {
	messages: Message[];
	isGenerating: boolean;
	editingMessageId?: string;
	onSend: (prompt: string) => Promise<void> | void;
	onStop: () => void;
	onDeleteMessage: (nodeId: string) => void;
	onDetachMessage: (nodeId: string) => void;
	onEditStart: (nodeId: string) => void;
	onEditSubmit: (nodeId: string, text: string) => Promise<void> | void;
	onEditCancel: () => void;
	onPromptDirtyChange?: (dirty: boolean) => void;
	resetSignal?: number;
}

const ChatView = ({
	messages,
	isGenerating,
	editingMessageId,
	onSend,
	onStop,
	onDeleteMessage,
	onDetachMessage,
	onEditStart,
	onEditSubmit,
	onEditCancel,
	onPromptDirtyChange,
	resetSignal,
}: ChatViewProps) => {
	const [prompt, setPrompt] = useImmer("");
	const isComposing = useRef(false);

	const editingMessage = useMemo(
		() =>
			editingMessageId
				? messages.find(
						(message) => message._metadata.uuid === editingMessageId,
					)
				: undefined,
		[editingMessageId, messages],
	);

	useEffect(() => {
		onPromptDirtyChange?.(
			prompt.trim().length > 0 || typeof editingMessageId !== "undefined",
		);
		return () => {
			onPromptDirtyChange?.(false);
		};
	}, [editingMessageId, onPromptDirtyChange, prompt]);

	useEffect(() => {
		if (typeof resetSignal !== "undefined") {
			setPrompt("");
		}
	}, [resetSignal, setPrompt]);

	useEffect(() => {
		if (editingMessageId && editingMessage) {
			setPrompt(editingMessage.content);
		}
	}, [editingMessage?.content, editingMessageId, setPrompt]);

	const handleSubmit = () => {
		if (isGenerating) {
			onStop();
			return;
		}
		if (editingMessageId) {
			onEditSubmit(editingMessageId, prompt);
			setPrompt("");
			return;
		}
		onSend(prompt);
		setPrompt("");
	};

	return (
		<div className="flex flex-col h-full min-h-0">
			<div
				className="flex-1 min-h-0 overflow-y-auto px-4 py-2"
				onDrop={async (event) => {
					event.preventDefault();
					if (event.dataTransfer.items) {
						for (const item of event.dataTransfer.items) {
							if (item.kind === "file") {
								const file = item.getAsFile();
								if (file) {
									const content = await file.text();
									setPrompt((draft) => draft + content);
								}
							}
						}
					}
				}}
				onDragOver={(event) => {
					event.preventDefault();
				}}
			>
				{messages.map((message, index) => (
					<MessageItem
						key={message._metadata.uuid}
						message={message}
						isEditing={editingMessageId === message._metadata.uuid}
						isLast={index === messages.length - 1}
						isGenerating={isGenerating}
						onEdit={() => onEditStart(message._metadata.uuid)}
						onDelete={() => onDeleteMessage(message._metadata.uuid)}
						onDetach={() => onDetachMessage(message._metadata.uuid)}
					/>
				))}
			</div>
			<div className="relative px-4 py-2">
				<div className="flex items-center">
					<Textarea
						className="w-full"
						minRows={1}
						maxRows={5}
						placeholder="Type your message..."
						value={prompt}
						onChange={(event) => {
							setPrompt(event.target.value);
						}}
						onCompositionStart={() => {
							isComposing.current = true;
						}}
						onCompositionEnd={() => {
							isComposing.current = false;
						}}
						onKeyDown={(event) => {
							if (
								event.key === "Enter" &&
								!event.shiftKey &&
								!event.nativeEvent.isComposing &&
								!isComposing.current
							) {
								event.preventDefault();
								handleSubmit();
							}
						}}
					/>
					<UnstyledButton
						className="ml-2 border rounded-full w-8 h-8 flex items-center justify-center"
						onClick={handleSubmit}
					>
						<div
							className={twJoin(
								"w-4 h-4",
								editingMessageId
									? "i-lucide-check"
									: "i-lucide-send-horizontal",
								isGenerating ? "animate-spin" : "",
							)}
						/>
					</UnstyledButton>
				</div>
				{editingMessage && (
					<div className="absolute left-4 -top-8 h-8 w-[calc(100%-2rem)] rounded bg-orange-300 p-2 flex items-center text-slate-700 text-sm">
						<div className="i-lucide-edit flex-none" />
						<p className="ml-1 line-clamp-1">
							Editing: {editingMessage.content}
						</p>
						<UnstyledButton
							className="i-lucide-x ml-auto flex-none"
							onClick={() => {
								onEditCancel();
								setPrompt("");
							}}
						/>
					</div>
				)}
			</div>
		</div>
	);
};

export default ChatView;
