import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import type { Message } from "../types";
import type {
	ConversationSnapshot,
	ConversationTree,
	NodeID,
	TreeEdge,
	TreeNode,
} from "./types";

interface TreeState extends ConversationTree {
	activeTargetId?: NodeID;
	isEmpty: () => boolean;
	syncLinearTail: (messages: Message[]) => void;
	splitBranch: (childId: NodeID) => void;
	compilePathTo: (target: NodeID) => Message[];
	compileActive: () => Message[];
	tracePathIds: (target: NodeID) => NodeID[];
	getActivePathIds: () => NodeID[];
	setActiveTarget: (id: NodeID | undefined) => void;
	findPredecessor: (toId: NodeID) => NodeID | undefined;
	createSystemMessage: (text: string) => NodeID;
	activeTail: () => NodeID | undefined;
	createUserAfter: (parentId: NodeID | undefined, text: string) => NodeID;
	createAssistantAfter: (parentId: NodeID) => NodeID;
	appendToNode: (
		nodeId: NodeID,
		delta: { content?: string; reasoning?: string },
	) => void;
	setNodeText: (nodeId: NodeID, text: string) => void;
	setNodeStatus: (
		nodeId: NodeID,
		status: "draft" | "streaming" | "final" | "error",
	) => void;
	predecessorOf: (nodeId: NodeID) => NodeID | undefined;
	canReparent: (parentId: NodeID, childId: NodeID) => boolean;
	reparentNode: (nodeId: NodeID, nextParentId: NodeID) => void;
	cloneNode: (sourceId: NodeID) => NodeID | undefined;
	removeNode: (id: NodeID) => void;
	reset: () => void;
	exportSnapshot: () => ConversationSnapshot;
	importSnapshot: (snapshot: ConversationSnapshot) => void;
}

type TreeExtras = Partial<Omit<TreeState, keyof ConversationTree>>;

type NodeMap = Record<NodeID, TreeNode>;

const coerceRole = (role: string): TreeNode["role"] => {
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
	const edges: Record<string, TreeEdge> = {};
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

const withDerivedTree = (nodes: NodeMap, extras: TreeExtras = {}) => {
	const { edges, roots } = deriveStructure(nodes);
	return {
		nodes,
		edges,
		roots,
		...extras,
	} satisfies Partial<TreeState>;
};

const buildChildrenIndex = (nodes: NodeMap) => {
	const map = new Map<NodeID, TreeNode[]>();
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

const pickNewestNode = (nodes: TreeNode[]) => {
	return nodes.reduce<TreeNode | undefined>((latest, node) => {
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

const toMessage = (node: TreeNode): Message => ({
	role: node.role,
	content: node.text,
	reasoning_content: node.reasoningContent,
	_metadata: { uuid: node.id },
});

const buildPathIds = (nodes: NodeMap, target: NodeID): NodeID[] => {
	if (!nodes[target]) {
		return [];
	}
	const path: NodeID[] = [];
	const visited = new Set<NodeID>();
	let cursor: NodeID | null = target;
	while (cursor !== null) {
		const currentId: NodeID = cursor;
		if (!nodes[currentId] || visited.has(currentId)) {
			break;
		}
		visited.add(currentId);
		path.push(currentId);
		cursor = nodes[currentId]?.parentId ?? null;
	}
	path.reverse();
	return path;
};

export const useConversationTree = create<TreeState>((set, get) => ({
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
					reasoningContent: message.reasoning_content,
					createdAt: existing?.createdAt ?? Date.now(),
					status: existing?.status,
					parentId,
				} satisfies TreeNode;
				parentId = id;
			}
			return withDerivedTree(nodes);
		}),
	setActiveTarget: (id) => set({ activeTargetId: id }),
	splitBranch: (childId) =>
		set((state) => {
			const target = state.nodes[childId];
			if (!target || !target.parentId) {
				return state;
			}
			const nodes: NodeMap = {
				...state.nodes,
				[childId]: { ...target, parentId: null },
			};
			return withDerivedTree(nodes);
		}),
	compilePathTo: (target) => {
		const { nodes } = get();
		const pathIds = buildPathIds(nodes, target);
		return pathIds.map((id) => {
			const node = nodes[id];
			return toMessage(node);
		});
	},
	compileActive: () => {
		const { getActivePathIds, nodes } = get();
		const pathIds = getActivePathIds();
		return pathIds.map((id) => {
			const node = nodes[id];
			return toMessage(node);
		});
	},
	tracePathIds: (target) => {
		const { nodes } = get();
		return buildPathIds(nodes, target);
	},
	getActivePathIds: () => {
		const { nodes, activeTargetId } = get();
		const fallbackId = activeTargetId ?? pickNewestLeafId(nodes);
		return fallbackId ? buildPathIds(nodes, fallbackId) : [];
	},
	findPredecessor: (toId) => get().nodes[toId]?.parentId ?? undefined,
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
			return withDerivedTree(nodes);
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
			return withDerivedTree(nodes);
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
					reasoningContent: undefined,
					createdAt: Date.now(),
					status: "draft",
					parentId,
				},
			};
			return withDerivedTree(nodes);
		});
		return newId;
	},
	appendToNode: (nodeId, delta) =>
		set((state) => {
			const node = state.nodes[nodeId];
			if (!node) {
				return state;
			}
			const nextContent =
				typeof delta.content === "string"
					? `${node.text}${delta.content}`
					: node.text;
			const nextReasoning =
				typeof delta.reasoning === "string"
					? `${node.reasoningContent ?? ""}${delta.reasoning}`
					: node.reasoningContent;
			const nodes: NodeMap = {
				...state.nodes,
				[nodeId]: {
					...node,
					text: nextContent,
					reasoningContent: nextReasoning,
				},
			};
			return { nodes } satisfies Partial<TreeState>;
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
			return { nodes } satisfies Partial<TreeState>;
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
			return { nodes } satisfies Partial<TreeState>;
		}),
	predecessorOf: (nodeId) => get().nodes[nodeId]?.parentId ?? undefined,
	canReparent: (parentId, childId) => {
		const { nodes } = get();
		if (!nodes[parentId] || !nodes[childId] || parentId === childId) {
			return false;
		}
		return !isAncestor(nodes, childId, parentId);
	},
	reparentNode: (target, nextParent) =>
		set((state) => {
			if (!state.nodes[target] || !state.nodes[nextParent]) {
				return state;
			}
			if (
				nextParent === target ||
				isAncestor(state.nodes, target, nextParent)
			) {
				return state;
			}
			const nodes: NodeMap = {
				...state.nodes,
				[target]: {
					...state.nodes[target],
					parentId: nextParent,
				},
			};
			return withDerivedTree(nodes);
		}),
	cloneNode: (sourceId) => {
		const source = get().nodes[sourceId];
		if (!source) {
			return undefined;
		}
		const newId = uuidv4();
		set((state) => {
			const nodes: NodeMap = {
				...state.nodes,
				[newId]: {
					id: newId,
					role: source.role,
					text: source.text,
					reasoningContent: source.reasoningContent,
					createdAt: Date.now(),
					parentId: source.parentId ?? null,
				},
			};
			return withDerivedTree(nodes);
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
			return withDerivedTree(nodes, {
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
				reasoningContent: node.reasoningContent,
				createdAt,
				status: node.status,
				parentId,
			} satisfies TreeNode;
		}
		set(
			withDerivedTree(nodes, {
				activeTargetId:
					snapshot.activeTargetId && nodes[snapshot.activeTargetId]
						? snapshot.activeTargetId
						: undefined,
			}),
		);
	},
}));

export const useConversationGraph = useConversationTree;
