import {
	Button,
	Group,
	Input,
	Modal,
	Popover,
	Select,
	Text,
	Textarea,
	UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { get, set } from "idb-keyval";
import { OpenAI } from "openai";
import {
	type MutableRefObject,
	type ReactElement,
	useEffect,
	useRef,
	useState,
} from "react";
// import remarkGfm from "remark-gfm";
import { useForm } from "react-hook-form";
import Markdown from "react-markdown";
import { Toaster, toast } from "sonner";
import { twJoin } from "tailwind-merge";
import { useImmer } from "use-immer";
import { v4 as uuidv4 } from "uuid";

const baseURLKey = "iaslate_baseURL";
const apiKeyKey = "iaslate_apiKey";
const modelsKey = "iaslate_models";

interface Message {
	role: string;
	content: string;
	_metadata: {
		uuid: string;
	};
	_abortController?: AbortController;
}

const Component = ({ children }: { children: () => ReactElement }) =>
	children();

const App = () => {
	const [messagesList, setMessagesList] = useImmer<Message[]>([
		{
			role: "system",
			content: "You are a helpful assistant.",
			_metadata: {
				uuid: uuidv4(),
			},
		},
	]);

	const [baseURL, setBaseURL] = useState("");

	const [apiKey, setAPIKey] = useState("");

	const [models, setModels] = useImmer<OpenAI.Model[]>([]);

	const [activeModel, setActiveModel] = useImmer<string | null>(null);

	const client = (() => {
		const ref = useRef<OpenAI | null>(null);
		if (!ref.current) {
			ref.current = new OpenAI({
				baseURL: baseURL,
				// Avoid "Missing OpenAI API key" error
				apiKey: apiKey || "_PLACEHOLDER_",
				dangerouslyAllowBrowser: true,
			});
		}
		return ref as MutableRefObject<OpenAI>;
	})();

	useEffect(() => {
		(async () => {
			const storedBaseURL = await get<string>(baseURLKey);
			if (storedBaseURL) {
				setBaseURL(storedBaseURL);
			}
			const storedAPIKey = await get(apiKeyKey);
			if (storedAPIKey) {
				setAPIKey(storedAPIKey);
			}
			const storedModels = await get(modelsKey);
			if (storedModels) {
				setModels(storedModels);
			}
			client.current = new OpenAI({
				baseURL: storedBaseURL,
				apiKey: storedAPIKey || "_PLACEHOLDER_",
				dangerouslyAllowBrowser: true,
			});
			if (!storedModels) {
				const response = await client.current.models.list();
				setModels(response.data);
				await set(modelsKey, response.data);
				setActiveModel(response.data[0].id);
			}
		})();
	}, []);

	const [isGenerating, setIsGenerating] = useState(false);

	const [prompt, setPrompt] = useImmer("");

	const [isSettingsOpen, { open: onSettingsOpen, close: onSettingsClose }] =
		useDisclosure();

	const [editingIndex, setEditingIndex] = useState<number | undefined>(
		undefined,
	);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			const hasSessionState =
				isGenerating ||
				prompt.trim().length > 0 ||
				typeof editingIndex !== "undefined" ||
				messagesList.length > 1;
			if (!hasSessionState) {
				return;
			}
			event.preventDefault();
			event.returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [isGenerating, prompt, editingIndex, messagesList.length]);

	return (
		<div className="flex flex-col h-screen">
			<div className="flex items-center px-4 py-2">
				<div className="flex items-center gap-2">
					<h1 className="text-xl font-bold font-mono">iaslate</h1>
					<Select
						className="w-64"
						data={models.map((m) => ({ value: m.id, label: m.name || m.id }))}
						value={activeModel}
						onChange={setActiveModel}
						placeholder="Select a model"
						aria-label="Select a model"
					/>
				</div>
				<div className="ml-auto flex gap-4">
					<UnstyledButton
						className="i-lucide-eraser w-5 h-5"
						title="Clear conversation"
						onClick={() => {
							messagesList.forEach((message) => {
								message._abortController?.abort?.();
							});
							setIsGenerating(false);
							setEditingIndex(undefined);
							setPrompt("");
							setMessagesList([]);
						}}
					/>
					<UnstyledButton
						className="i-lucide-file-output w-5 h-5"
						title="Export to JSON"
						onClick={() => {
							const blob = new Blob([JSON.stringify(messagesList, null, 2)], {
								type: "application/json",
							});
							const url = URL.createObjectURL(blob);
							const a = document.createElement("a");
							a.href = url;
							a.download = `messages_${new Date().toISOString()}.json`;
							a.click();
							URL.revokeObjectURL(url);
							toast.success("Exported to JSON");
						}}
					/>
					<UnstyledButton
						className="i-lucide-settings w-5 h-5"
						title="Settings"
						onClick={onSettingsOpen}
					/>
				</div>
			</div>
			<div
				className="flex-1 overflow-y-auto px-4 py-2"
				onDrop={async (e) => {
					e.preventDefault();
					if (e.dataTransfer.items) {
						for (const item of e.dataTransfer.items) {
							if (item.kind === "file") {
								const file = item.getAsFile();
								if (file) {
									const content = await file.text();
									setPrompt((draft) => {
										draft += content;
									});
								}
							}
						}
					}
				}}
				onDragOver={(e) => {
					e.preventDefault();
				}}
			>
				{messagesList.map((message, index) => (
					<Component key={message._metadata.uuid}>
						{() => {
							const [isHovered, setIsHovered] = useState(false);
							const [hasBeenClicked, setHasBeenClicked] = useState(false);
							return (
								<div
									className={twJoin(
										"mb-2 hover:bg-slate-50",
										editingIndex === index && "bg-sky-100 opacity-50",
									)}
									onMouseOver={() => setIsHovered(true)}
									onMouseLeave={() => setIsHovered(false)}
								>
									<div className="flex items-center gap-2">
										<p
											className="my-0 font-bold"
											onClick={() => {
												setHasBeenClicked((v) => !v);
											}}
										>
											{message.role}
										</p>
										{(hasBeenClicked || isHovered) && (
											<>
												<UnstyledButton
													className="i-lucide-copy text-slate-400 hover:text-slate-600 transition"
													onClick={() => {
														try {
															navigator.clipboard.writeText(message.content);
															toast("Copied to clipboard", {
																position: "top-center",
															});
														} catch (e) {
															toast("Failed to copy to clipboard");
														}
													}}
												/>
												<UnstyledButton
													className="i-lucide-edit text-slate-400 hover:text-slate-600 transition"
													onClick={() => {
														setEditingIndex(index);
														setPrompt(message.content);
													}}
												/>
												<Popover width={200} position="bottom" withArrow>
													<Popover.Target>
														<UnstyledButton className="i-lucide-trash text-slate-400 hover:text-slate-600 transition" />
													</Popover.Target>
													<Popover.Dropdown>
														<div className="flex flex-col">
															<Text>Delete?</Text>
															<Button
																className="min-w-0 h-auto flex-1 !p-1 text-xs self-end"
																onClick={() => {
																	message._abortController?.abort?.();
																	if (typeof editingIndex !== "undefined") {
																		setEditingIndex(
																			editingIndex === index
																				? undefined
																				: editingIndex > index
																					? editingIndex - 1
																					: editingIndex,
																		);
																	}
																	setIsGenerating(false);
																	setMessagesList((draft) => {
																		draft.splice(index, 1);
																	});
																}}
															>
																Yes
															</Button>
														</div>
													</Popover.Dropdown>
												</Popover>
												<UnstyledButton
													className="i-lucide-unlink text-slate-400 hover:text-slate-600 transition"
													onClick={() => {
														messagesList[index]._abortController?.abort?.();
														if (isGenerating) {
															setIsGenerating(false);
														}
														if (
															typeof editingIndex !== "undefined" &&
															editingIndex >= index
														) {
															setEditingIndex(undefined);
															setPrompt("");
														}
														setMessagesList((m) => m.slice(0, index));
													}}
												/>
											</>
										)}
									</div>
									<div className="twp prose prose-p:whitespace-pre-wrap">
										<Markdown remarkPlugins={[]}>
											{`${message.content}${
												index === messagesList.length - 1 && isGenerating
													? "▪️"
													: ""
											}`}
										</Markdown>
									</div>
								</div>
							);
						}}
					</Component>
				))}
			</div>
			<Component>
				{() => {
					const isComposing = useRef(false);
					const handleSend = async () => {
						setPrompt("");
						const assistantMessageUUID = uuidv4();
						const assistantAbortController = new AbortController();
						const messagesNew = prompt
							? [
									...messagesList,
									{
										role: "user",
										content: prompt,
										_metadata: {
											uuid: uuidv4(),
										},
									},
									{
										role: "assistant",
										content: "",
										_metadata: {
											uuid: assistantMessageUUID,
										},
										_abortController: assistantAbortController,
									},
								]
							: [
									...messagesList,
									{
										role: "assistant",
										content: "",
										_metadata: {
											uuid: assistantMessageUUID,
										},
										_abortController: assistantAbortController,
									},
								];
						setMessagesList(messagesNew);
						const stream = await client.current.chat.completions.create(
							{
								model: activeModel,
								messages: messagesNew
									.map((m) => ({
										role: m.role,
										content: m.content,
									}))
									.slice(0, -1),
								// max_tokens: 2048,
								stream: true,
								temperature: 0.3,
								// cache_prompt: true,
							},
							{
								signal: assistantAbortController.signal,
							},
						);
						setIsGenerating(true);
						for await (const chunk of stream) {
							setMessagesList((draft) => {
								const targetMessage = draft.find(
									(m) => m._metadata.uuid === assistantMessageUUID,
								);
								if (
									chunk.choices[0].delta.content &&
									!assistantAbortController.signal.aborted &&
									typeof targetMessage !== "undefined"
								) {
									targetMessage.content =
										targetMessage.content + chunk.choices[0].delta.content;
								}
							});
						}
						setIsGenerating(false);
					};
					const handleFinishEdit = () => {
						setMessagesList((draft) => {
							draft[editingIndex as number].content = prompt;
						});
						setEditingIndex(undefined);
						setPrompt("");
					};
					const handleSubmit = () => {
						if (isGenerating) {
							messagesList[messagesList.length - 1]._abortController?.abort?.();
							return;
						}
						if (typeof editingIndex !== "undefined") {
							handleFinishEdit();
						} else {
							handleSend();
						}
					};
					return (
						<div className="relative px-4 py-2">
							<div className="flex items-center">
								<Textarea
									className="w-full"
									minRows={1}
									maxRows={5}
									placeholder="Type your message..."
									value={prompt}
									onChange={async (e) => {
										const v = e.target.value;
										setPrompt(v);
									}}
									onCompositionStart={() => {
										isComposing.current = true;
									}}
									onCompositionEnd={() => {
										isComposing.current = false;
									}}
									onKeyDown={async (e) => {
										if (
											e.key === "Enter" &&
											!e.shiftKey &&
											!e.nativeEvent.isComposing &&
											!isComposing.current
										) {
											e.preventDefault();
											handleSubmit();
										}
									}}
								/>
								<UnstyledButton
									className="ml-2 border rounded-full w-8 h-8 flex items-center justify-center"
									onClick={handleSubmit}
								>
									<div
										className={twJoin(
											"w-4 h-4",
											typeof editingIndex !== "undefined"
												? "i-lucide-check"
												: "i-lucide-send-horizontal",
											isGenerating ? "animate-spin" : "",
										)}
									/>
								</UnstyledButton>
							</div>
							{typeof editingIndex !== "undefined" && (
								<div className="absolute left-4 -top-8 h-8 w-[calc(100%-2rem)] rounded bg-orange-300 p-2 flex items-center text-slate-700 text-sm">
									<div className="i-lucide-edit flex-none" />
									<p className="ml-1 line-clamp-1">
										Editing: {messagesList[editingIndex].content}
									</p>
									<UnstyledButton
										className="i-lucide-x ml-auto flex-none"
										onClick={() => {
											setEditingIndex(undefined);
											setPrompt("");
										}}
									/>
								</div>
							)}
						</div>
					);
				}}
			</Component>
			<Component>
				{() => {
					const { register, handleSubmit } = useForm();

					return (
						<Modal
							opened={isSettingsOpen}
							onClose={onSettingsClose}
							title="Settings"
						>
							<form
								onSubmit={handleSubmit(async (data) => {
									setBaseURL(data["baseURL"]);
									await set(baseURLKey, data["baseURL"]);
									setAPIKey(data["apiKey"]);
									await set(apiKeyKey, data["apiKey"]);
									client.current = new OpenAI({
										baseURL: data["baseURL"],
										apiKey: data["apiKey"],
										dangerouslyAllowBrowser: true,
									});
									onSettingsClose();
								})}
							>
								<Input
									{...register("baseURL", { required: true })}
									defaultValue={baseURL}
									// In Mantine, use "rightSection" instead of "endContent"
									rightSection={
										<div className="i-lucide-server text-lg text-default-400 pointer-events-none flex-shrink-0" />
									}
									label="OpenAI-Compatible API Base"
									placeholder="https://.../v1"
									type="url"
								/>
								<Component>
									{() => {
										const [isVisible, setIsVisible] = useState(false);
										return (
											<Input
												{...register("apiKey", { required: true })}
												defaultValue={apiKey}
												rightSection={
													<UnstyledButton
														className="focus:outline-none"
														type="button"
														onClick={() => setIsVisible((v) => !v)}
													>
														{isVisible ? (
															<div className="i-lucide-eye text-lg text-default-400 pointer-events-none" />
														) : (
															<div className="i-lucide-eye-off text-lg text-default-400 pointer-events-none" />
														)}
													</UnstyledButton>
												}
												label="API Key"
												placeholder="sk-..."
												type={isVisible ? "text" : "password"}
											/>
										);
									}}
								</Component>
								<div className="flex items-center justify-between mt-4">
									<p>Models</p>
									<Button
										onClick={async () => {
											const response = await client.current.models.list();
											setModels(response.data);
											await set(modelsKey, response.data);
											if (!activeModel) {
												setActiveModel(response.data[0].id);
											}
										}}
									>
										Sync from API
									</Button>
								</div>
								<Group justify="flex-end" mt="md">
									<Button type="submit">Save</Button>
								</Group>
							</form>
						</Modal>
					);
				}}
			</Component>
			<Toaster />
		</div>
	);
};

export default App;
