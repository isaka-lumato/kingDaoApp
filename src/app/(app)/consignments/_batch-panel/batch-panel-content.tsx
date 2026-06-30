// The in_ref batch panel was removed when the in_ref column was dropped (D-XXX).
// This component is no longer mounted by any page — it is kept as a stub to
// avoid dead-import TypeScript errors in case the file is still referenced
// transitionally.

type Props = {
  inRef: string;
  clientId: string;
  year: number;
};

export default async function BatchPanelContent({ inRef }: Props) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
      Batch panel for <span className="font-mono">{inRef}</span> is no longer
      available.
    </div>
  );
}
