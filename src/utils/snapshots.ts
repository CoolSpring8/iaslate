import type { ConversationSnapshot } from "../tree/types";

export const exportSnapshotToFile = (snapshot: ConversationSnapshot) => {
	const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	const safeTimestamp = snapshot.exportedAt.replace(/[:]/g, "-");
	anchor.href = url;
	anchor.download = `iaslate_tree_${safeTimestamp}.json`;
	anchor.click();
	URL.revokeObjectURL(url);
};

export const parseSnapshotFile = async (
	file: File,
): Promise<ConversationSnapshot> => {
	const fileContents = await file.text();
	return JSON.parse(fileContents) as ConversationSnapshot;
};
