import {
	FloatingPortal,
	autoUpdate,
	flip,
	offset,
	shift,
	useFloating,
} from "@floating-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { twJoin } from "tailwind-merge";
import { useSettingsStore } from "../state/useSettingsStore";
import type { TokenAlternative, TokenLogprob } from "../types";

interface TokenInlineRendererProps {
	tokens?: TokenLogprob[];
	onSelectAlternative?: (index: number, alternative: TokenAlternative) => void;
	disabled?: boolean;
	className?: string;
	inline?: boolean;
}

const formatToken = (token: string) =>
	token.replaceAll(" ", "␣").replaceAll("\n", "↵").replaceAll("\t", "⇥") || "∅";

const FloatingTokenMenu = ({
	anchorEl,
	token,
	alternatives,
	onSelect,
	onMouseEnter,
	onMouseLeave,
	disabled,
}: {
	anchorEl: HTMLElement | null;
	token: TokenLogprob;
	alternatives: TokenAlternative[];
	onSelect?: (alternative: TokenAlternative) => void;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
	disabled?: boolean;
}) => {
	const { refs, floatingStyles, isPositioned } = useFloating({
		placement: "top",
		middleware: [offset(0), flip(), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	});

	useEffect(() => {
		refs.setReference(anchorEl);
	}, [anchorEl, refs]);

	return (
		<FloatingPortal>
			<div
				ref={refs.setFloating}
				style={{
					...floatingStyles,
					zIndex: 1000,
					opacity: isPositioned ? 1 : 0,
				}}
				data-token-menu
				className="!w-fit p-0 rounded bg-white shadow-md border border-solid border-slate-200 overflow-hidden transition-opacity duration-75"
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
			>
				<div className="flex">
					{alternatives.slice(0, 8).map((alt) => (
						<button
							key={`${token.token}-${alt.token}-${alt.probability}`}
							type="button"
							className={twJoin(
								"flex flex-col items-center justify-between border border-solid border-l-0 border-y-0 border-slate-200 px-2 py-1 text-left text-sm text-slate-800 transition bg-white hover:bg-slate-50",
								disabled ? "cursor-not-allowed opacity-60" : "",
							)}
							onClick={() => {
								if (disabled) {
									return;
								}
								onSelect?.(alt);
							}}
						>
							<span className="font-mono">{formatToken(alt.token)}</span>
							<span className="text-xs text-slate-500">
								{(alt.probability * 100).toFixed(1)}%
							</span>
						</button>
					))}
				</div>
			</div>
		</FloatingPortal>
	);
};

const TokenInlineRenderer = ({
	tokens = [],
	onSelectAlternative,
	disabled = false,
	className,
	inline = false,
	hoveredIndex: externalHoveredIndex,
}: TokenInlineRendererProps & { hoveredIndex?: number | null }) => {
	const [tooltipIndex, setTooltipIndex] = useState<number | null>(null);
	const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isHoveringMenuRef = useRef(false);
	const enableTokenHeatmap = useSettingsStore(
		(state) => state.enableTokenHeatmap,
	);
	const heatmapTheme = useSettingsStore((state) => state.heatmapTheme);

	const Container = inline ? "span" : "div";

	const visibleTokens = useMemo(
		() => tokens.filter((token) => token.token.length > 0),
		[tokens],
	);

	const scheduleClose = () => {
		if (closeTimer.current) {
			clearTimeout(closeTimer.current);
		}
		closeTimer.current = setTimeout(() => {
			if (!isHoveringMenuRef.current) {
				setAnchorEl(null);
				setTooltipIndex(null);
			}
		}, 100);
	};

	useEffect(() => {
		return () => {
			if (closeTimer.current) {
				clearTimeout(closeTimer.current);
			}
			if (openTimer.current) {
				clearTimeout(openTimer.current);
			}
		};
	}, []);

	// Sync external hover to internal state
	useEffect(() => {
		if (externalHoveredIndex !== undefined && externalHoveredIndex !== null) {
			// Immediate highlight
			setHighlightIndex(externalHoveredIndex);

			// Clear pending timers
			if (closeTimer.current) clearTimeout(closeTimer.current);
			if (openTimer.current) clearTimeout(openTimer.current);

			// Close previous tooltip immediately if switching
			setTooltipIndex(null);
			setAnchorEl(null);

			// Delay opening new tooltip
			openTimer.current = setTimeout(() => {
				const element = document.querySelector(
					`[data-token-index="${externalHoveredIndex}"]`,
				);
				if (element instanceof HTMLElement) {
					setAnchorEl(element);
					setTooltipIndex(externalHoveredIndex);
				}
			}, 300);
		} else if (externalHoveredIndex === null) {
			// Only clear if we are explicitly told to clear (null),
			// but if we are in uncontrolled mode (undefined), don't force clear
			if (inline && externalHoveredIndex === null) {
				// Clear highlight immediately
				setHighlightIndex(null);
				if (openTimer.current) clearTimeout(openTimer.current);

				// In controlled mode (inline=true usually implies TextCompletionView),
				// we might want to respect the parent's clear signal.
				// However, TextCompletionView sends null when leaving textarea.
				// We should only clear if we are NOT hovering the menu.
				scheduleClose();
			}
		}
	}, [externalHoveredIndex, inline]);

	const activeToken =
		tooltipIndex !== null && visibleTokens[tooltipIndex]
			? visibleTokens[tooltipIndex]
			: null;

	const activeAlternatives = useMemo(() => {
		if (!activeToken) return [];
		const probability =
			activeToken.probability ??
			activeToken.alternatives.find((alt) => alt.token === activeToken.token)
				?.probability ??
			undefined;
		return activeToken.alternatives.length > 0
			? activeToken.alternatives
			: [{ token: activeToken.token, probability: probability ?? 0 }];
	}, [activeToken]);

	return (
		<>
			<Container
				className={twJoin(
					"relative whitespace-pre-wrap",
					inline ? "inline" : "w-full",
					className,
				)}
			>
				{visibleTokens.map((token, index) => {
					const probability =
						token.probability ??
						token.alternatives.find((alt) => alt.token === token.token)
							?.probability ??
						undefined;
					const isActive = index === highlightIndex || index === tooltipIndex;

					let backgroundColor: string | undefined;
					if (enableTokenHeatmap && probability !== undefined) {
						if (heatmapTheme === "traffic-light") {
							if (probability > 0.9) {
								// No background for high probability
							} else if (probability > 0.5) {
								// Yellow/Orange for medium probability
								// Calculate opacity based on probability: 0.9 -> 0.1, 0.5 -> 0.4
								const opacity = 0.1 + ((0.9 - probability) / 0.4) * 0.3;
								backgroundColor = `rgba(255, 165, 0, ${opacity})`;
							} else {
								// Red for low probability
								// Calculate opacity based on probability: 0.5 -> 0.2, 0.0 -> 0.5
								const opacity = 0.2 + ((0.5 - probability) / 0.5) * 0.3;
								backgroundColor = `rgba(255, 0, 0, ${opacity})`;
							}
						} else if (heatmapTheme === "monochrome-red") {
							// Red with opacity inversely proportional to probability
							// Cap opacity at 0.5 for readability
							const opacity = Math.min(0.5, (1 - probability) * 0.6);
							backgroundColor = `rgba(255, 0, 0, ${opacity})`;
						} else if (heatmapTheme === "monochrome-blue") {
							// Blue with opacity inversely proportional to probability
							const opacity = Math.min(0.5, (1 - probability) * 0.6);
							backgroundColor = `rgba(0, 0, 255, ${opacity})`;
						}
					}

					return (
						<span
							key={`${token.token}-${index}`}
							data-token-index={index}
							className={twJoin(
								"relative inline rounded-sm transition-colors",
								isActive ? "outline outline-slate-700" : "",
							)}
							style={{ backgroundColor }}
							onMouseEnter={(e) => {
								if (externalHoveredIndex === undefined) {
									// Immediate highlight
									setHighlightIndex(index);

									if (closeTimer.current) clearTimeout(closeTimer.current);
									if (openTimer.current) clearTimeout(openTimer.current);

									// Close previous tooltip immediately
									setTooltipIndex(null);
									setAnchorEl(null);

									// Delay opening new tooltip
									const target = e.currentTarget;
									openTimer.current = setTimeout(() => {
										setAnchorEl(target);
										setTooltipIndex(index);
									}, 300);
								}
							}}
							onMouseLeave={() => {
								if (externalHoveredIndex === undefined) {
									setHighlightIndex(null);
									if (openTimer.current) clearTimeout(openTimer.current);
									scheduleClose();
								}
							}}
						>
							{token.token}
						</span>
					);
				})}
			</Container>

			{tooltipIndex !== null && anchorEl && activeToken && (
				<FloatingTokenMenu
					anchorEl={anchorEl}
					token={activeToken}
					alternatives={activeAlternatives}
					disabled={disabled}
					onSelect={(alt) => {
						onSelectAlternative?.(tooltipIndex, alt);
						setAnchorEl(null);
						setTooltipIndex(null);
						setHighlightIndex(null);
						isHoveringMenuRef.current = false;
					}}
					onMouseEnter={() => {
						if (closeTimer.current) clearTimeout(closeTimer.current);
						isHoveringMenuRef.current = true;
					}}
					onMouseLeave={() => {
						isHoveringMenuRef.current = false;
						scheduleClose();
					}}
				/>
			)}
		</>
	);
};

export default TokenInlineRenderer;
