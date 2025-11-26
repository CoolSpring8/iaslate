import {
	Background,
	type Connection,
	type Edge,
	MiniMap,
	type Node,
	type NodeChange,
	ReactFlow,
	applyNodeChanges,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import { twJoin } from "tailwind-merge";
import { useShallow } from "zustand/react/shallow";
import { useConversationTree } from "../tree/useConversationTree";
import NodeContextMenu from "./NodeContextMenu";

interface DiagramViewProps {
	onNodeDoubleClick?: (nodeId: string) => void;
	onSetActiveNode?: (nodeId: string) => void;
	onDuplicateFromNode?: (nodeId: string) => void;
}

const boxSize = {
	width: 320,
	height: 80,
};

const columnGap = 80;
const rowGap = 80;

const nodeStyleBase = {
	border: "1px solid #e2e8f0",
	borderRadius: 8,
	padding: 8,
	background: "#fff",
	width: boxSize.width,
};

const DiagramView = ({
	onNodeDoubleClick,
	onSetActiveNode,
	onDuplicateFromNode,
}: DiagramViewProps) => {
	const {
		nodes: treeNodes,
		edges: treeEdges,
		activeTargetId,
		compileActive,
		canReparent,
		reparentNode,
		splitBranch,
		removeNode,
	} = useConversationTree(
		useShallow((state) => ({
			nodes: state.nodes,
			edges: state.edges,
			activeTargetId: state.activeTargetId,
			compileActive: state.compileActive,
			canReparent: state.canReparent,
			reparentNode: state.reparentNode,
			splitBranch: state.splitBranch,
			removeNode: state.removeNode,
		})),
	);

	const activePathIds = useMemo(() => {
		const messages = compileActive();
		const ids = messages.map((message) => message._metadata.uuid);
		const nodeIds = new Set(ids);
		const edgeIds = new Set<string>();
		for (let index = 1; index < ids.length; index += 1) {
			edgeIds.add(`${ids[index - 1]}->${ids[index]}`);
		}
		return { nodes: nodeIds, edges: edgeIds };
	}, [compileActive, treeNodes, treeEdges, activeTargetId]);

	const laneAssignments = useMemo(() => {
		const assignments = new Map<string, number>();
		const nodes = Object.values(treeNodes);
		if (nodes.length === 0) {
			return assignments;
		}

		const childrenByParent = new Map<string, typeof nodes>();
		for (const node of nodes) {
			if (!node.parentId) {
				continue;
			}
			const list = childrenByParent.get(node.parentId) ?? [];
			list.push(node);
			childrenByParent.set(node.parentId, list);
		}
		for (const [, list] of childrenByParent) {
			list.sort((a, b) => a.createdAt - b.createdAt);
		}

		const roots = nodes
			.filter((node) => !node.parentId)
			.sort((a, b) => a.createdAt - b.createdAt);

		let nextLane = 0;
		for (const root of roots) {
			if (!assignments.has(root.id)) {
				assignments.set(root.id, nextLane);
				nextLane += 1;
			}
		}

		const pickContinuation = (_parentId: string, children: typeof nodes) => {
			const preferred = children.find((child) =>
				activePathIds.nodes.has(child.id),
			);
			return preferred ?? children[0];
		};

		const assignChildren = (parentId: string) => {
			const parentLane = assignments.get(parentId);
			const children = childrenByParent.get(parentId);
			if (!children?.length) {
				return;
			}
			const continuation = pickContinuation(parentId, children);
			if (continuation) {
				if (parentLane !== undefined) {
					assignments.set(continuation.id, parentLane);
				} else if (!assignments.has(continuation.id)) {
					assignments.set(continuation.id, nextLane++);
				}
			}
			for (const child of children) {
				if (child.id === continuation?.id) {
					continue;
				}
				if (!assignments.has(child.id)) {
					assignments.set(child.id, nextLane);
					nextLane += 1;
				}
			}
			for (const child of children) {
				assignChildren(child.id);
			}
		};

		for (const root of roots) {
			assignChildren(root.id);
		}

		for (const node of nodes) {
			if (!assignments.has(node.id)) {
				assignments.set(node.id, nextLane);
				nextLane += 1;
			}
		}
		return assignments;
	}, [treeNodes, activePathIds]);

	const depthByNode = useMemo(() => {
		const depthMap = new Map<string, number>();
		const getDepth = (nodeId: string): number => {
			const cached = depthMap.get(nodeId);
			if (typeof cached === "number") {
				return cached;
			}
			const node = treeNodes[nodeId];
			if (!node || !node.parentId) {
				depthMap.set(nodeId, 0);
				return 0;
			}
			const depth = getDepth(node.parentId) + 1;
			depthMap.set(nodeId, depth);
			return depth;
		};
		for (const nodeId of Object.keys(treeNodes)) {
			getDepth(nodeId);
		}
		return depthMap;
	}, [treeNodes]);

	const [layoutNodes, setLayoutNodes] = useState<Node[]>([]);
	const [layoutEdges, setLayoutEdges] = useState<Edge[]>([]);
	const [contextMenuNodeId, setContextMenuNodeId] = useState<string | null>(
		null,
	);
	const pendingNodeRemovalsRef = useRef<Set<string>>(new Set());
	const miniMapColors = useMemo(() => {
		return {
			nodeColor: (node: Node) =>
				activePathIds.nodes.has(node.id) ? "#bfdbfe" : "#e2e8f0",
			nodeStrokeColor: (node: Node) =>
				activePathIds.nodes.has(node.id) ? "#2563eb" : "#94a3b8",
		};
	}, [activePathIds]);
	const handleNodesChange = useCallback(
		(changes: NodeChange[]) => {
			setLayoutNodes((nodes) => applyNodeChanges(changes, nodes));
		},
		[setLayoutNodes],
	);

	useEffect(() => {
		// No conversation = no graph
		const internalNodes = Object.values(treeNodes);
		if (internalNodes.length === 0) {
			setLayoutNodes([]);
			setLayoutEdges([]);
			return;
		}

		const laneById = new Map(laneAssignments);
		let nextLane = laneAssignments.size;
		for (const lane of laneAssignments.values()) {
			nextLane = Math.max(nextLane, lane + 1);
		}

		const getLane = (nodeId: string): number => {
			const lane = laneById.get(nodeId);
			if (lane !== undefined) {
				return lane;
			}
			// @ts-expect-error rsbuild v0.5.2 doesn't support env index access or import.meta.env
			if (process.env.NODE_ENV !== "production") {
				// eslint-disable-next-line no-console
				console.warn(`lane missing for node ${nodeId}; allocating new lane`);
			}
			const assigned = nextLane;
			nextLane += 1;
			laneById.set(nodeId, assigned);
			return assigned;
		};

		const laneLookup = new Map<string, number>();
		for (const node of internalNodes) {
			laneLookup.set(node.id, getLane(node.id));
		}

		// Sort by (depth, lane, createdAt) for stable ordering
		const sortedNodes = [...internalNodes].sort((a, b) => {
			const depthA = depthByNode.get(a.id) ?? 0;
			const depthB = depthByNode.get(b.id) ?? 0;
			if (depthA !== depthB) {
				return depthA - depthB;
			}

			const laneA = laneLookup.get(a.id) ?? 0;
			const laneB = laneLookup.get(b.id) ?? 0;
			if (laneA !== laneB) {
				return laneA - laneB;
			}

			const createdDiff = a.createdAt - b.createdAt;
			if (createdDiff !== 0) {
				return createdDiff;
			}

			return a.id.localeCompare(b.id);
		});

		const nodes: Node[] = sortedNodes.map((dataNode) => {
			const contentText =
				typeof dataNode.content === "string"
					? dataNode.content
					: dataNode.content
							.filter((part) => part.type === "text")
							.map((part) => part.text)
							.join("\n\n");
			const label = (
				<div className="flex items-start gap-2">
					<div className="min-w-0">
						<p className="text-xs font-mono uppercase text-slate-500">
							{dataNode.role}
						</p>
						<p className="mt-1 text-sm font-medium leading-snug text-slate-800 line-clamp-3">
							{contentText}
						</p>
					</div>
				</div>
			);

			const isActive = activePathIds.nodes.has(dataNode.id);
			const style = {
				...nodeStyleBase,
				border: isActive ? "2px solid #2563eb" : "1px solid #e2e8f0",
				opacity: isActive ? 1 : 0.7,
			};

			const lane = laneLookup.get(dataNode.id) ?? 0;
			const depth = depthByNode.get(dataNode.id) ?? 0;

			return {
				id: dataNode.id,
				position: {
					x: lane * (boxSize.width + columnGap),
					y: depth * (boxSize.height + rowGap),
				},
				data: { label },
				style,
			} satisfies Node;
		});

		const edgesStyled: Edge[] = Object.values(treeEdges).map((edge) => {
			const isActive = activePathIds.edges.has(edge.id);
			return {
				id: edge.id,
				source: edge.from,
				target: edge.to,
				type: "smoothstep",
				animated: false,
				style: {
					strokeWidth: isActive ? 2 : 1.5,
					stroke: isActive ? "#2563eb" : "#94a3b8",
				},
			} satisfies Edge;
		});

		setLayoutNodes(nodes);
		setLayoutEdges(edgesStyled);
	}, [
		treeNodes,
		treeEdges,
		activeTargetId,
		activePathIds,
		laneAssignments,
		depthByNode,
	]);

	const hasGraphData =
		layoutNodes.length > 0 || Object.keys(treeNodes).length > 0;

	return (
		<div className="w-full h-full">
			{hasGraphData ? (
				<NodeContextMenu
					targetId={contextMenuNodeId}
					onClose={() => {
						setContextMenuNodeId(null);
					}}
					onSetActive={onSetActiveNode}
					onDuplicate={onDuplicateFromNode}
					onRemove={(nodeId) => {
						removeNode(nodeId);
					}}
				>
					<ReactFlow
						nodes={layoutNodes}
						edges={layoutEdges}
						fitView
						nodesConnectable
						nodesDraggable={false}
						zoomOnDoubleClick={false}
						onPaneClick={() => {
							setContextMenuNodeId(null);
						}}
						onPaneContextMenu={(event) => {
							event.preventDefault();
							event.stopPropagation();
							setContextMenuNodeId(null);
						}}
						onNodeDoubleClick={(_, node) => {
							onNodeDoubleClick?.(node.id);
						}}
						onNodeContextMenu={(event, node) => {
							event.preventDefault();
							setContextMenuNodeId(node.id);
						}}
						onConnect={(connection: Connection) => {
							if (!connection.source || !connection.target) {
								return;
							}
							if (canReparent(connection.source, connection.target)) {
								reparentNode(connection.target, connection.source);
							}
						}}
						onEdgesDelete={(edgesDeleted) => {
							edgesDeleted.forEach((edge) => {
								const pendingRemovals = pendingNodeRemovalsRef.current;
								if (edge.target && !pendingRemovals.has(edge.target)) {
									splitBranch(edge.target);
								}
							});
						}}
						onNodesChange={handleNodesChange}
						onNodesDelete={(nodesDeleted) => {
							nodesDeleted.forEach((node) => {
								removeNode(node.id);
							});
							pendingNodeRemovalsRef.current.clear();
						}}
						onBeforeDelete={async ({ nodes }) => {
							pendingNodeRemovalsRef.current = new Set(
								nodes.map((node) => node.id),
							);
							return true;
						}}
					>
						<Background />
						<MiniMap
							maskColor="rgba(15, 23, 42, 0.12)"
							nodeColor={miniMapColors.nodeColor}
							nodeStrokeColor={miniMapColors.nodeStrokeColor}
						/>
					</ReactFlow>
				</NodeContextMenu>
			) : (
				<div className="flex h-full flex-col items-center justify-center text-sm text-slate-500">
					<p className={twJoin("text-center", "max-w-xs")}>
						Start a conversation to see the thread tree here.
					</p>
				</div>
			)}
		</div>
	);
};

export default DiagramView;
