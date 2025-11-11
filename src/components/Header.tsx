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
				data={[
					{ label: "Chat", value: "chat" },
					{ label: "Diagram", value: "diagram" },
					{ label: "Text", value: "text" },
				]}
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
