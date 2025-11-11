import { SegmentedControl, Select, UnstyledButton } from "@mantine/core";

interface HeaderProps {
	models: Array<{ id: string; name?: string | null }>;
	activeModel: string | null;
	onModelChange: (value: string | null) => void;
	view: "chat" | "diagram" | "text";
	onViewChange: (value: "chat" | "diagram" | "text") => void;
	onClear: () => void;
	onImport: () => void;
	onExport: () => void;
	onOpenSettings: () => void;
}

const viewOptions: Array<{
	label: string;
	value: "chat" | "diagram" | "text";
	icon: string;
}> = [
	{ label: "Chat", value: "chat", icon: "i-lucide-message-square" },
	{ label: "Diagram", value: "diagram", icon: "i-lucide-git-branch" },
	{ label: "Text", value: "text", icon: "i-lucide-align-left" },
];

const Header = ({
	models,
	activeModel,
	onModelChange,
	view,
	onViewChange,
	onClear,
	onImport,
	onExport,
	onOpenSettings,
}: HeaderProps) => (
	<div className="flex items-center px-4 py-2">
		<div className="flex items-center gap-2">
			<h1 className="text-xl font-bold font-mono">iaslate</h1>
			<Select
				className="w-64"
				data={models.map((model) => ({
					value: model.id,
					label: model.name || model.id,
				}))}
				value={activeModel}
				onChange={onModelChange}
				placeholder="Select a model"
				aria-label="Select a model"
			/>
		</div>
		<div className="ml-4">
			<SegmentedControl
				size="sm"
				value={view}
				onChange={(value) => onViewChange(value as "chat" | "diagram" | "text")}
				data={viewOptions.map((option) => ({
					value: option.value,
					label: (
						<span className="flex items-center gap-2 text-sm font-medium">
							<span
								className={`w-4 h-4 ${option.icon}`}
								aria-hidden="true"
							/>
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
	</div>
);

export default Header;
