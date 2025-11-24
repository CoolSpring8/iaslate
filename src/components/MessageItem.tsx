import { Button, Popover, Text, UnstyledButton } from "@mantine/core";
import { useState } from "react";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { twJoin } from "tailwind-merge";
import type { Message, MessageContentPart } from "../types";

interface MessageItemProps {
	message: Message;
	isEditing: boolean;
	isLast: boolean;
	isGenerating: boolean;
	onEdit: () => void;
	onDelete: () => void;
	onDetach: () => void;
}

const MessageItem = ({
	message,
	isEditing,
	isLast,
	isGenerating,
	onEdit,
	onDelete,
	onDetach,
}: MessageItemProps) => {
	const [isHovered, setIsHovered] = useState(false);
	const [hasBeenClicked, setHasBeenClicked] = useState(false);
	const [isReasoningExpanded, setIsReasoningExpanded] = useState(true);
	const reasoningText = message.reasoning_content?.trim();
	const contentParts: MessageContentPart[] =
		typeof message.content === "string"
			? message.content.length > 0
				? [{ type: "text", text: message.content } satisfies MessageContentPart]
				: []
			: message.content;

	const handleCopy = async () => {
		try {
			const copyText = contentParts
				.map((part) =>
					part.type === "text" ? part.text : "[image attachment]",
				)
				.join("\n\n");
			await navigator.clipboard.writeText(copyText);
			toast("Copied to clipboard", {
				position: "top-center",
			});
		} catch (error) {
			toast("Failed to copy to clipboard");
		}
	};

	return (
		<div
			className={twJoin(
				"mb-2 w-full hover:bg-slate-50",
				isEditing && "bg-sky-100 opacity-50",
			)}
			onMouseOver={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div className="w-full max-w-[65ch]">
				<div className="flex items-center gap-2">
					<p
						className="my-0 font-bold"
						onClick={() => {
							setHasBeenClicked((value) => !value);
						}}
					>
						{message.role}
					</p>
					{(hasBeenClicked || isHovered) && (
						<>
							<UnstyledButton
								className="i-lucide-copy text-slate-400 hover:text-slate-600 transition"
								onClick={handleCopy}
								title="Copy message content"
							/>
							<UnstyledButton
								className="i-lucide-edit text-slate-400 hover:text-slate-600 transition"
								onClick={onEdit}
								title="Edit message"
							/>
							<UnstyledButton
								className="i-lucide-unlink text-slate-400 hover:text-slate-600 transition"
								onClick={onDetach}
								title="Move cursor to parent"
							/>
							<Popover width={200} position="bottom" withArrow>
								<Popover.Target>
									<UnstyledButton
										className="i-lucide-trash text-slate-400 hover:text-slate-600 transition"
										title="Delete message"
									/>
								</Popover.Target>
								<Popover.Dropdown>
									<div className="flex flex-col">
										<Text>Delete?</Text>
										<Button
											className="min-w-0 h-auto flex-1 !p-1 text-xs self-end"
											onClick={onDelete}
										>
											Yes
										</Button>
									</div>
								</Popover.Dropdown>
							</Popover>
						</>
					)}
				</div>
				{reasoningText && (
					<div className="mb-2 rounded-md border border-slate-200">
						<UnstyledButton
							className="flex w-full items-center gap-2 px-2 pt-1 text-sm font-semibold text-slate-600"
							onClick={() => setIsReasoningExpanded((value) => !value)}
							aria-expanded={isReasoningExpanded}
						>
							<div
								className={twJoin(
									"i-lucide-chevron-down transition-transform",
									isReasoningExpanded && "rotate-180",
								)}
							/>
							<span>Reasoning</span>
						</UnstyledButton>
						{isReasoningExpanded && (
							<div className="twp prose prose-p:whitespace-pre-wrap px-2 pt-1 pb-3 text-sm text-slate-500">
								<Markdown remarkPlugins={[]}>{reasoningText}</Markdown>
							</div>
						)}
					</div>
				)}
				<div className="twp prose prose-p:whitespace-pre-wrap">
					{contentParts.map((part, index) =>
						part.type === "text" ? (
							<Markdown
								key={`${message._metadata.uuid}-text-${index}`}
								remarkPlugins={[]}
							>
								{`${part.text}${
									isLast && isGenerating && index === contentParts.length - 1
										? "▪️"
										: ""
								}`}
							</Markdown>
						) : (
							<div
								key={`${message._metadata.uuid}-image-${index}`}
								className="mt-2"
							>
								<img
									src={part.image}
									alt="User provided"
									className="max-h-64 rounded border"
								/>
							</div>
						),
					)}
				</div>
			</div>
		</div>
	);
};

export default MessageItem;
