export function LoadError({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24">
      <div className="card p-8">
        <p className="eyebrow">JOUMPA CSS Survey</p>
        <h1 className="mt-2 text-xl font-bold">Data Google Sheets belum bisa dimuat</h1>
        <p className="mt-3 text-sm text-ink-2">
          Cek isi <code className="font-mono">GOOGLE_SERVICE_ACCOUNT</code> dan{" "}
          <code className="font-mono">GOOGLE_SHEET_ID</code> di file <code className="font-mono">.env</code>. Spreadsheet
          juga harus sudah dibagikan ke email service account.
        </p>
        {process.env.NODE_ENV !== "production" ? (
          <pre className="mt-4 overflow-x-auto rounded-lg bg-crit-wash p-3 font-mono text-xs whitespace-pre-wrap text-crit">
            {message}
          </pre>
        ) : (
          <p className="mt-4 text-sm text-muted">Coba muat ulang beberapa saat lagi. Jika terus berulang, hubungi pengelola dashboard.</p>
        )}
      </div>
    </main>
  );
}
