// deno test --allow-import errors.test.ts

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createWhatsAppProviderError, isWhatsAppProviderError } from "./errors.ts";

Deno.test("createWhatsAppProviderError monta erro com code/retryable/name corretos", () => {
  const err = createWhatsAppProviderError("UPSTREAM_TIMEOUT", "excedeu o tempo");
  assertEquals(err.name, "WhatsAppProviderError");
  assertEquals(err.code, "UPSTREAM_TIMEOUT");
  assertEquals(err.retryable, true); // default por RETRYABLE_CODES
  assertEquals(err.message, "excedeu o tempo");
});

Deno.test("retryable pode ser sobrescrito explicitamente", () => {
  const err = createWhatsAppProviderError("UPSTREAM_TIMEOUT", "x", { retryable: false });
  assertEquals(err.retryable, false);
});

Deno.test("códigos não listados como retryable têm retryable=false por padrão", () => {
  const err = createWhatsAppProviderError("PROVIDER_UNKNOWN", "x");
  assertEquals(err.retryable, false);
});

Deno.test("isWhatsAppProviderError distingue de Error genérico", () => {
  const custom = createWhatsAppProviderError("MISSING_CREDENTIALS", "sem token");
  const generic = new Error("qualquer coisa");
  assertEquals(isWhatsAppProviderError(custom), true);
  assertEquals(isWhatsAppProviderError(generic), false);
  assertEquals(isWhatsAppProviderError(null), false);
  assertEquals(isWhatsAppProviderError(undefined), false);
});

Deno.test("providerErrorCode/subcode/traceId são preservados quando fornecidos", () => {
  const err = createWhatsAppProviderError("UPSTREAM_HTTP_ERROR", "x", {
    providerErrorCode: "100",
    providerErrorSubcode: "33",
    providerTraceId: "Trc1",
  });
  assertEquals(err.providerErrorCode, "100");
  assertEquals(err.providerErrorSubcode, "33");
  assertEquals(err.providerTraceId, "Trc1");
});
