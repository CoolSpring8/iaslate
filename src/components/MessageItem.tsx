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
				"mb-2 hover:bg-slate-50",
				isEditing && "bg-sky-100 opacity-50",
			)}
			onMouseOver={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
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
					</>
				)}
			</div>
			<div className="twp prose prose-p:whitespace-pre-wrap">
				<Markdown remarkPlugins={[]}>
					{`${message.content}${isLast && isGenerating ? "▪️" : ""}`}
				</Markdown>
			</div>
		</div>
	);
};

export default MessageItem;
