export interface Message {
	role: string;
	content: string;
	reasoning_content?: string;
	_metadata: {
		uuid: string;
	};
	_abortController?: AbortController;
}
