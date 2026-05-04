import { SegmentedControl, Select, UnstyledButton } from "@mantine/core";
import { twJoin } from "tailwind-merge";
import type { AppView, ModelInfo } from "../types";

interface HeaderProps {
	models: ModelInfo[];
	activeModel: string | null;
	onModelChange: (value: string | null) => void;
	modelSelectorDisabled?: boolean;
	modelPlaceholder?: string;
	modelStatus?: string;
	view: AppView;
	onViewChange: (value: AppView) => void;
	isChatTreeVisible: boolean;
	onToggleChatTree: () => void;
	isGenerationSettingsOpen: boolean;
	onToggleGenerationSettings: () => void;
	onClear: () => void;
	onImport: () => void;
	onExport: () => void;
	onOpenSettings: () => void;
}

const viewOptions: Array<{
	label: string;
	value: AppView;
	icon: string;
}> = [
	{ label: "Chat", value: "chat", icon: "i-lucide-message-square" },
	{ label: "Text", value: "text", icon: "i-lucide-align-left" },
];

const Header = ({
	models,
	activeModel,
	onModelChange,
	modelSelectorDisabled = false,
	modelPlaceholder,
	modelStatus,
	view,
	onViewChange,
	isChatTreeVisible,
	onToggleChatTree,
	isGenerationSettingsOpen,
	onToggleGenerationSettings,
	onClear,
	onImport,
	onExport,
	onOpenSettings,
}: HeaderProps) => {
	const isChatMode = view === "chat";

	return (
		<header className="flex items-center px-4 py-2">
			<div className="flex items-center gap-2">
				<h1 className="text-xl font-bold font-mono">iaslate</h1>
				{modelSelectorDisabled ? (
					<div className="flex h-[2.25rem] w-64 items-center rounded-md border border-solid border-slate-300 bg-white px-3 text-sm leading-[1.1] text-slate-900 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
						{modelStatus ?? "Model selection disabled"}
					</div>
				) : (
					<Select
						className="w-64"
						data={models.map((model) => ({
							value: model.id,
							label: model.name || model.id,
						}))}
						value={activeModel}
						onChange={onModelChange}
						placeholder={modelPlaceholder ?? "Select a model"}
						disabled={modelSelectorDisabled}
						aria-label="Select a model"
					/>
				)}
			</div>
			<div className="ml-4">
				<SegmentedControl
					size="sm"
					value={view}
					onChange={(value) => onViewChange(value as AppView)}
					data={viewOptions.map((option) => ({
						value: option.value,
						label: (
							<span className="flex items-center gap-2 text-sm font-medium">
								<span className={`w-4 h-4 ${option.icon}`} aria-hidden="true" />
								{option.label}
							</span>
						),
					}))}
					withItemsBorders={false}
					radius="xl"
					classNames={{
						root: "rounded-full bg-slate-100/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-1",
						indicator:
							"rounded-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm",
						control:
							"text-slate-500 dark:text-slate-400 data-[active=true]:text-slate-900 dark:data-[active=true]:text-white transition-colors",
						label: "px-3 py-1.5",
					}}
					aria-label="View switch"
				/>
			</div>
			<div className="ml-auto flex gap-4">
				<UnstyledButton
					className={twJoin(
						"i-lucide-git-branch w-5 h-5 transition-colors",
						isChatMode && isChatTreeVisible
							? "text-blue-600 dark:text-blue-400"
							: "text-slate-700 dark:text-slate-200",
						!isChatMode && "cursor-not-allowed opacity-35",
					)}
					title={
						isChatMode
							? isChatTreeVisible
								? "Show linear chat"
								: "Show tree"
							: "Tree is available in Chat mode"
					}
					aria-label={
						isChatMode && isChatTreeVisible ? "Show linear chat" : "Show tree"
					}
					aria-pressed={isChatMode ? isChatTreeVisible : undefined}
					disabled={!isChatMode}
					onClick={onToggleChatTree}
				/>
				<UnstyledButton
					className={twJoin(
						"i-lucide-sliders-horizontal w-5 h-5 transition-colors",
						isGenerationSettingsOpen
							? "text-blue-600 dark:text-blue-400"
							: "text-slate-700 dark:text-slate-200",
					)}
					title={
						isGenerationSettingsOpen
							? "Hide generation controls"
							: "Show generation controls"
					}
					aria-label={
						isGenerationSettingsOpen
							? "Hide generation controls"
							: "Show generation controls"
					}
					aria-pressed={isGenerationSettingsOpen}
					onClick={onToggleGenerationSettings}
				/>
				<UnstyledButton
					className="i-lucide-eraser w-5 h-5"
					title="Clear conversation"
					onClick={onClear}
				/>
				<UnstyledButton
					className="i-lucide-file-input w-5 h-5"
					title="Import from JSON"
					onClick={onImport}
				/>
				<UnstyledButton
					className="i-lucide-file-output w-5 h-5"
					title="Export to JSON"
					onClick={onExport}
				/>
				<UnstyledButton
					className="i-lucide-settings w-5 h-5"
					title="Settings"
					onClick={onOpenSettings}
				/>
			</div>
		</header>
	);
};

export default Header;
