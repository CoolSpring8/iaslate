import { v4 as uuidv4 } from "uuid";
import { createWithEqualityFn } from "zustand/traditional";
import type {
	Message,
	MessageContent,
	MessageContentPart,
	TokenLogprob,
} from "../types";
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
	createUserAfter: (
		parentId: NodeID | undefined,
		content: MessageContent,
	) => NodeID;
	createAssistantAfter: (parentId: NodeID) => NodeID;
	appendToNode: (
		nodeId: NodeID,
		delta: {
			content?: string;
			reasoning?: string;
			tokenLogprobs?: TokenLogprob[];
		},
	) => void;
	setNodeText: (
		nodeId: NodeID,
		text: string,
		tokenLogprobs?: TokenLogprob[],
	) => void;
	setNodeStatus: (
		nodeId: NodeID,
		status: "draft" | "streaming" | "final" | "error",
	) => void;
	predecessorOf: (nodeId: NodeID) => NodeID | undefined;
	canReparent: (parentId: NodeID, childId: NodeID) => boolean;
	reparentNode: (nodeId: NodeID, nextParentId: NodeID) => void;
	cloneNode: (sourceId: NodeID) => NodeID | undefined;
	replaceNodeWithEditedClone: (
		nodeId: NodeID,
		updates: {
			content?: MessageContent;
			reasoningContent?: string;
			tokenLogprobs?: TokenLogprob[];
		},
	) => NodeID | undefined;
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
	content: node.content,
	reasoning_content: node.reasoningContent,
	_metadata: {
		uuid: node.id,
		...(node.tokenLogprobs
			? {
					tokenLogprobs: node.tokenLogprobs,
				}
			: {}),
	},
});

const appendTextToContent = (
	content: MessageContent,
	delta: string | undefined,
): MessageContent => {
	if (typeof delta !== "string") {
		return content;
	}
	if (typeof content === "string") {
		return `${content}${delta}`;
	}
	const last = content[content.length - 1];
	if (last && last.type === "text") {
		const nextTail: MessageContentPart = {
			...last,
			text: `${last.text}${delta}`,
		};
		return [...content.slice(0, -1), nextTail];
	}
	return [
		...content,
		{ type: "text", text: delta } satisfies MessageContentPart,
	];
};

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

export const useConversationTree = createWithEqualityFn<TreeState>(
	(set, get) => ({
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
						content: message.content,
						reasoningContent: message.reasoning_content,
						createdAt: existing?.createdAt ?? Date.now(),
						status: existing?.status,
						parentId,
						tokenLogprobs:
							message._metadata.tokenLogprobs ?? existing?.tokenLogprobs,
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
			return pathIds
				.map((id) => nodes[id])
				.filter(Boolean)
				.map((node) => toMessage(node as TreeNode));
		},
		compileActive: () => {
			const { getActivePathIds, nodes } = get();
			const pathIds = getActivePathIds();
			return pathIds
				.map((id) => nodes[id])
				.filter(Boolean)
				.map((node) => toMessage(node as TreeNode));
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
						content: text,
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
			const latest = path[path.length - 1];
			return latest ? latest._metadata.uuid : undefined;
		},
		createUserAfter: (parentId, content) => {
			const newId = uuidv4();
			set((state) => {
				const safeParent = parentId && state.nodes[parentId] ? parentId : null;
				const nodes: NodeMap = {
					...state.nodes,
					[newId]: {
						id: newId,
						role: "user",
						content,
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
						content: "",
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
						? appendTextToContent(node.content, delta.content)
						: node.content;
				const nextReasoning =
					typeof delta.reasoning === "string"
						? `${node.reasoningContent ?? ""}${delta.reasoning}`
						: node.reasoningContent;
				const nextTokenLogprobs =
					delta.tokenLogprobs && delta.tokenLogprobs.length > 0
						? [...(node.tokenLogprobs ?? []), ...delta.tokenLogprobs]
						: node.tokenLogprobs;
				const nodes: NodeMap = {
					...state.nodes,
					[nodeId]: {
						...node,
						content: nextContent,
						reasoningContent: nextReasoning,
						tokenLogprobs: nextTokenLogprobs,
					},
				};
				return { nodes } satisfies Partial<TreeState>;
			}),
		setNodeText: (nodeId, text, tokenLogprobs) =>
			set((state) => {
				const node = state.nodes[nodeId];
				if (!node) {
					return state;
				}
				const nodes: NodeMap = {
					...state.nodes,
					[nodeId]: {
						...node,
						content: text,
						tokenLogprobs,
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
						content: source.content,
						reasoningContent: source.reasoningContent,
						createdAt: Date.now(),
						parentId: source.parentId ?? null,
						status: source.status,
						tokenLogprobs: source.tokenLogprobs,
					},
				};
				return withDerivedTree(nodes);
			});
			return newId;
		},
		replaceNodeWithEditedClone: (nodeId, updates) => {
			let replacementId: NodeID | undefined;
			set((state) => {
				const target = state.nodes[nodeId];
				if (!target) {
					return state;
				}
				const nodes: NodeMap = { ...state.nodes };
				const newId = uuidv4();
				replacementId = newId;
				nodes[newId] = {
					...target,
					id: newId,
					content: updates.content ?? target.content,
					reasoningContent: updates.reasoningContent ?? target.reasoningContent,
					tokenLogprobs: updates.tokenLogprobs ?? target.tokenLogprobs,
					parentId: target.parentId ?? null,
					createdAt: Date.now(),
					status: "final",
				};
				for (const child of Object.values(nodes)) {
					if (child.parentId === nodeId) {
						nodes[child.id] = {
							...child,
							parentId: newId,
						};
					}
				}
				return withDerivedTree(nodes, {
					activeTargetId:
						state.activeTargetId === nodeId ? newId : state.activeTargetId,
				});
			});
			return replacementId;
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
				version: 2,
				exportedAt: new Date().toISOString(),
				tree: {
					nodes,
				},
				activeTargetId: state.activeTargetId,
			} satisfies ConversationSnapshot;
		},
		importSnapshot: (snapshot) => {
			if (snapshot.version !== 2) {
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
					content: node.content ?? "",
					reasoningContent: node.reasoningContent,
					createdAt,
					status: node.status,
					parentId,
					tokenLogprobs: node.tokenLogprobs,
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
	}),
);

export const useConversationGraph = useConversationTree;
