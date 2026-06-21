import re

with open('supabase/functions/uazapi-webhook/index.ts', 'r') as f:
    lines = f.readlines()

# Localizamos a linha do 'finally {' que sabemos estar em 4071 (aproximadamente)
target_idx = -1
for i, line in enumerate(lines):
    if 'finally {' in line and i > 4000:
        target_idx = i
        break

if target_idx != -1:
    # Substituímos o bloco problemático por uma estrutura limpa
    new_tail = [
        "      } finally {\n",
        "        try {\n",
        "          await releaseConversationLock(supabase, conversationId);\n",
        "        } catch (_) { /* noop */ }\n",
        "      }\n",
        "\n",
        "      return new Response(JSON.stringify({ ok: true }), {\n",
        "        headers: { ...corsHeaders, \"Content-Type\": \"application/json\" },\n",
        "      });\n",
        "    }\n",
        "  }\n",
        "}\n",
        "\n",
        "    console.log(\"[uazapi-webhook] unhandled event:\", (norm as any).event, \"instance:\", norm.instance, \"payload_keys:\", Object.keys(payload));\n",
        "    if (norm.instance) {\n",
        "      console.log(\"[uazapi-webhook] unknown event payload dump:\", JSON.stringify(payload).slice(0, 1000));\n",
        "    }\n",
        "    return new Response(JSON.stringify({ ok: true }), {\n",
        "      headers: { ...corsHeaders, \"Content-Type\": \"application/json\" },\n",
        "    });\n",
        "  } catch (err: any) {\n",
        "    console.error(\"[uazapi-webhook] error:\", err);\n",
        "    return new Response(JSON.stringify({ error: err.message }), {\n",
        "      status: 500,\n",
        "      headers: { ...corsHeaders, \"Content-Type\": \"application/json\" },\n",
        "    });\n",
        "  }\n",
        "});\n"
    ]
    # Cortamos tudo a partir do finally e colamos o novo rabo
    lines = lines[:target_idx] + new_tail
    with open('supabase/functions/uazapi-webhook/index.ts', 'w') as f:
        f.writelines(lines)
    print("Fixed file tail.")
else:
    print("Could not find finally block.")
