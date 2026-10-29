import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { AccountFrame } from '@/components/account-frame';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { api, ApiError } from '@/lib/api';
import { savedModelSelection, savedModelPath, savedModelSignIn } from '../../shared/model-links.js';

export const Route = createFileRoute('/app/download/$projectId')({
  validateSearch: (s: Record<string, unknown>) => ({ model: s.model, revision: s.revision }),
  component: SavedDownload,
});
type ExportInfo = { name: string; revision: number; model: string; filename: string };
function SavedDownload() {
  const { projectId } = Route.useParams(), search = Route.useSearch();
  const selection = savedModelSelection(projectId, search.model, search.revision);
  const model = selection?.model, revision = selection?.revision;
  const [info, setInfo] = useState<ExportInfo | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    setInfo(null); setError('');
    if (!model || !revision) { setError('This download link is incomplete or invalid. Open the saved model to choose an export.'); return; }
    void api<ExportInfo>(`/api/projects/${projectId}/export-info?model=${model}&revision=${revision}`, { signal: abort.signal })
      .then(setInfo).catch(e => {
        if (abort.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) window.location.assign(savedModelSignIn(projectId, model, revision, true));
        else setError(e.message);
      });
    return () => abort.abort();
  }, [projectId, model, revision]);
  return <AccountFrame><main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10 sm:px-6">
    <h1 className="text-3xl font-semibold tracking-tight">Download BPMN</h1>
    {error ? <Alert variant="destructive"><AlertTitle>Download unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      : !info ? <p role="status">Checking this saved version…</p> : <>
        <h2 className="text-xl font-semibold">{info.name}</h2>
        <p>{info.model === 'to-be' ? 'To-be' : 'As-is'} · Revision {info.revision}</p>
        <p className="leading-7 text-muted-foreground">Download this saved process with its diagram layout. Opening or reloading this page does not start a download.</p>
        <Button className="self-start" asChild><a download={info.filename} href={`/api/projects/${projectId}/bpmn?model=${info.model}&revision=${info.revision}`}><Download />Download BPMN</a></Button>
        <a className="underline underline-offset-4" href={savedModelPath(projectId, info.model, info.revision) || '/app'}>Review this saved version</a>
      </>}
    <a className="text-sm underline underline-offset-4" href="/app">Your processes</a>
  </main></AccountFrame>;
}
