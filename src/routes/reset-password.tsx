import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Set a new password — ASTRA STYLIN" }, { name: "description", content: "Choose a new password for your ASTRA STYLIN account." }, { property: "og:title", content: "Set a new password — ASTRA STYLIN" }, { property: "og:description", content: "Choose a new password for your ASTRA STYLIN account." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setReady(true);
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY") setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated");
    navigate({ to: "/account", replace: true });
  }
  return (
    <section className="mx-auto max-w-md px-5 py-20">
      <h1 className="font-display text-center text-5xl">New password</h1>
      {ready ? (
        <form onSubmit={submit} className="mt-10 space-y-5">
          <div><Label htmlFor="npw">New password</Label><Input id="npw" type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} className="mt-2" /></div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
        </form>
      ) : <p className="mt-8 text-center text-sm text-muted-foreground">Open this page from the reset link in your email.</p>}
    </section>
  );
}
