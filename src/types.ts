export interface Message {
	role: string;
	content: string;
	_metadata: {
		uuid: string;
	};
	_abortController?: AbortController;
}
