// Recria usuários no Supabase novo via Auth Admin API e gera o mapa old_user_id -> new_user_id.
// NÃO apaga, NÃO atualiza e NÃO cria nada além de auth.users (via createUser) e o CSV de saída.
// Roda com: deno run --allow-net --allow-env --allow-read --allow-write scripts/migration/02_recreate_users_and_map.ts
//
// Idempotente: antes de criar, verifica se o e-mail já existe no projeto novo (admin.auth.admin.listUsers)
// e, se existir, reaproveita o user_id em vez de criar de novo.
//
// Fonte de profiles.csv e destino de user_id_map.csv: DATA_EXPORT_DIR (default:
// /opt/x1zap/zapx1cloud/data-export) — os CSVs já são fornecidos prontos, não há
// mais conexão com o banco Lovable neste fluxo.

import { parse } from "https://deno.land/std@0.224.0/csv/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPORT_DIR = Deno.env.get("DATA_EXPORT_DIR") ?? "/opt/x1zap/zapx1cloud/data-export";

const SUPABASE_URL = Deno.env.get("NEW_SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("NEW_SUPABASE_SERVICE_ROLE_KEY");
const SUPER_ADMIN_EMAIL = (Deno.env.get("SUPER_ADMIN_EMAIL") ?? "").toLowerCase();

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Defina NEW_SUPABASE_URL e NEW_SUPABASE_SERVICE_ROLE_KEY.");
  Deno.exit(1);
}
if (!SUPER_ADMIN_EMAIL) {
  console.error("Defina SUPER_ADMIN_EMAIL (será excluído da recriação).");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function readCsv(name: string): Promise<Record<string, string>[]> {
  const text = await Deno.readTextFile(`${EXPORT_DIR}/${name}`);
  return parse(text, { skipFirstRow: true }) as unknown as Record<string, string>[];
}

function genTempPassword(): string {
  return "Tmp!" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

// admin.auth.admin.listUsers não filtra por e-mail nativamente em todas as versões;
// pagina até achar ou esgotar.
async function findExistingUserByEmail(email: string): Promise<string | null> {
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function main() {
  const profiles = await readCsv("profiles.csv");

  const map: {
    old_user_id: string;
    new_user_id: string;
    email: string;
    created: boolean;
    is_super_admin: boolean;
  }[] = [];

  for (const p of profiles) {
    const oldId = p.id;
    const email = (p.email ?? "").trim();
    const fullName = p.full_name ?? "";

    if (!email) {
      console.warn(`  ! profile ${oldId} sem e-mail, pulando`);
      continue;
    }
    if (email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      // Não recria o super admin nem toca em seu profile/roles — mas ainda assim
      // precisamos do old_id -> new_id dele no mapa, para que FKs como owner_id/
      // created_by/leader_id/invited_by apontando para ele sejam reescritas
      // corretamente em vez de virarem NULL. O import (03) filtra explicitamente
      // este e-mail antes de tocar em profiles/user_roles/etc.
      const existingId = await findExistingUserByEmail(email);
      if (!existingId) {
        console.error(
          `  ! super admin (${email}) não encontrado no projeto novo — verifique se já foi criado antes de continuar.`,
        );
        continue;
      }
      console.log(`  - ${email}: super admin, id existente reaproveitado só para reescrita de FK (sem recriar/alterar)`);
      map.push({ old_user_id: oldId, new_user_id: existingId, email, created: false, is_super_admin: true });
      continue;
    }

    const existingId = await findExistingUserByEmail(email);
    if (existingId) {
      console.log(`  - ${email}: já existe no projeto novo, reaproveitando user_id`);
      map.push({ old_user_id: oldId, new_user_id: existingId, email, created: false, is_super_admin: false });
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: genTempPassword(),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      console.error(`  ! falha ao criar ${email}: ${error.message}`);
      continue;
    }
    console.log(`  + ${email}: criado (user_id novo, senha temporária — usuário deve trocar no primeiro acesso)`);
    map.push({ old_user_id: oldId, new_user_id: data.user!.id, email, created: true, is_super_admin: false });
  }

  const header = "old_user_id,new_user_id,email,created,is_super_admin\n";
  const rows = map
    .map((m) => `${m.old_user_id},${m.new_user_id},${m.email},${m.created},${m.is_super_admin}`)
    .join("\n");
  await Deno.writeTextFile(`${EXPORT_DIR}/user_id_map.csv`, header + rows + "\n");

  console.log(`\nMapa gerado: ${EXPORT_DIR}/user_id_map.csv (${map.length} usuários).`);
  console.log("Nenhum dado de negócio foi inserido ainda — apenas auth.users.");
}

await main();
