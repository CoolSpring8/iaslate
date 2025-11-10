import { ContextMenu } from "@base-ui-components/react/context-menu";
import type { ReactNode } from "react";

interface NodeContextMenuProps {
	targetId: string | null;
	onClose: () => void;
	onBranch?: (nodeId: string) => void;
	onDuplicate?: (nodeId: string) => void;
	onRemove?: (nodeId: string) => void;
	children: ReactNode;
}

const menuItemClassName =
	"flex cursor-default select-none items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-800 outline-none transition-colors duration-75 data-[highlighted]:bg-slate-900 data-[highlighted]:text-slate-50";

const NodeContextMenu = ({
	targetId,
	onClose,
	onBranch,
	onDuplicate,
	onRemove,
	children,
}: NodeContextMenuProps) => {
	const open = Boolean(targetId);

	const invoke = (callback?: (nodeId: string) => void) => () => {
		if (!targetId) {
			return;
		}
		callback?.(targetId);
		onClose();
	};

	return (
		<ContextMenu.Root
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					onClose();
				}
			}}
		>
			<ContextMenu.Trigger className="block h-full w-full">
				{children}
			</ContextMenu.Trigger>
			<ContextMenu.Portal>
				<ContextMenu.Positioner className="outline-none">
					<ContextMenu.Popup className="origin-[var(--transform-origin)] min-w-[8rem] rounded-xl border border-slate-300 bg-white p-0.5 shadow-[0_12px_40px_rgba(15,23,42,0.25)] transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:shadow-[0_18px_45px_rgba(0,0,0,0.55)]">
						<ContextMenu.Item
							className={menuItemClassName}
							onClick={invoke(onBranch)}
						>
							<span>Branch from here</span>
						</ContextMenu.Item>
						<ContextMenu.Item
							className={menuItemClassName}
							onClick={invoke(onDuplicate)}
						>
							<span>Duplicate here</span>
						</ContextMenu.Item>
						<ContextMenu.Separator className="mx-2 my-1 h-px bg-slate-200 dark:bg-slate-700" />
						<ContextMenu.Item
							className={`${menuItemClassName} text-rose-600 data-[highlighted]:text-white`}
							onClick={invoke(onRemove)}
						>
							<span>Remove node</span>
						</ContextMenu.Item>
					</ContextMenu.Popup>
				</ContextMenu.Positioner>
			</ContextMenu.Portal>
		</ContextMenu.Root>
	);
};

export default NodeContextMenu;
