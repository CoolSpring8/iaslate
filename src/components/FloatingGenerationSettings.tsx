import { UnstyledButton } from "@mantine/core";
import {
	type PointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { ProviderKind } from "../types";
import GenerationSettings from "./GenerationSettings";

interface FloatingGenerationSettingsProps {
	opened: boolean;
	providerKind: ProviderKind;
	onClose: () => void;
}

interface Point {
	x: number;
	y: number;
}

const panelWidth = 288;
const panelFallbackHeight = 236;
const viewportMargin = 8;

const getInitialPosition = (): Point => {
	if (typeof window === "undefined") {
		return { x: 24, y: 64 };
	}
	return {
		x: Math.max(viewportMargin, window.innerWidth - panelWidth - 24),
		y: 64,
	};
};

const FloatingGenerationSettings = ({
	opened,
	providerKind,
	onClose,
}: FloatingGenerationSettingsProps) => {
	const panelRef = useRef<HTMLDivElement | null>(null);
	const dragOffsetRef = useRef<Point | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [position, setPosition] = useState<Point>(getInitialPosition);

	const clampPosition = useCallback((next: Point): Point => {
		if (typeof window === "undefined") {
			return next;
		}
		const rect = panelRef.current?.getBoundingClientRect();
		const width = rect?.width ?? panelWidth;
		const height = rect?.height ?? panelFallbackHeight;
		return {
			x: Math.min(
				Math.max(viewportMargin, next.x),
				Math.max(viewportMargin, window.innerWidth - width - viewportMargin),
			),
			y: Math.min(
				Math.max(viewportMargin, next.y),
				Math.max(viewportMargin, window.innerHeight - height - viewportMargin),
			),
		};
	}, []);

	useEffect(() => {
		if (!opened) {
			return;
		}
		const handleResize = () => {
			setPosition((current) => clampPosition(current));
		};
		handleResize();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [clampPosition, opened]);

	const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) {
			return;
		}
		const rect = panelRef.current?.getBoundingClientRect();
		if (!rect) {
			return;
		}
		dragOffsetRef.current = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
		setIsDragging(true);
	};

	const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
		const dragOffset = dragOffsetRef.current;
		if (!dragOffset) {
			return;
		}
		setPosition(
			clampPosition({
				x: event.clientX - dragOffset.x,
				y: event.clientY - dragOffset.y,
			}),
		);
	};

	const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
		dragOffsetRef.current = null;
		setIsDragging(false);
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	if (!opened) {
		return null;
	}

	return (
		<div
			ref={panelRef}
			className="fixed z-50 w-72 overflow-hidden rounded-md border border-solid border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/30"
			style={{ left: position.x, top: position.y }}
		>
			<div
				className="flex cursor-move select-none items-center justify-between border-b border-solid border-slate-200 px-3 py-2 dark:border-slate-800"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={stopDragging}
				onPointerCancel={stopDragging}
			>
				<div className="flex items-center gap-2">
					<span
						className="i-lucide-grip-horizontal h-4 w-4 text-slate-400"
						aria-hidden="true"
					/>
					<span className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
						Generation
					</span>
				</div>
				<UnstyledButton
					className="i-lucide-x h-4 w-4 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
					title="Close generation controls"
					aria-label="Close generation controls"
					onPointerDown={(event) => {
						event.stopPropagation();
					}}
					onClick={onClose}
				/>
			</div>
			<div className={isDragging ? "pointer-events-none" : undefined}>
				<GenerationSettings providerKind={providerKind} />
			</div>
		</div>
	);
};

export default FloatingGenerationSettings;
