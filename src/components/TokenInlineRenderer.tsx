import { Popover } from "@mantine/core";
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
	hoveredIndex: externalHoveredIndex = null,
}: TokenInlineRendererProps & { hoveredIndex?: number | null }) => {
	const [internalHoveredIndex, setInternalHoveredIndex] = useState<
		number | null
	>(null);
	const [isDropdownHover, setIsDropdownHover] = useState(false);
	const isDropdownHoverRef = useRef(false);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const Container = inline ? "span" : "div";

	useEffect(() => {
		isDropdownHoverRef.current = isDropdownHover;
	}, [isDropdownHover]);

	// Sync external hover to internal state, but respect dropdown interaction
	const effectiveHoveredIndex = useMemo(() => {
		if (isDropdownHover) {
			return internalHoveredIndex;
		}
		return externalHoveredIndex ?? internalHoveredIndex;
	}, [externalHoveredIndex, internalHoveredIndex, isDropdownHover]);

	// Update internal state when external changes (to keep track of last hovered for dropdown)
	if (
		externalHoveredIndex !== null &&
		externalHoveredIndex !== internalHoveredIndex
	) {
		setInternalHoveredIndex(externalHoveredIndex);
	}

	const visibleTokens = useMemo(
		() => tokens.filter((token) => token.token.length > 0),
		[tokens],
	);

	const scheduleClose = () => {
		if (closeTimer.current) {
			clearTimeout(closeTimer.current);
		}
		closeTimer.current = setTimeout(() => {
			if (!isDropdownHoverRef.current) {
				setInternalHoveredIndex(null);
			}
		}, 120);
	};

	useEffect(() => {
		if (externalHoveredIndex === null) {
			scheduleClose();
		} else {
			if (closeTimer.current) {
				clearTimeout(closeTimer.current);
			}
		}
	}, [externalHoveredIndex]);

	return (
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
				const alternatives =
					token.alternatives.length > 0
						? token.alternatives
						: [{ token: token.token, probability: probability ?? 0 }];
				const isActive = effectiveHoveredIndex === index;

				const tokenSpan = (
					<span
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
						onMouseEnter={() => {
							if (closeTimer.current) {
								clearTimeout(closeTimer.current);
							}
							setInternalHoveredIndex(index);
						}}
						onMouseLeave={scheduleClose}
					>
						{token.token}
					</span>
				);

				if (!isActive) {
					return <span key={`${token.token}-${index}`}>{tokenSpan}</span>;
				}

				return (
					<Popover
						key={`${token.token}-${index}`}
						width={280}
						shadow="md"
						opened={true}
						withinPortal
						position="top"
						offset={0}
					>
						<Popover.Target>{tokenSpan}</Popover.Target>
						<Popover.Dropdown
							className="!w-fit p-0"
							onMouseEnter={() => {
								if (closeTimer.current) {
									clearTimeout(closeTimer.current);
								}
								setIsDropdownHover(true);
								// Ensure we keep the current index active
								setInternalHoveredIndex(index);
							}}
							onMouseLeave={() => {
								setIsDropdownHover(false);
								scheduleClose();
							}}
						>
							<div className="flex">
								{alternatives.slice(0, 8).map((alt) => (
									<button
										key={`${index}-${alt.token}-${alt.probability}`}
										type="button"
										className={twJoin(
											"flex flex-col items-center justify-between border border-solid border-l-0 border-y-0 border-slate-200 px-2 py-1 text-left text-sm text-slate-800 transition bg-white hover:bg-slate-50",
											disabled ? "cursor-not-allowed opacity-60" : "",
										)}
										onClick={() => {
											if (disabled) {
												return;
											}
											onSelectAlternative?.(index, alt);
											setInternalHoveredIndex(null);
											setIsDropdownHover(false);
										}}
									>
										<span className="font-mono">{formatToken(alt.token)}</span>
										<span className="text-xs text-slate-500">
											{(alt.probability * 100).toFixed(1)}%
										</span>
									</button>
								))}
							</div>
						</Popover.Dropdown>
					</Popover>
				);
			})}
		</Container>
	);
};

export default TokenInlineRenderer;
