async function auditDetailed() {
  const url = 'https://crmx1.uazapi.com';
  const adminToken = 'chM0sTpcwvVApCWBGScAoJokBmwJSOrw4vY6hE0MkCX4v58hZG';

  console.log('--- AUDITORIA DETALHADA ---');

  // 1. Tentar listar instâncias no servidor (UazAPI)
  const resAll = await fetch(`${url}/instance/all`, { headers: { 'adminToken': adminToken } });
  const serverInstances = await resAll.json();

  // 2. Tentar endpoints alternativos de Manager (se o /status retornou total_instances: 4 mas serverInstances tem 5)
  console.log('Total no servidor (UazAPI):', serverInstances.length);
  
  // 3. Verificar instâncias específicas reportadas como problema
  const targets = ['inst-chip21', 'CHIP26', 'chip17', 'chip16', 'chip19', '9MmX47'];
  
  for (const name of targets) {
     console.log(`\nAuditando: ${name}`);
     const inst = serverInstances.find(i => i.name === name);
     if (inst) {
       console.log(`- Encontrada no servidor (ID: ${inst.id}, Status: ${inst.status})`);
     } else {
       console.log(`- NÃO encontrada no servidor UazAPI`);
     }
  }

  // 4. Testar endpoints de PM2 se houver porta específica ou proxy
  const pm2Endpoints = ['/pm2', '/process/list', '/instances'];
  for (const ep of pm2Endpoints) {
    try {
      const r = await fetch(`${url}${ep}`, { headers: { 'adminToken': adminToken } });
      console.log(`Endpoint ${ep}: ${r.status}`);
    } catch(e) {}
  }
}
auditDetailed();
