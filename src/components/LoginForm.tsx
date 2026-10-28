"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { login, type LoginState } from "@/app/login/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [visible, setVisible] = useState(false);
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <form action={action} className="card w-full max-w-sm p-7">
        <Image src="/logo-joumpa-header.webp" alt="JOUMPA Airport VIP Service" width={879} height={226} priority className="h-11 w-auto" />
        <p className="eyebrow mt-6">JOUMPA CSS Survey Dashboard</p>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight text-ink">Masuk admin</h1>
        <p className="mt-2 text-sm text-muted">Halaman ini hanya untuk pengelola. Cabang membuka dashboardnya lewat link khusus.</p>

        <input type="hidden" name="next" value={next} />
        <label htmlFor="password" className="eyebrow mt-6 block">
          Password
        </label>
        <div className="relative mt-1.5">
          <input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            required
            autoFocus
            autoComplete="current-password"
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? "login-error" : undefined}
            className="min-h-11 w-full rounded-lg border border-line-strong bg-card py-0 pr-11 pl-3 text-sm"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Sembunyikan password" : "Lihat password"}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted hover:text-ink"
          >
            {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        </div>
        {state.error && (
          <p id="login-error" role="alert" className="mt-2 text-sm font-semibold text-crit">
            {state.error}
          </p>
        )}
        <button
          disabled={pending}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
        >
          <LockKeyhole aria-hidden className="size-4" />
          {pending ? "Memeriksa…" : "Masuk"}
        </button>
      </form>
    </main>
  );
}
