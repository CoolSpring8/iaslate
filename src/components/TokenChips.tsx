import { Popover } from "@mantine/core";
import { useState } from "react";
import { twJoin } from "tailwind-merge";
import type { TokenAlternative, TokenLogprob } from "../types";

interface TokenChipsProps {
	tokens?: TokenLogprob[];
	onSelectAlternative?: (index: number, alternative: TokenAlternative) => void;
	disabled?: boolean;
	className?: string;
}

const formatToken = (token: string) =>
	token.replaceAll(" ", "·").replaceAll("\n", "↵").replaceAll("\t", "⇥") || "∅";

const TokenChips = ({
	tokens = [],
	onSelectAlternative,
	disabled = false,
	className,
}: TokenChipsProps) => {
	const [openedIndex, setOpenedIndex] = useState<number | null>(null);

	return (
		<div
			className={twJoin(
				"flex flex-wrap gap-1 text-sm font-mono text-slate-800",
				className,
			)}
			onMouseLeave={() => setOpenedIndex(null)}
		>
			{tokens.map((token, index) => {
				const probability =
					token.probability ??
					token.alternatives.find((alt) => alt.token === token.token)
						?.probability ??
					undefined;
				const alternatives =
					token.alternatives.length > 0
						? token.alternatives
						: [{ token: token.token, probability: probability ?? 0 }];
				const backgroundIntensity = Math.min(
					100,
					Math.round((probability ?? 0) * 120),
				);
				return (
					<Popover
						key={`${token.token}-${index}`}
						width={260}
						shadow="md"
						opened={openedIndex === index}
						onChange={(opened) => setOpenedIndex(opened ? index : null)}
						position="bottom"
						withinPortal
					>
						<Popover.Target>
							<button
								type="button"
								className={twJoin(
									"rounded-md border border-solid border-slate-200 bg-white px-2 py-1 leading-tight shadow-sm transition",
									disabled
										? "cursor-not-allowed opacity-60"
										: "hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md",
								)}
								style={{
									backgroundImage: `linear-gradient(90deg, rgba(59,130,246,0.18) ${backgroundIntensity}%, transparent ${backgroundIntensity}%)`,
								}}
								onMouseEnter={() => setOpenedIndex(index)}
								onFocus={() => setOpenedIndex(index)}
								onMouseLeave={() => setOpenedIndex(null)}
								disabled={disabled}
							>
								<span className="text-slate-900">
									{formatToken(token.token)}
								</span>
								{typeof probability === "number" && (
									<span className="ml-2 text-[11px] text-slate-500">
										{(probability * 100).toFixed(1)}%
									</span>
								)}
							</button>
						</Popover.Target>
						<Popover.Dropdown>
							<div className="flex flex-col gap-1">
								<p className="mb-1 text-xs font-semibold text-slate-600">
									Alternatives
								</p>
								{alternatives.slice(0, 8).map((alt) => (
									<button
										key={`${index}-${alt.token}-${alt.probability}`}
										type="button"
										className="flex items-center justify-between gap-2 rounded border border-solid border-slate-200 px-2 py-1 text-left text-sm text-slate-800 hover:bg-slate-50"
										onClick={() => {
											if (disabled) {
												return;
											}
											onSelectAlternative?.(index, {
												token: alt.token,
												probability: alt.probability,
											});
											setOpenedIndex(null);
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
		</div>
	);
};

export default TokenChips;
