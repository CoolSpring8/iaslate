import { Textarea, UnstyledButton } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { twJoin } from "tailwind-merge";
import { useImmer } from "use-immer";
import type { Message, MessageContent, MessageContentPart } from "../types";
import MessageItem from "./MessageItem";

interface ChatViewProps {
	messages: Message[];
	isGenerating: boolean;
	editingMessageId?: string;
	onSend: (prompt: MessageContent) => Promise<void> | void;
	onStop: () => void;
	onDeleteMessage: (nodeId: string) => void;
	onDetachMessage: (nodeId: string) => void;
	onEditStart: (nodeId: string) => void;
	onEditSubmit: (
		nodeId: string,
		content: MessageContent,
	) => Promise<void> | void;
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
	const [attachments, setAttachments] = useImmer<MessageContentPart[]>([]);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const isComposing = useRef(false);

	const splitContent = useCallback((content: MessageContent) => {
		if (typeof content === "string") {
			return { text: content, images: [] as MessageContentPart[] };
		}
		return {
			text: content
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join("\n\n"),
			images: content.filter((part) => part.type === "image"),
		};
	}, []);

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
			prompt.trim().length > 0 ||
				attachments.length > 0 ||
				typeof editingMessageId !== "undefined",
		);
		return () => {
			onPromptDirtyChange?.(false);
		};
	}, [attachments.length, editingMessageId, onPromptDirtyChange, prompt]);

	useEffect(() => {
		if (typeof resetSignal !== "undefined") {
			setPrompt("");
			setAttachments([]);
		}
	}, [resetSignal, setAttachments, setPrompt]);

	useEffect(() => {
		if (editingMessageId && editingMessage) {
			const { text, images } = splitContent(editingMessage.content);
			setPrompt(text);
			setAttachments(images);
		}
	}, [
		editingMessage?.content,
		editingMessageId,
		setAttachments,
		setPrompt,
		splitContent,
	]);

	const buildMessageContent = useCallback((): MessageContent => {
		const parts: MessageContentPart[] = [];
		if (prompt.trim().length > 0) {
			parts.push({ type: "text", text: prompt });
		}
		if (attachments.length > 0) {
			parts.push(...attachments);
		}
		if (parts.length === 0) {
			return "";
		}
		const [firstPart] = parts;
		if (parts.length === 1 && firstPart?.type === "text") {
			return firstPart.text;
		}
		return parts;
	}, [attachments, prompt]);

	const addImageAttachment = useCallback(
		(dataUrl: string, mimeType?: string) => {
			setAttachments((draft) => {
				draft.push({ type: "image", image: dataUrl, mimeType });
			});
		},
		[setAttachments],
	);

	const handleFileInput = useCallback(
		async (file: File) => {
			if (file.type.startsWith("image/")) {
				const reader = new FileReader();
				reader.onload = () => {
					const result = typeof reader.result === "string" ? reader.result : "";
					if (result) {
						addImageAttachment(result, file.type);
					}
				};
				reader.readAsDataURL(file);
				return;
			}
			const content = await file.text();
			setPrompt((draft) => draft + content);
		},
		[addImageAttachment, setPrompt],
	);

	const handleSubmit = () => {
		if (isGenerating) {
			onStop();
			return;
		}
		const nextContent = buildMessageContent();
		if (editingMessageId) {
			onEditSubmit(editingMessageId, nextContent);
			setPrompt("");
			setAttachments([]);
			return;
		}
		onSend(nextContent);
		setPrompt("");
		setAttachments([]);
	};

	return (
		<div className="flex flex-col h-full min-h-0">
			<div
				className="flex-1 min-h-0 overflow-y-auto px-4 py-2"
				onDrop={async (event) => {
					event.preventDefault();
					const files = event.dataTransfer.files;
					if (files && files.length > 0) {
						for (const file of Array.from(files)) {
							await handleFileInput(file);
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
						onClick={() => {
							fileInputRef.current?.click();
						}}
						title="Attach image"
					>
						<div className="i-lucide-image w-4 h-4" />
					</UnstyledButton>
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
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={(event) => {
						const { files } = event.target;
						if (files) {
							for (const file of Array.from(files)) {
								void handleFileInput(file);
							}
							event.target.value = "";
						}
					}}
				/>
				{attachments.length > 0 && (
					<div className="mt-2 flex flex-wrap gap-2">
						{attachments.map((attachment, index) =>
							attachment.type === "image" ? (
								<div
									key={`${attachment.image}-${index}`}
									className="relative h-16 w-16 overflow-hidden rounded border"
								>
									<img
										src={attachment.image}
										alt="User attachment"
										className="h-full w-full object-cover"
									/>
									<UnstyledButton
										className="absolute right-1 top-1 h-5 w-5 rounded-full bg-white/80 text-slate-700 hover:bg-white"
										onClick={() => {
											setAttachments((draft) => {
												draft.splice(index, 1);
											});
										}}
										title="Remove attachment"
									>
										<div className="i-lucide-x w-4 h-4" />
									</UnstyledButton>
								</div>
							) : null,
						)}
					</div>
				)}
				{editingMessage && (
					<div className="absolute left-4 -top-8 h-8 w-[calc(100%-2rem)] rounded bg-orange-300 p-2 flex items-center text-slate-700 text-sm">
						<div className="i-lucide-edit flex-none" />
						<p className="ml-1 line-clamp-1">
							Editing:{" "}
							{splitContent(editingMessage.content).text || "(image content)"}
						</p>
						<UnstyledButton
							className="i-lucide-x ml-auto flex-none"
							onClick={() => {
								onEditCancel();
								setPrompt("");
								setAttachments([]);
							}}
						/>
					</div>
				)}
			</div>
		</div>
	);
};

export default ChatView;
