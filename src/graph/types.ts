export type NodeID = string;
export type EdgeID = string;
export type EdgeKind = "sequence";

export interface GraphNode {
	id: NodeID;
	role: "system" | "user" | "assistant" | "tool";
	text: string;
	createdAt: number;
	status?: "draft" | "streaming" | "final" | "error";
}

export interface GraphEdge {
	id: EdgeID;
	from: NodeID;
	to: NodeID;
	kind: EdgeKind;
}

export interface ConversationGraph {
	nodes: Record<NodeID, GraphNode>;
	edges: Record<EdgeID, GraphEdge>;
	roots: NodeID[];
}
