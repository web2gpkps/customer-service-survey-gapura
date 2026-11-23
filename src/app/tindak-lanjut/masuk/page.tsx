import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FollowupLogin } from "@/components/followup/FollowupLogin";
import { getRole } from "@/lib/followup/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Masuk · Tindak Lanjut JOUMPA",
  robots: { index: false, follow: false },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getRole()) redirect("/tindak-lanjut");
  const { next } = await searchParams;
  return <FollowupLogin next={next ?? "/tindak-lanjut"} />;
}
