import {
	Background,
	type Connection,
	type Edge,
	MiniMap,
	type Node,
	ReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { twJoin } from "tailwind-merge";
import { useShallow } from "zustand/react/shallow";
import { useConversationTree } from "../tree/useConversationTree";
import NodeContextMenu from "./NodeContextMenu";

interface DiagramViewProps {
	onNodeDoubleClick?: (nodeId: string) => void;
	onSetActiveNode?: (nodeId: string) => void;
	onDuplicateFromNode?: (nodeId: string) => void;
}

const elk = new ELK();

const boxSize = {
	width: 320,
	height: 80,
};

const columnGap = 64;
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

	useEffect(() => {
		const children = Object.values(treeNodes).map((node) => ({
			id: node.id,
			width: boxSize.width,
			height: boxSize.height,
		}));
		const edges = Object.values(treeEdges).map((edge) => ({
			id: edge.id,
			sources: [edge.from],
			targets: [edge.to],
		}));

		let cancelled = false;
		void elk
			.layout({
				id: "root",
				layoutOptions: {
					"elk.algorithm": "layered",
					"elk.direction": "DOWN",
					"elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
					"elk.spacing.nodeNode": "40",
					"elk.layered.spacing.nodeNodeBetweenLayers": "80",
					"elk.edgeRouting": "ORTHOGONAL",
				},
				children,
				edges,
			})
			.then(
				(result: {
					children?: Array<{ id: string; x?: number; y?: number }>;
					edges?: Array<{ id: string; sources?: string[]; targets?: string[] }>;
				}) => {
					if (cancelled) {
						return;
					}
					const nodes: Node[] = (result.children ?? []).map((child) => {
						const dataNode = treeNodes[child.id];
						if (!dataNode) {
							return {
								id: child.id,
								position: { x: child.x ?? 0, y: child.y ?? 0 },
								data: { label: child.id },
							} satisfies Node;
						}

						const label = (
							<div className="flex items-start gap-2">
								<div className="min-w-0">
									<p className="text-xs font-mono uppercase text-slate-500">
										{dataNode.role}
									</p>
									<p className="mt-1 text-sm font-medium leading-snug text-slate-800 line-clamp-3">
										{dataNode.text}
									</p>
								</div>
							</div>
						);

						const isActive = activePathIds.nodes.has(child.id);
						const style = {
							...nodeStyleBase,
							border: isActive ? "2px solid #2563eb" : "1px solid #e2e8f0",
							opacity: isActive ? 1 : 0.7,
						};

						return {
							id: child.id,
							position: {
								x:
									(laneAssignments.get(child.id) ?? laneAssignments.size) *
									(boxSize.width + columnGap),
								y:
									child.y ??
									(depthByNode.get(child.id) ?? 0) * (boxSize.height + rowGap),
							},
							data: { label },
							style,
						} satisfies Node;
					});

					const edgesStyled: Edge[] = (result.edges ?? []).flatMap((edge) => {
						const source = edge.sources?.[0];
						const target = edge.targets?.[0];
						if (!source || !target) {
							return [];
						}
						const isActive = activePathIds.edges.has(edge.id);
						return [
							{
								id: edge.id,
								source,
								target,
								type: "smoothstep",
								animated: false,
								style: {
									strokeWidth: isActive ? 2 : 1.5,
									stroke: isActive ? "#2563eb" : "#94a3b8",
								},
							} as Edge,
						];
					});

					setLayoutNodes(nodes);
					setLayoutEdges(edgesStyled);
				},
			)
			.catch(() => {
				if (!cancelled) {
					setLayoutNodes([]);
					setLayoutEdges([]);
				}
			});

		return () => {
			cancelled = true;
		};
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
						<MiniMap />
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
