import type { ChangeEvent, ReactNode } from "react";
import { useRef } from "react";
import { toast } from "sonner";
import type { ConversationSnapshot } from "../tree/types";
import { exportSnapshotToFile, parseSnapshotFile } from "../utils/snapshots";

interface SnapshotIOProps {
	exportSnapshot: () => ConversationSnapshot;
	importSnapshot: (snapshot: ConversationSnapshot) => void;
	onImportStart?: () => void;
	children: (actions: {
		triggerImport: () => void;
		triggerExport: () => void;
	}) => ReactNode;
}

const SnapshotIO = ({
	exportSnapshot,
	importSnapshot,
	onImportStart,
	children,
}: SnapshotIOProps) => {
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const handleExport = () => {
		const snapshot = exportSnapshot();
		exportSnapshotToFile(snapshot);
		toast.success("Exported conversation tree");
	};

	const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			event.target.value = "";
			return;
		}
		try {
			const snapshot = await parseSnapshotFile(file);
			onImportStart?.();
			importSnapshot(snapshot);
			toast.success("Conversation imported");
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error
					? error.message
					: "Failed to import conversation";
			toast.error(`Import failed: ${message}`);
		} finally {
			event.target.value = "";
		}
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				accept="application/json"
				className="hidden"
				onChange={handleImportFile}
				aria-hidden="true"
				tabIndex={-1}
			/>
			{children({
				triggerImport: handleImportClick,
				triggerExport: handleExport,
			})}
		</>
	);
};

export default SnapshotIO;
