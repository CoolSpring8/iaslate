import { Button, Popover, Text, UnstyledButton } from "@mantine/core";
import { useState } from "react";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { twJoin } from "tailwind-merge";
import type { Message } from "../types";

interface MessageItemProps {
	message: Message;
	isEditing: boolean;
	isLast: boolean;
	isGenerating: boolean;
	onEdit: () => void;
	onDelete: () => void;
	onDetach: () => void;
	onBranch: () => void;
}

const MessageItem = ({
	message,
	isEditing,
	isLast,
	isGenerating,
	onEdit,
	onDelete,
	onDetach,
	onBranch,
}: MessageItemProps) => {
	const [isHovered, setIsHovered] = useState(false);
	const [hasBeenClicked, setHasBeenClicked] = useState(false);
	const [isReasoningExpanded, setIsReasoningExpanded] = useState(true);
	const reasoningText = message.reasoning_content?.trim();

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(message.content);
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
							/>
							<UnstyledButton
								className="i-lucide-edit text-slate-400 hover:text-slate-600 transition"
								onClick={onEdit}
							/>
							<Popover width={200} position="bottom" withArrow>
								<Popover.Target>
									<UnstyledButton className="i-lucide-trash text-slate-400 hover:text-slate-600 transition" />
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
							<UnstyledButton
								className="i-lucide-unlink text-slate-400 hover:text-slate-600 transition"
								onClick={onDetach}
							/>
							<UnstyledButton
								className="i-lucide-git-branch-plus text-slate-400 hover:text-slate-600 transition"
								title="Branch from here"
								onClick={onBranch}
							/>
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
					<Markdown remarkPlugins={[]}>
						{`${message.content}${isLast && isGenerating ? "▪️" : ""}`}
					</Markdown>
				</div>
			</div>
		</div>
	);
};

export default MessageItem;
