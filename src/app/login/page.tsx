import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Masuk · JOUMPA CSS Survey",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm next={next ?? "/"} />;
}
