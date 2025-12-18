import { Tabs } from "@mantine/core";
import { useState } from "react";
import type { ProviderKind } from "../types";
import DiagramView from "./DiagramView";
import GenerationSettings from "./GenerationSettings";

type SidePanelTab = "diagram" | "settings";

interface SidePanelProps {
	providerKind: ProviderKind;
	tabs?: SidePanelTab[];
	activeTab?: SidePanelTab;
	onActiveTabChange?: (tab: SidePanelTab) => void;
	onNodeDoubleClick?: (nodeId: string) => void;
	onSetActiveNode?: (nodeId: string) => void;
	onDuplicateFromNode?: (nodeId: string) => void;
}

const SidePanel = ({
	providerKind,
	tabs,
	activeTab,
	onActiveTabChange,
	onNodeDoubleClick,
	onSetActiveNode,
	onDuplicateFromNode,
}: SidePanelProps) => {
	const availableTabs = tabs ?? (["diagram", "settings"] as const);
	const defaultTab = availableTabs.includes("settings")
		? "settings"
		: availableTabs[0] ?? "settings";
	const [internalActiveTab, setInternalActiveTab] =
		useState<SidePanelTab>(defaultTab);

	const resolvedActiveTab = activeTab ?? internalActiveTab;
	const handleActiveTabChange = onActiveTabChange ?? setInternalActiveTab;

	return (
		<div className="h-full flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
			<Tabs
				value={resolvedActiveTab}
				onChange={(value) => {
					if (!value) {
						return;
					}
					handleActiveTabChange(value as SidePanelTab);
				}}
				keepMounted={false}
				variant="pills"
				radius="md"
				className="h-full flex flex-col"
				classNames={{
					list: "shrink-0 px-3 py-2 border-b border-solid border-slate-200/60 dark:border-slate-800/60",
					tab: "text-xs data-[active]:bg-white data-[active]:text-slate-700 data-[active]:shadow-sm dark:data-[active]:bg-slate-700 dark:data-[active]:text-white",
					panel: "flex-1 min-h-0",
				}}
			>
				{availableTabs.length > 1 ? (
					<Tabs.List grow className="bg-slate-100/80 dark:bg-slate-800/50">
						{availableTabs.includes("diagram") ? (
							<Tabs.Tab value="diagram">
								<span className="flex items-center gap-1.5 text-xs">
									<span className="i-lucide-git-branch w-3.5 h-3.5" />
									Tree
								</span>
							</Tabs.Tab>
						) : null}
						{availableTabs.includes("settings") ? (
							<Tabs.Tab value="settings">
								<span className="flex items-center gap-1.5 text-xs">
									<span className="i-lucide-sliders-horizontal w-3.5 h-3.5" />
									Settings
								</span>
							</Tabs.Tab>
						) : null}
					</Tabs.List>
				) : null}

				{availableTabs.includes("diagram") ? (
					<Tabs.Panel value="diagram">
						<DiagramView
							onNodeDoubleClick={onNodeDoubleClick}
							onSetActiveNode={onSetActiveNode}
							onDuplicateFromNode={onDuplicateFromNode}
						/>
					</Tabs.Panel>
				) : null}
				{availableTabs.includes("settings") ? (
					<Tabs.Panel value="settings">
						<GenerationSettings providerKind={providerKind} />
					</Tabs.Panel>
				) : null}
			</Tabs>
		</div>
	);
};

export default SidePanel;
