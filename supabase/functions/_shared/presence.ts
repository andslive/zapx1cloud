// Presence Engine — dispara "digitando..." / "gravando áudio..." real no WhatsApp
// via uazapi (POST /message/presence). O uazapi sustenta a presença por até 5min
// reenviando o estado a cada 10s internamente, então só precisamos renovar
// quando a duração ultrapassar o delay enviado.
// Docs: https://docs.uazapi.com/endpoint/post/message~presence

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

export type PresenceState = "composing" | "recording" | "paused";

export interface PresenceTarget {
  organization_id: string;
  instance_id: string;
  phone: string;
}

export interface PresenceHandle {
  stop: () => Promise<void>;
}

interface SendPresenceArgs extends PresenceTarget {
  state: PresenceState;
  isAudio?: boolean;
  durationMs?: number;
}

// Renovação a cada 4 minutos (uazapi tem ticks internos de 10s, max 5min)
const RENEW_MS = 240_000;
const DEFAULT_DURATION_MS = 30_000;

async function callEvolutionSend(
  supabase: SupabaseClient,
  args: SendPresenceArgs,
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        organization_id: args.organization_id,
        instance_id: args.instance_id,
        type: "presence",
        to: args.phone,
        payload: {
          state: args.state,
          presence: args.state,
          isAudio: args.isAudio === true || args.state === "recording",
          delay: args.durationMs,
          duration_ms: args.durationMs,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(
        `[presence] failed status=${res.status} state=${args.state} phone=${args.phone} body=${body.slice(0, 200)}`,
      );
    } else {
      console.log(`[presence] sent state=${args.state} phone=${args.phone} duration=${args.durationMs || "default"}ms`);
    }
  } catch (err: any) {
    console.error(`[presence] exception state=${args.state}: ${err?.message || String(err)}`);
  }
}

export async function sendPresence(
  supabase: SupabaseClient,
  args: SendPresenceArgs,
): Promise<void> {
  await callEvolutionSend(supabase, args);
}

/**
 * Inicia "digitando..." (ou "gravando áudio..." se isAudio) usando o delay nativo
 * do uazapi. Retorna handle.stop() que dispara "paused".
 */
export async function startTyping(
  supabase: SupabaseClient,
  args: PresenceTarget & { isAudio?: boolean; enabled?: boolean; durationMs?: number },
): Promise<PresenceHandle> {
  if (args.enabled === false) {
    return { stop: async () => {} };
  }
  const state: PresenceState = args.isAudio ? "recording" : "composing";
  const durationMs = Math.max(1000, Math.min(300_000, args.durationMs ?? DEFAULT_DURATION_MS));

  await sendPresence(supabase, { ...args, state, durationMs });

  let stopped = false;
  // Renova caso a duração esperada seja muito longa (>4min)
  const interval = setInterval(() => {
    if (stopped) return;
    sendPresence(supabase, { ...args, state, durationMs }).catch(() => {});
  }, RENEW_MS);

  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      clearInterval(interval);
      await sendPresence(supabase, { ...args, state: "paused" });
    },
  };
}

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function humanTypingMs(
  chars: number,
  opts: { charsPerSec?: number; minMs?: number; maxMs?: number; jitterPct?: number } = {},
): number {
  const cps = Math.max(5, opts.charsPerSec ?? 28);
  const minMs = opts.minMs ?? 1500;
  const maxMs = opts.maxMs ?? 7000;
  const jitter = Math.max(0, Math.min(60, opts.jitterPct ?? 15)) / 100;
  const base = (Math.max(0, chars) / cps) * 1000;
  const jitterFactor = 1 + (Math.random() * 2 - 1) * jitter;
  return clamp(base * jitterFactor, minMs, maxMs);
}
