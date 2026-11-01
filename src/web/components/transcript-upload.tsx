import { useEffect, useRef, useState } from 'react';
import { readTranscriptFile, TRANSCRIPT_ACCEPT } from '../../shared/transcript-files.js';
import { Input } from './ui/input';

export function TranscriptUpload({ id, disabled, onText, onError, onReading, maxCharacters }: {
  id: string;
  disabled?: boolean;
  onText: (text: string) => void;
  onError: (error: string) => void;
  onReading?: (reading: boolean) => void;
  maxCharacters?: number;
}) {
  const [reading, setReading] = useState(false);
  const attempt = useRef(0);
  const readingCallback = useRef(onReading);
  readingCallback.current = onReading;
  useEffect(() => () => { attempt.current++; readingCallback.current?.(false); }, []);
  return <div className="space-y-2">
    <Input id={id} type="file" accept={TRANSCRIPT_ACCEPT} disabled={disabled || reading}
      aria-describedby={`${id}-help`}
      onChange={async event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;
        const current = ++attempt.current;
        setReading(true);
        onReading?.(true);
        try {
          const text = await readTranscriptFile(file);
          if (maxCharacters && text.length > maxCharacters) throw new Error('Built-in chat accepts up to 60,000 characters per message. Shorten the transcript, or add it to a project instead.');
          if (attempt.current === current) { onText(text); onError(''); }
        } catch (error) {
          if (attempt.current === current) onError(error instanceof Error ? error.message : 'Something went wrong reading this file. Try again, or paste the text instead.');
        } finally {
          if (attempt.current === current) { setReading(false); onReading?.(false); }
        }
      }} />
    <p id={`${id}-help`} className="text-xs leading-5 text-muted-foreground">TXT, Markdown, VTT, SRT or DOCX, up to 5 MB. Converted text can be up to 300 KB.{maxCharacters ? ' Built-in chat accepts up to 60,000 characters per message.' : ''}</p>
    {reading && <p role="status" className="text-xs text-muted-foreground">Reading transcript…</p>}
  </div>;
}
