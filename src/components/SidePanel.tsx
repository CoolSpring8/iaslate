import { SegmentedControl } from "@mantine/core";
import { useState } from "react";
import type { ProviderKind } from "../types";
import DiagramView from "./DiagramView";
import GenerationSettings from "./GenerationSettings";

type SidePanelTab = "diagram" | "settings";

interface SidePanelProps {
	providerKind: ProviderKind;
	onNodeDoubleClick?: (nodeId: string) => void;
	onSetActiveNode?: (nodeId: string) => void;
	onDuplicateFromNode?: (nodeId: string) => void;
}

const SidePanel = ({
	providerKind,
	onNodeDoubleClick,
	onSetActiveNode,
	onDuplicateFromNode,
}: SidePanelProps) => {
	const [activeTab, setActiveTab] = useState<SidePanelTab>("diagram");

	return (
		<div className="h-full flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
			{/* Tab Navigation */}
			<div className="shrink-0 px-3 py-2 border-b border-solid border-slate-200/60 dark:border-slate-800/60">
				<SegmentedControl
					value={activeTab}
					onChange={(value) => setActiveTab(value as SidePanelTab)}
					data={[
						{
							value: "diagram",
							label: (
								<span className="flex items-center gap-1.5 text-xs">
									<span className="i-lucide-git-branch w-3.5 h-3.5" />
									Tree
								</span>
							),
						},
						{
							value: "settings",
							label: (
								<span className="flex items-center gap-1.5 text-xs">
									<span className="i-lucide-sliders-horizontal w-3.5 h-3.5" />
									Settings
								</span>
							),
						},
					]}
					fullWidth
					size="xs"
					radius="md"
					classNames={{
						root: "bg-slate-100/80 dark:bg-slate-800/50",
						indicator: "bg-white dark:bg-slate-700 shadow-sm",
					}}
				/>
			</div>

			{/* Tab Content */}
			<div className="flex-1 min-h-0">
				{activeTab === "diagram" ? (
					<DiagramView
						onNodeDoubleClick={onNodeDoubleClick}
						onSetActiveNode={onSetActiveNode}
						onDuplicateFromNode={onDuplicateFromNode}
					/>
				) : (
					<GenerationSettings providerKind={providerKind} />
				)}
			</div>
		</div>
	);
};

export default SidePanel;
