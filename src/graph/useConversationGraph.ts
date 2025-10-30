import { create } from "zustand";
import type { Message } from "../types";
import type { ConversationGraph, GraphEdge, GraphNode, NodeID } from "./types";

interface GraphState extends ConversationGraph {
	blockedEdges: Set<string>;
	isEmpty: () => boolean;
	syncLinearTail: (messages: Message[]) => void;
	detachBetween: (from: NodeID, to: NodeID) => void;
	compilePathTo: (target: NodeID) => Message[];
	removeNode: (id: NodeID) => void;
	reset: () => void;
}

const coerceRole = (role: string): GraphNode["role"] => {
	if (
		role === "system" ||
		role === "user" ||
		role === "assistant" ||
		role === "tool"
	) {
		return role;
	}
	return "assistant";
};

const recomputeRoots = (
	nodes: Record<NodeID, GraphNode>,
	edges: Record<string, GraphEdge>,
) => {
	const incoming = new Map<NodeID, number>();
	for (const edge of Object.values(edges)) {
		incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
	}
	return Object.keys(nodes).filter((id) => (incoming.get(id) ?? 0) === 0);
};

export const useConversationGraph = create<GraphState>((set, get) => ({
	nodes: {},
	edges: {},
	roots: [],
	blockedEdges: new Set(),
	isEmpty: () => Object.keys(get().nodes).length === 0,
	syncLinearTail: (messages) =>
		set((state) => {
			const nodes = { ...state.nodes };
			const edges = { ...state.edges };
			const blocked = new Set(state.blockedEdges);

			let previousId: string | null = null;
			for (const message of messages) {
				const id = message._metadata.uuid;
				const nextRole = coerceRole(message.role);
				const existing = nodes[id];
				if (!existing) {
					nodes[id] = {
						id,
						role: nextRole,
						text: message.content,
						createdAt: Date.now(),
					};
				} else if (
					existing.text !== message.content ||
					existing.role !== nextRole
				) {
					nodes[id] = { ...existing, text: message.content, role: nextRole };
				}

				if (previousId) {
					const edgeId = `${previousId}->${id}`;
					if (!edges[edgeId] && !blocked.has(edgeId)) {
						edges[edgeId] = {
							id: edgeId,
							from: previousId,
							to: id,
							kind: "sequence",
						};
					}
				}
				previousId = id;
			}

			const roots = recomputeRoots(nodes, edges);
			return { nodes, edges, roots, blockedEdges: blocked };
		}),
	detachBetween: (from, to) =>
		set((state) => {
			const edges = { ...state.edges };
			const key = `${from}->${to}`;
			if (edges[key]) {
				delete edges[key];
			}
			const blocked = new Set(state.blockedEdges);
			blocked.add(key);
			const roots = recomputeRoots(state.nodes, edges);
			return { edges, roots, blockedEdges: blocked };
		}),
	compilePathTo: (target) => {
		const { nodes, edges } = get();
		if (!nodes[target]) {
			return [];
		}

		const byTo = new Map<NodeID, GraphEdge[]>();
		for (const edge of Object.values(edges)) {
			const existing = byTo.get(edge.to) ?? [];
			existing.push(edge);
			byTo.set(edge.to, existing);
		}

		const path: NodeID[] = [];
		const seen = new Set<NodeID>();
		let current: NodeID | undefined = target;
		while (current && !seen.has(current)) {
			seen.add(current);
			path.push(current);
			const incoming = byTo.get(current) ?? [];
			if (incoming.length === 0) {
				break;
			}
			current = incoming[0].from;
		}
		path.reverse();

		return path.map((id) => {
			const node = nodes[id];
			return {
				role: node.role,
				content: node.text,
				_metadata: { uuid: node.id },
			};
		});
	},
	removeNode: (id) =>
		set((state) => {
			if (!state.nodes[id]) {
				return state;
			}
			const nodes = { ...state.nodes };
			delete nodes[id];

			const edges = { ...state.edges };
			for (const edge of Object.values(edges)) {
				if (edge.from === id || edge.to === id) {
					delete edges[edge.id];
				}
			}

			const blocked = new Set(state.blockedEdges);
			for (const entry of blocked) {
				if (entry.startsWith(`${id}->`) || entry.endsWith(`->${id}`)) {
					blocked.delete(entry);
				}
			}

			const roots = recomputeRoots(nodes, edges);
			return { nodes, edges, roots, blockedEdges: blocked };
		}),
	reset: () =>
		set({
			nodes: {},
			edges: {},
			roots: [],
			blockedEdges: new Set(),
		}),
}));
