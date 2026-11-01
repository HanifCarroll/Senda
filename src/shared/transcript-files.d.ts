export const TRANSCRIPT_ACCEPT: '.txt,.md,.vtt,.srt,.docx';
export const TRANSCRIPT_MAX_FILE_BYTES: 5000000;
export const TRANSCRIPT_MAX_TEXT_BYTES: 300000;

export type TranscriptFileErrorCode =
  | 'UNSUPPORTED_TRANSCRIPT'
  | 'TRANSCRIPT_FILE_TOO_LARGE'
  | 'TRANSCRIPT_TEXT_TOO_LARGE'
  | 'INVALID_TRANSCRIPT_ENCODING'
  | 'INVALID_CAPTIONS'
  | 'INVALID_DOCX'
  | 'DOCX_CONTENT_TOO_LARGE'
  | 'EMPTY_TRANSCRIPT'
  | 'READ_TRANSCRIPT_FAILED';

export class TranscriptFileError extends Error {
  readonly code: TranscriptFileErrorCode;
  constructor(code: TranscriptFileErrorCode);
}

export function readTranscriptBytes(input: { name: string; bytes: Uint8Array | ArrayBuffer }): string;
export function readTranscriptFile(file: {
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<string>;
