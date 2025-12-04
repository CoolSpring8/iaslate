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

const TokenInlineRenderer = ({
	tokens = [],
	onSelectAlternative,
	disabled = false,
	className,
	inline = false,
	hoveredIndex: externalHoveredIndex,
}: TokenInlineRendererProps & { hoveredIndex?: number | null }) => {
	const [activeIndex, setActiveIndex] = useState<number | null>(null);
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isHoveringMenuRef = useRef(false);

	const { refs, floatingStyles, isPositioned } = useFloating({
		placement: "top",
		middleware: [offset(0), flip(), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	});

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
				setActiveIndex(null);
			}
		}, 100);
	};

	// Sync external hover to internal state
	useEffect(() => {
		if (externalHoveredIndex !== undefined && externalHoveredIndex !== null) {
			if (closeTimer.current) clearTimeout(closeTimer.current);
			const element = document.querySelector(
				`[data-token-index="${externalHoveredIndex}"]`,
			);
			if (element instanceof HTMLElement) {
				setAnchorEl(element);
				setActiveIndex(externalHoveredIndex);
			}
		} else if (externalHoveredIndex === null) {
			// Only clear if we are explicitly told to clear (null),
			// but if we are in uncontrolled mode (undefined), don't force clear
			if (inline && externalHoveredIndex === null) {
				// In controlled mode (inline=true usually implies TextCompletionView),
				// we might want to respect the parent's clear signal.
				// However, TextCompletionView sends null when leaving textarea.
				// We should only clear if we are NOT hovering the menu.
				scheduleClose();
			}
		}
	}, [externalHoveredIndex, inline]);

	useEffect(() => {
		refs.setReference(anchorEl);
	}, [anchorEl, refs]);

	const activeToken =
		activeIndex !== null && visibleTokens[activeIndex]
			? visibleTokens[activeIndex]
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
					const isActive = activeIndex === index;

					return (
						<span
							key={`${token.token}-${index}`}
							data-token-index={index}
							className={twJoin(
								"relative inline rounded-sm transition",
								isActive
									? "border-sky-400 bg-sky-50 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]"
									: "",
							)}
							style={
								isActive && probability !== undefined
									? {
											backgroundColor: `rgba(56, 189, 248, ${Math.min(
												0.18,
												Math.max(0.06, probability / 5),
											)})`,
										}
									: undefined
							}
							onMouseEnter={(e) => {
								if (externalHoveredIndex === undefined) {
									if (closeTimer.current) clearTimeout(closeTimer.current);
									setAnchorEl(e.currentTarget);
									setActiveIndex(index);
								}
							}}
							onMouseLeave={() => {
								if (externalHoveredIndex === undefined) {
									scheduleClose();
								}
							}}
						>
							{token.token}
						</span>
					);
				})}
			</Container>

			{activeIndex !== null && anchorEl && (
				<FloatingPortal>
					<div
						ref={refs.setFloating}
						style={{
							...floatingStyles,
							zIndex: 1000,
							opacity: isPositioned ? 1 : 0,
						}}
						data-token-menu
						className="!w-fit p-0 rounded bg-white shadow-md border border-slate-200 overflow-hidden transition-opacity duration-75"
						onMouseEnter={() => {
							if (closeTimer.current) clearTimeout(closeTimer.current);
							isHoveringMenuRef.current = true;
						}}
						onMouseLeave={() => {
							isHoveringMenuRef.current = false;
							scheduleClose();
						}}
					>
						<div className="flex">
							{activeAlternatives.slice(0, 8).map((alt) => (
								<button
									key={`${activeIndex}-${alt.token}-${alt.probability}`}
									type="button"
									className={twJoin(
										"flex flex-col items-center justify-between border border-solid border-l-0 border-y-0 border-slate-200 px-2 py-1 text-left text-sm text-slate-800 transition bg-white hover:bg-slate-50",
										disabled ? "cursor-not-allowed opacity-60" : "",
									)}
									onClick={() => {
										if (disabled) {
											return;
										}
										onSelectAlternative?.(activeIndex, alt);
										// Close menu after selection
										setAnchorEl(null);
										setActiveIndex(null);
										isHoveringMenuRef.current = false;
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
			)}
		</>
	);
};

export default TokenInlineRenderer;
