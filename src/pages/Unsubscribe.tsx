import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "ready" | "done" | "already" | "invalid" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) { setState("invalid"); return; }
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`;
        const r = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
        const data = await r.json();
        if (data.valid) setState("ready");
        else if (data.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch { setState("error"); }
    })();
  }, [token]);

  const confirm = async () => {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
    setSubmitting(false);
    if (error || !data?.success) setState("error");
    else setState("done");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader><CardTitle>Cancelar inscrição</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" /> Validando link...</div>}
          {state === "ready" && (
            <>
              <p>Confirma o cancelamento de inscrição? Você não receberá mais emails desta plataforma.</p>
              <Button onClick={confirm} disabled={submitting} className="w-full">{submitting ? "Processando..." : "Confirmar cancelamento"}</Button>
            </>
          )}
          {state === "done" && <div className="flex items-center gap-2 text-success"><CheckCircle2 className="h-5 w-5" /> Inscrição cancelada com sucesso.</div>}
          {state === "already" && <div className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="h-5 w-5" /> Você já havia cancelado a inscrição.</div>}
          {state === "invalid" && <div className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" /> Link inválido ou expirado.</div>}
          {state === "error" && <div className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" /> Erro ao processar. Tente novamente.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
