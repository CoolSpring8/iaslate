import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import type { Message } from "../types";
import type {
	ConversationGraph,
	ConversationSnapshot,
	GraphEdge,
	GraphNode,
	NodeID,
} from "./types";

interface GraphState extends ConversationGraph {
	activeTargetId?: NodeID;
	isEmpty: () => boolean;
	syncLinearTail: (messages: Message[]) => void;
	detachBetween: (from: NodeID, to: NodeID) => void;
	compilePathTo: (target: NodeID) => Message[];
	compileActive: () => Message[];
	setActiveTarget: (id: NodeID | undefined) => void;
	findPredecessor: (toId: NodeID) => NodeID | undefined;
	findTailOfThread: (fromId: NodeID) => NodeID;
	createSystemMessage: (text: string) => NodeID;
	activeTail: () => NodeID | undefined;
	createUserAfter: (parentId: NodeID | undefined, text: string) => NodeID;
	createAssistantAfter: (parentId: NodeID) => NodeID;
	appendToNode: (nodeId: NodeID, delta: string) => void;
	setNodeText: (nodeId: NodeID, text: string) => void;
	setNodeStatus: (
		nodeId: NodeID,
		status: "draft" | "streaming" | "final" | "error",
	) => void;
	predecessorOf: (nodeId: NodeID) => NodeID | undefined;
	canConnect: (source: NodeID, target: NodeID) => boolean;
	connectSequence: (source: NodeID, target: NodeID) => void;
	duplicateNodeAfter: (parentId: NodeID) => NodeID | undefined;
	removeNode: (id: NodeID) => void;
	reset: () => void;
	exportSnapshot: () => ConversationSnapshot;
	importSnapshot: (snapshot: ConversationSnapshot) => void;
}

type GraphExtras = Partial<Omit<GraphState, keyof ConversationGraph>>;

type NodeMap = Record<NodeID, GraphNode>;

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

const deriveStructure = (nodes: NodeMap) => {
	const edges: Record<string, GraphEdge> = {};
	const roots: NodeID[] = [];
	for (const node of Object.values(nodes)) {
		if (node.parentId && nodes[node.parentId]) {
			const edgeId = `${node.parentId}->${node.id}`;
			edges[edgeId] = {
				id: edgeId,
				from: node.parentId,
				to: node.id,
				kind: "sequence",
			};
		} else {
			roots.push(node.id);
		}
	}
	return { edges, roots };
};

const withDerivedGraph = (nodes: NodeMap, extras: GraphExtras = {}) => {
	const { edges, roots } = deriveStructure(nodes);
	return {
		nodes,
		edges,
		roots,
		...extras,
	} satisfies Partial<GraphState>;
};

const buildChildrenIndex = (nodes: NodeMap) => {
	const map = new Map<NodeID, GraphNode[]>();
	for (const node of Object.values(nodes)) {
		if (!node.parentId) {
			continue;
		}
		const list = map.get(node.parentId) ?? [];
		list.push(node);
		map.set(node.parentId, list);
	}
	return map;
};

const pickNewestNode = (nodes: GraphNode[]) => {
	return nodes.reduce<GraphNode | undefined>((latest, node) => {
		if (!latest) {
			return node;
		}
		return node.createdAt > latest.createdAt ? node : latest;
	}, undefined);
};

const pickNewestLeafId = (nodes: NodeMap) => {
	const entries = Object.values(nodes);
	if (entries.length === 0) {
		return undefined;
	}
	const childrenIndex = buildChildrenIndex(nodes);
	const leaves = entries.filter(
		(node) => (childrenIndex.get(node.id) ?? []).length === 0,
	);
	const pool = leaves.length > 0 ? leaves : entries;
	return pickNewestNode(pool)?.id;
};

const isAncestor = (nodes: NodeMap, ancestorId: NodeID, nodeId: NodeID) => {
	let cursor: NodeID | null | undefined = nodeId;
	const visited = new Set<NodeID>();
	while (cursor) {
		if (cursor === ancestorId) {
			return true;
		}
		if (visited.has(cursor)) {
			break;
		}
		visited.add(cursor);
		cursor = nodes[cursor]?.parentId ?? null;
	}
	return false;
};

const toMessage = (node: GraphNode): Message => ({
	role: node.role,
	content: node.text,
	_metadata: { uuid: node.id },
});

