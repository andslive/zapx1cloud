async function auditUazApi() {
  const url = 'https://crmx1.uazapi.com';
  const adminToken = 'chM0sTpcwvVApCWBGScAoJokBmwJSOrw4vY6hE0MkCX4v58hZG';

  console.log('--- AUDITORIA UAZAPI ---');

  console.log('\n1. Instâncias no Servidor (/instance/all):');
  try {
    const resAll = await fetch(`${url}/instance/all`, {
      headers: { 'adminToken': adminToken }
    });
    if (!resAll.ok) {
       console.log('HTTP Error:', resAll.status);
       const txt = await resAll.text();
       console.log('Body:', txt);
    } else {
       const dataAll = await resAll.json();
       console.log(JSON.stringify(dataAll, null, 2));
    }
  } catch (e) {
    console.log('Erro ao listar instâncias:', e.message);
  }

  console.log('\n2. Verificando endpoints do Manager:');
  const endpoints = ['/status', '/manager/instances', '/pm2/list', '/sessions'];
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${url}${ep}`, { headers: { 'adminToken': adminToken } });
      console.log(`Endpoint ${ep}: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2).slice(0, 500) + '...');
      }
    } catch (e) {}
  }
}
auditUazApi();
