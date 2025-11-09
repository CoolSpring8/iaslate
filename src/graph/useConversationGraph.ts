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
	blockedEdges: Set<string>;
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
	findAmbiguousAncestor: (target: NodeID) => NodeID | undefined;
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

const wouldCreateCycle = (
	edges: Record<string, GraphEdge>,
	source: NodeID,
	target: NodeID,
) => {
	if (source === target) {
		return true;
	}
	const visited = new Set<NodeID>();
	const stack: NodeID[] = [target];
	while (stack.length > 0) {
		const current = stack.pop() as NodeID;
		if (current === source) {
			return true;
		}
		if (visited.has(current)) {
			continue;
		}
		visited.add(current);
		for (const edge of Object.values(edges)) {
			if (edge.from === current) {
				stack.push(edge.to);
			}
		}
	}
	return false;
};

export const useConversationGraph = create<GraphState>((set, get) => ({
	nodes: {},
	edges: {},
	roots: [],
	activeTargetId: undefined,
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
	setActiveTarget: (id) => set({ activeTargetId: id }),
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
			const incoming: GraphEdge[] = byTo.get(current) ?? [];
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
	findAmbiguousAncestor: (target) => {
		const { nodes, edges } = get();
		if (!nodes[target]) {
			return undefined;
		}
		const byTo = new Map<NodeID, GraphEdge[]>();
		for (const edge of Object.values(edges)) {
			const existing = byTo.get(edge.to) ?? [];
			existing.push(edge);
			byTo.set(edge.to, existing);
		}
		const seen = new Set<NodeID>();
		let current: NodeID | undefined = target;
		while (current && !seen.has(current)) {
			seen.add(current);
			const incoming: GraphEdge[] = byTo.get(current) ?? [];
			if (incoming.length > 1) {
				return current;
			}
			if (incoming.length === 0) {
				break;
			}
			current = incoming[0].from;
		}
		return undefined;
	},
	compileActive: () => {
		const { activeTargetId, compilePathTo, nodes, edges } = get();
		if (activeTargetId) {
			return compilePathTo(activeTargetId);
		}
		const outDegrees = new Map<NodeID, number>();
		for (const edge of Object.values(edges)) {
			outDegrees.set(edge.from, (outDegrees.get(edge.from) ?? 0) + 1);
		}
		const tails = Object.keys(nodes).filter(
			(id) => (outDegrees.get(id) ?? 0) === 0,
		);
		const fallbackKeys = Object.keys(nodes);
		const fallback =
			tails[0] ?? fallbackKeys[fallbackKeys.length - 1] ?? undefined;
		return fallback ? compilePathTo(fallback) : [];
	},
	findPredecessor: (toId) => {
		const { edges } = get();
		for (const edge of Object.values(edges)) {
			if (edge.to === toId) {
				return edge.from;
			}
		}
		return undefined;
	},
	findTailOfThread: (fromId) => {
		const { edges } = get();
		const nextMap = new Map<NodeID, NodeID>();
		for (const edge of Object.values(edges)) {
			nextMap.set(edge.from, edge.to);
		}
		let current = fromId;
		const visited = new Set<NodeID>();
		while (nextMap.has(current) && !visited.has(current)) {
			visited.add(current);
			current = nextMap.get(current) as NodeID;
		}
		return current;
	},
	activeTail: () => {
		const { compileActive } = get();
		const path = compileActive();
		if (path.length === 0) {
			return undefined;
		}
		return path[path.length - 1]._metadata.uuid;
	},
	createSystemMessage: (text) => {
		const newId = uuidv4();
		set((state) => {
			const nodes = { ...state.nodes };
			nodes[newId] = {
				id: newId,
				role: "system",
				text,
				createdAt: Date.now(),
			};
			const edges = { ...state.edges };
			const blockedEdges = new Set(state.blockedEdges);
			return {
				nodes,
				edges,
				roots: recomputeRoots(nodes, edges),
				blockedEdges,
			};
		});
		return newId;
	},
	createUserAfter: (parentId, text) => {
		const newId = uuidv4();
		set((state) => {
			const nodes = { ...state.nodes };
			nodes[newId] = {
				id: newId,
				role: "user",
				text,
				createdAt: Date.now(),
			};

			const edges = { ...state.edges };
			if (parentId) {
				edges[`${parentId}->${newId}`] = {
					id: `${parentId}->${newId}`,
					from: parentId,
					to: newId,
					kind: "sequence",
				};
			}

			const blockedEdges = new Set(state.blockedEdges);
			if (parentId) {
				blockedEdges.delete(`${parentId}->${newId}`);
			}

			return {
				nodes,
				edges,
				roots: recomputeRoots(nodes, edges),
				blockedEdges,
			};
		});
		return newId;
	},
	createAssistantAfter: (parentId) => {
		if (!get().nodes[parentId]) {
			throw new Error(`Parent node ${parentId} not found`);
		}
		const newId = uuidv4();
		set((state) => {
			const nodes = { ...state.nodes };
			nodes[newId] = {
				id: newId,
				role: "assistant",
				text: "",
				createdAt: Date.now(),
				status: "draft",
			};

			const edges = { ...state.edges };
			edges[`${parentId}->${newId}`] = {
				id: `${parentId}->${newId}`,
				from: parentId,
				to: newId,
				kind: "sequence",
			};

			const blockedEdges = new Set(state.blockedEdges);
			blockedEdges.delete(`${parentId}->${newId}`);

			return {
				nodes,
				edges,
				roots: recomputeRoots(nodes, edges),
				blockedEdges,
			};
		});
		return newId;
	},
	appendToNode: (nodeId, delta) =>
		set((state) => {
			const node = state.nodes[nodeId];
			if (!node) {
				return state;
			}
			const nodes = { ...state.nodes };
			nodes[nodeId] = {
				...node,
				text: `${node.text}${delta}`,
			};
			return { nodes };
		}),
	setNodeText: (nodeId, text) =>
		set((state) => {
			const node = state.nodes[nodeId];
			if (!node) {
				return state;
			}
			const nodes = { ...state.nodes };
			nodes[nodeId] = {
				...node,
				text,
			};
			return { nodes };
		}),
	setNodeStatus: (nodeId, status) =>
		set((state) => {
			const node = state.nodes[nodeId] as GraphNode & { status?: string };
			if (!node) {
				return state;
			}
			const nodes = { ...state.nodes };
			nodes[nodeId] = {
				...node,
				status,
			};
			return { nodes };
		}),
	predecessorOf: (nodeId) => {
		const { edges } = get();
		for (const edge of Object.values(edges)) {
			if (edge.to === nodeId) {
				return edge.from;
			}
		}
		return undefined;
	},
	canConnect: (source, target) => {
		const { nodes, edges } = get();
		if (!nodes[source] || !nodes[target] || source === target) {
			return false;
		}
		const visited = new Set<NodeID>();
		const stack: NodeID[] = [target];
		while (stack.length > 0) {
			const current = stack.pop() as NodeID;
			if (current === source) {
				return false;
			}
			if (visited.has(current)) {
				continue;
			}
			visited.add(current);
			for (const edge of Object.values(edges)) {
				if (edge.from === current) {
					stack.push(edge.to);
				}
			}
		}
		return true;
	},
	connectSequence: (source, target) =>
		set((state) => {
			if (!state.nodes[source] || !state.nodes[target] || source === target) {
				return state;
			}
			const edges = { ...state.edges };
			for (const edge of Object.values(edges)) {
				if (edge.to === target) {
					delete edges[edge.id];
				}
			}
			edges[`${source}->${target}`] = {
				id: `${source}->${target}`,
				from: source,
				to: target,
				kind: "sequence",
			};
			const blockedEdges = new Set(state.blockedEdges);
			blockedEdges.delete(`${source}->${target}`);
			return {
				edges,
				roots: recomputeRoots(state.nodes, edges),
				blockedEdges,
			};
		}),
	duplicateNodeAfter: (parentId) => {
		const parent = get().nodes[parentId];
		if (!parent) {
			return undefined;
		}
		const newId = uuidv4();
		set((state) => {
			const nodes = { ...state.nodes };
			nodes[newId] = {
				id: newId,
				role: parent.role,
				text: parent.text,
				createdAt: Date.now(),
			};

			const edges = { ...state.edges };
			const edgeId = `${parentId}->${newId}`;
			edges[edgeId] = {
				id: edgeId,
				from: parentId,
				to: newId,
				kind: "sequence",
			};

			const blockedEdges = new Set(state.blockedEdges);
			blockedEdges.delete(edgeId);
			const roots = recomputeRoots(nodes, edges);
			return { nodes, edges, roots, blockedEdges };
		});
		return newId;
	},
	removeNode: (id) =>
		set((state) => {
			if (!state.nodes[id]) {
				return state;
			}
			const predecessors = Array.from(
				new Set(
					Object.values(state.edges)
						.filter((edge) => edge.to === id)
						.map((edge) => edge.from),
				),
			);
			const successors = Array.from(
				new Set(
					Object.values(state.edges)
						.filter((edge) => edge.from === id)
						.map((edge) => edge.to),
				),
			);
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

			const connectCandidates =
				predecessors.length > 0 && successors.length > 0
					? { predecessors, successors }
					: undefined;
			if (connectCandidates) {
				for (const predecessor of connectCandidates.predecessors) {
					if (!nodes[predecessor]) {
						continue;
					}
					for (const successor of connectCandidates.successors) {
						if (!nodes[successor] || predecessor === successor) {
							continue;
						}
						const edgeId = `${predecessor}->${successor}`;
						if (edges[edgeId]) {
							continue;
						}
						if (wouldCreateCycle(edges, predecessor, successor)) {
							continue;
						}
						edges[edgeId] = {
							id: edgeId,
							from: predecessor,
							to: successor,
							kind: "sequence",
						};
						blocked.delete(edgeId);
					}
				}
			}

			const roots = recomputeRoots(nodes, edges);
			const { activeTargetId } = state;
			const nextActive = activeTargetId === id ? undefined : activeTargetId;
			return {
				nodes,
				edges,
				roots,
				blockedEdges: blocked,
				activeTargetId: nextActive,
			};
		}),
	reset: () =>
		set({
			nodes: {},
			edges: {},
			roots: [],
			activeTargetId: undefined,
			blockedEdges: new Set(),
		}),
	exportSnapshot: () => {
		const state = get();
		const nodes = Object.fromEntries(
			Object.entries(state.nodes).map(([id, node]) => [id, { ...node }]),
		);
		const edges = Object.fromEntries(
			Object.entries(state.edges).map(([id, edge]) => [id, { ...edge }]),
		);
		return {
			version: 1,
			exportedAt: new Date().toISOString(),
			graph: {
				nodes,
				edges,
				roots: [...state.roots],
			},
			blockedEdges: Array.from(state.blockedEdges),
			activeTargetId: state.activeTargetId,
		};
	},
		importSnapshot: (snapshot) => {
			if (snapshot.version !== 1) {
				throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
			}
			const nodesRaw = snapshot.graph?.nodes ?? {};
			const edgesRaw = snapshot.graph?.edges ?? {};
			const nodes = Object.fromEntries(
				Object.entries(nodesRaw).map(([id, node]) => [id, { ...node }]),
			);
			const edgesFiltered = Object.entries(edgesRaw).filter(([, edge]) => {
				return Boolean(nodes[edge.from] && nodes[edge.to]);
			});
			const edges = Object.fromEntries(
				edgesFiltered.map(([id, edge]) => [id, { ...edge }]),
			);
			const rootsRaw = snapshot.graph?.roots ?? [];
			const rootsProvided = rootsRaw.filter((rootId) => nodes[rootId]);
			const roots =
				rootsProvided.length > 0 ? rootsProvided : recomputeRoots(nodes, edges);
			const activeTargetId =
				snapshot.activeTargetId && nodes[snapshot.activeTargetId]
					? snapshot.activeTargetId
					: undefined;
			set({
				nodes,
				edges,
				roots,
				activeTargetId,
				blockedEdges: new Set(snapshot.blockedEdges ?? []),
			});
		},
}));
