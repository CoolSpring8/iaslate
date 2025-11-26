export type NodeID = string;
export type EdgeID = string;
export type EdgeKind = "sequence";

export interface TreeNode {
	id: NodeID;
	role: "system" | "user" | "assistant" | "tool";
	content: import("../types").MessageContent;
	reasoningContent?: string;
	createdAt: number;
	status?: "draft" | "streaming" | "final" | "error";
	parentId: NodeID | null;
}

export interface TreeEdge {
	id: EdgeID;
	from: NodeID;
	to: NodeID;
	kind: EdgeKind;
}

export interface ConversationTree {
	nodes: Record<NodeID, TreeNode>;
	edges: Record<EdgeID, TreeEdge>;
	roots: NodeID[];
}

export interface ConversationSnapshotV2 {
	version: 2;
	exportedAt: string;
	tree: {
		nodes: Record<NodeID, TreeNode>;
	};
	activeTargetId?: NodeID;
}

export type ConversationSnapshot = ConversationSnapshotV2;
