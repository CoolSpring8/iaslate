import {
	Background,
	Controls,
	type Edge,
	MiniMap,
	type Node,
	ReactFlow,
} from "@xyflow/react";
import { useMemo } from "react";
import "@xyflow/react/dist/style.css";
import { useConversationGraph } from "../graph/useConversationGraph";

interface DiagramViewProps {
	onNodeDoubleClick?: (nodeId: string) => void;
}

const nodeStyle = {
	border: "1px solid #e2e8f0",
	borderRadius: 8,
	padding: 8,
	background: "#fff",
};

const DiagramView = ({ onNodeDoubleClick }: DiagramViewProps) => {
	const graphNodes = useConversationGraph((state) => state.nodes);
	const graphEdges = useConversationGraph((state) => state.edges);

	const { nodes, edges } = useMemo(() => {
		const sortedNodes = Object.values(graphNodes).sort(
			(a, b) => a.createdAt - b.createdAt,
		);
		const nodes: Node[] = sortedNodes.map((node, index) => {
			const label = `${node.role}: ${node.text.slice(0, 80)}${
				node.text.length > 80 ? "…" : ""
			}`;
			return {
				id: node.id,
				data: { label },
				position: { x: 80, y: 40 + index * 120 },
				style: nodeStyle,
			};
		});

		const edges: Edge[] = Object.values(graphEdges).map((edge) => ({
			id: edge.id,
			source: edge.from,
			target: edge.to,
			type: "smoothstep",
		}));

		return { nodes, edges };
	}, [graphNodes, graphEdges]);

	return (
		<div style={{ width: "100%", height: "100%" }}>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				fitView
				onNodeDoubleClick={(_, node) => {
					onNodeDoubleClick?.(node.id);
				}}
			>
				<Background />
				<MiniMap />
				<Controls />
			</ReactFlow>
		</div>
	);
};

export default DiagramView;