export const useConversationGraph = create<GraphState>((set, get) => ({
	nodes: {},
	edges: {},
	roots: [],
	activeTargetId: undefined,
	isEmpty: () => Object.keys(get().nodes).length === 0,
	syncLinearTail: (messages) =>
		set((state) => {
			if (messages.length === 0) {
				return state;
			}
			const nodes = { ...state.nodes } satisfies NodeMap;
			let parentId: NodeID | null = null;
			for (const message of messages) {
				const id = message._metadata.uuid;
				const role = coerceRole(message.role);
				const existing = nodes[id];
				nodes[id] = {
					id,
					role,
					text: message.content,
					createdAt: existing?.createdAt ?? Date.now(),
					status: existing?.status,
					parentId,
				} satisfies GraphNode;
				parentId = id;
			}
			return withDerivedGraph(nodes);
		}),
	setActiveTarget: (id) => set({ activeTargetId: id }),
	detachBetween: (from, to) =>
		set((state) => {
			const target = state.nodes[to];
			if (!target || target.parentId !== from) {
				return state;
			}
			const nodes: NodeMap = {
				...state.nodes,
				[to]: { ...target, parentId: null },
			};
			return withDerivedGraph(nodes);
		}),
	compilePathTo: (target) => {
		const { nodes } = get();
		if (!nodes[target]) {
			return [];
		}
		const path: GraphNode[] = [];
		const visited = new Set<NodeID>();
		let cursor: NodeID | null = target;
		while (cursor !== null) {
			const currentId = cursor as NodeID;
			if (visited.has(currentId)) {
				break;
			}
			visited.add(currentId);
			const node: GraphNode | undefined = nodes[currentId];
			if (!node) {
				break;
			}
			path.push(node);
			cursor = node.parentId;
		}
		path.reverse();
		return path.map(toMessage);
	},
	compileActive: () => {
		const { activeTargetId, compilePathTo, nodes } = get();
		if (activeTargetId) {
			return compilePathTo(activeTargetId);
		}
		const fallbackId = pickNewestLeafId(nodes);
		return fallbackId ? compilePathTo(fallbackId) : [];
	},
	findPredecessor: (toId) => get().nodes[toId]?.parentId ?? undefined,
	findTailOfThread: (fromId) => {
		const { nodes } = get();
		if (!nodes[fromId]) {
			return fromId;
		}
		const childrenIndex = buildChildrenIndex(nodes);
		const visited = new Set<NodeID>();
		let cursor = fromId;
		while (nodes[cursor] && !visited.has(cursor)) {
			visited.add(cursor);
			const newestChild = pickNewestNode(childrenIndex.get(cursor) ?? []);
			if (!newestChild) {
				break;
			}
			cursor = newestChild.id;
		}
		return cursor;
	},
	createSystemMessage: (text) => {
		const newId = uuidv4();
		set((state) => {
			const nodes: NodeMap = {
				...state.nodes,
				[newId]: {
					id: newId,
					role: "system",
					text,
					createdAt: Date.now(),
					parentId: null,
				},
			};
			return withDerivedGraph(nodes);
		});
		return newId;
	},
	activeTail: () => {
		const path = get().compileActive();
		if (path.length === 0) {
			return undefined;
		}
		return path[path.length - 1]._metadata.uuid;
	},
	createUserAfter: (parentId, text) => {
		const newId = uuidv4();
		set((state) => {
			const safeParent = parentId && state.nodes[parentId] ? parentId : null;
			const nodes: NodeMap = {
				...state.nodes,
				[newId]: {
					id: newId,
					role: "user",
					text,
					createdAt: Date.now(),
					parentId: safeParent,
				},
			};
			return withDerivedGraph(nodes);
		});
		return newId;
	},
	createAssistantAfter: (parentId) => {
		if (!get().nodes[parentId]) {
			throw new Error(`Parent node ${parentId} not found`);
		}
		const newId = uuidv4();
		set((state) => {
			const nodes: NodeMap = {
				...state.nodes,
				[newId]: {
					id: newId,
					role: "assistant",
					text: "",
					createdAt: Date.now(),
					status: "draft",
					parentId,
				},
			};
			return withDerivedGraph(nodes);
		});
		return newId;
	},
	appendToNode: (nodeId, delta) =>
		set((state) => {
			const node = state.nodes[nodeId];
			if (!node) {
				return state;
			}
			const nodes: NodeMap = {
				...state.nodes,
				[nodeId]: {
					...node,
					text: `${node.text}${delta}`,
				},
			};
			return { nodes } satisfies Partial<GraphState>;
		}),
	setNodeText: (nodeId, text) =>
		set((state) => {
			const node = state.nodes[nodeId];
			if (!node) {
				return state;
			}
			const nodes: NodeMap = {
				...state.nodes,
				[nodeId]: {
					...node,
					text,
				},
			};
			return { nodes } satisfies Partial<GraphState>;
		}),
	setNodeStatus: (nodeId, status) =>
		set((state) => {
			const node = state.nodes[nodeId];
			if (!node) {
				return state;
			}
			const nodes: NodeMap = {
				...state.nodes,
				[nodeId]: {
					...node,
					status,
				},
			};
			return { nodes } satisfies Partial<GraphState>;
		}),
	predecessorOf: (nodeId) => get().nodes[nodeId]?.parentId ?? undefined,
	canConnect: (source, target) => {
		const { nodes } = get();
		if (!nodes[source] || !nodes[target] || source === target) {
			return false;
		}
		return !isAncestor(nodes, target, source);
	},
	connectSequence: (source, target) =>
		set((state) => {
			if (!state.nodes[source] || !state.nodes[target]) {
				return state;
			}
			if (source === target || isAncestor(state.nodes, target, source)) {
				return state;
			}
			const nodes: NodeMap = {
				...state.nodes,
				[target]: { ...state.nodes[target], parentId: source },
			};
			return withDerivedGraph(nodes);
		}),
	duplicateNodeAfter: (parentId) => {
		const parent = get().nodes[parentId];
		if (!parent) {
			return undefined;
		}
		const newId = uuidv4();
		set((state) => {
			const nodes: NodeMap = {
				...state.nodes,
				[newId]: {
					id: newId,
					role: parent.role,
					text: parent.text,
					createdAt: Date.now(),
					parentId,
				},
			};
			return withDerivedGraph(nodes);
		});
		return newId;
	},
	removeNode: (id) =>
		set((state) => {
			const target = state.nodes[id];
			if (!target) {
				return state;
			}
			const childrenIndex = buildChildrenIndex(state.nodes);
			const children = childrenIndex.get(id) ?? [];
			const nodes: NodeMap = { ...state.nodes };
			delete nodes[id];
			for (const child of children) {
				const existing = nodes[child.id];
				if (!existing) {
					continue;
				}
				nodes[child.id] = {
					...existing,
					parentId: target.parentId ?? null,
				};
			}
			const nextActive =
				state.activeTargetId === id
					? target.parentId ?? undefined
					: state.activeTargetId;
			return withDerivedGraph(nodes, {
				activeTargetId: nextActive,
			});
		}),
	reset: () =>
		set({
			nodes: {},
			edges: {},
			roots: [],
			activeTargetId: undefined,
		}),
	exportSnapshot: () => {
		const state = get();
		const nodes = Object.fromEntries(
			Object.entries(state.nodes).map(([id, node]) => [
				id,
				{ ...node, parentId: node.parentId ?? null },
			]),
		);
		return {
			version: 1,
			exportedAt: new Date().toISOString(),
			tree: {
				nodes,
			},
			activeTargetId: state.activeTargetId,
		} satisfies ConversationSnapshot;
	},
	importSnapshot: (snapshot) => {
		if (snapshot.version !== 1) {
			throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
		}
		const nodesRaw = snapshot.tree?.nodes ?? {};
		const nodes: NodeMap = {};
		for (const [id, node] of Object.entries(nodesRaw)) {
			const createdAt =
				typeof node.createdAt === "number" ? node.createdAt : Date.now();
			const parentId =
				node.parentId && nodesRaw[node.parentId] ? node.parentId : null;
			nodes[id] = {
				id,
				role: coerceRole(node.role),
				text: node.text ?? "",
				createdAt,
				status: node.status,
				parentId,
			} satisfies GraphNode;
		}
		set(
			withDerivedGraph(nodes, {
				activeTargetId:
					snapshot.activeTargetId && nodes[snapshot.activeTargetId]
						? snapshot.activeTargetId
						: undefined,
			}),
		);
	},
}));
