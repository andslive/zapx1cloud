UPDATE platform_settings SET 
  whatsapp_provider = 'uazapi',
  uazapi_url = 'https://free.uazapi.com',
  uazapi_admin_token = 'ZaW1qwTEkuq7Ub1cBUuyMiK5bNSu3nnMQ9lh7klElc2clSRV8t'
WHERE id = (SELECT id FROM platform_settings LIMIT 1);