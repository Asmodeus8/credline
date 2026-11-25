"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site";
import { api, post } from "@/lib/api";
import type { Session } from "@/lib/types";

export default function MeLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>();
  const router = useRouter();

  useEffect(() => {
    api<Session>("/auth/session")
      .then((s) => (s.type === "BORROWER" ? setSession(s) : router.replace("/signin")))
      .catch(() => router.replace("/signin"));
  }, [router]);

  const signOut = async () => {
    await post("/auth/logout");
    router.replace("/");
  };

  return (
    <div className="min-h-screen">
      <SiteHeader
        right={
          session && (
            <div className="flex items-center gap-2">
              <Link href="/me" className="hidden items-center gap-2 rounded-full py-1 pr-3 pl-1 hover:bg-ink/5 sm:flex">
                <span className="grid size-8 place-items-center rounded-full bg-ink text-[12px] font-semibold text-lime">
                  {session.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <span className="text-sm font-medium">{session.name.split(" ")[0]}</span>
              </Link>
              <button onClick={signOut} className="rounded-full p-2 text-mute hover:bg-ink/5 hover:text-ink" aria-label="Sign out">
                <LogOut className="size-4" />
              </button>
            </div>
          )
        }
      />
      <main className="mx-auto max-w-5xl px-5 pt-2 pb-20 sm:px-8">{session ? children : null}</main>
    </div>
  );
}
