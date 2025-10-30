import {
	Background,
	Controls,
	type Edge,
	MiniMap,
	type Node,
	ReactFlow,
} from "@xyflow/react";
import { type CSSProperties, useMemo } from "react";
import "@xyflow/react/dist/style.css";

export interface DiagramMessage {
	role: string;
	content: string;
	_metadata: { uuid: string };
}

interface DiagramViewProps {
	messages: DiagramMessage[];
	onNodeDoubleClick?: (index: number) => void;
}

const nodeStyle: CSSProperties = {
	border: "1px solid #e2e8f0",
	borderRadius: 8,
	padding: 8,
	maxWidth: 520,
	background: "#fff",
};

const DiagramView = ({ messages, onNodeDoubleClick }: DiagramViewProps) => {
	const { nodes, edges } = useMemo(() => {
		const nodes: Node[] = messages.map((message, index) => {
			const preview = message.content.slice(0, 80);
			const suffix = message.content.length > 80 ? "…" : "";
			return {
				id: message._metadata.uuid,
				data: {
					label: `${message.role}: ${preview}${suffix}`,
				},
				position: { x: 80, y: 40 + index * 120 },
				style: nodeStyle,
			};
		});

		const edges: Edge[] = messages.slice(0, -1).map((_, index) => ({
			id: `e-${messages[index]._metadata.uuid}-${messages[index + 1]._metadata.uuid}`,
			source: messages[index]._metadata.uuid,
			target: messages[index + 1]._metadata.uuid,
			type: "smoothstep",
		}));

		return { nodes, edges };
	}, [messages]);

	return (
		<div style={{ width: "100%", height: "100%" }}>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				fitView
				onNodeDoubleClick={(_, node) => {
					const targetIndex = messages.findIndex(
						(message) => message._metadata.uuid === node.id,
					);
					if (targetIndex !== -1) {
						onNodeDoubleClick?.(targetIndex);
					}
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
