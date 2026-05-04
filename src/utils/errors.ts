import {
	AISDKError,
	APICallError,
	JSONParseError,
	RetryError,
	TypeValidationError,
} from "ai";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const getNonEmptyString = (value: unknown) =>
	typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;

const parseJson = (value: string): unknown | undefined => {
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
};

const messageFromOpenAICompatiblePayload = (value: unknown) => {
	if (!isRecord(value) || !isRecord(value["error"])) {
		return undefined;
	}
	return getNonEmptyString(value["error"]["message"]);
};

const messageFromResponseBody = (responseBody: string | undefined) => {
	const body = getNonEmptyString(responseBody);
	if (!body) {
		return undefined;
	}
	const parsed = parseJson(body);
	return messageFromOpenAICompatiblePayload(parsed) ?? body;
};

const messageFromErrorCause = (cause: unknown) => {
	if (cause instanceof Error) {
		return cause.message;
	}
	return getNonEmptyString(cause);
};

const messageFromKnownError = (error: unknown): string | undefined => {
	if (APICallError.isInstance(error)) {
		return (
			messageFromOpenAICompatiblePayload(error.data) ??
			messageFromResponseBody(error.responseBody) ??
			error.message
		);
	}
	if (RetryError.isInstance(error)) {
		return messageFromKnownError(error.lastError) ?? error.message;
	}
	if (TypeValidationError.isInstance(error)) {
		return messageFromErrorCause(error.cause) ?? error.message;
	}
	if (JSONParseError.isInstance(error)) {
		return messageFromErrorCause(error.cause) ?? error.message;
	}
	if (AISDKError.isInstance(error)) {
		return error.message;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return undefined;
};

export const errorToToastMessage = (error: unknown) => {
	if (typeof error === "string") {
		const parsed = parseJson(error);
		return messageFromOpenAICompatiblePayload(parsed) ?? error;
	}
	return (
		messageFromKnownError(error) ??
		messageFromOpenAICompatiblePayload(error) ??
		String(error)
	);
};
