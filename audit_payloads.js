
import fs from 'fs';

const payloads = JSON.parse(fs.readFileSync('/tmp/payloads.json', 'utf8'));

const targetKeys = [
  'referral',
  'contextInfo',
  'externalAdReply',
  'ctwaPayload',
  'conversionData',
  'conversionSource',
  'entryPointConversionSource',
  'entryPointConversionApp'
];

const results = {
  totalAnalyzed: payloads.length,
  occurrences: {},
  paths: [],
  snippets: [],
  found: {}
};

targetKeys.forEach(key => {
  results.occurrences[key] = 0;
  results.found[key] = false;
});

function recursiveSearch(obj, path = '') {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => recursiveSearch(item, `${path}[${index}]`));
    return;
  }

  for (const key in obj) {
    const currentPath = path ? `${path}.${key}` : key;
    
    if (targetKeys.includes(key)) {
      results.occurrences[key]++;
      results.found[key] = true;
      results.paths.push(currentPath);
      
      // Anonymize sensitive data in snippets
      const val = obj[key];
      let anonymizedVal = val;
      if (typeof val === 'string') {
        // Simple anonymization for phones/emails if found
        anonymizedVal = val.replace(/\d{8,}/g, '[PHONE]').replace(/\S+@\S+\.\S+/g, '[EMAIL]');
      } else if (typeof val === 'object' && val !== null) {
        anonymizedVal = JSON.parse(JSON.stringify(val));
        const clean = (o) => {
           for (let k in o) {
             if (typeof o[k] === 'string') o[k] = o[k].replace(/\d{8,}/g, '[PHONE]').replace(/\S+@\S+\.\S+/g, '[EMAIL]');
             else if (typeof o[k] === 'object' && o[k] !== null) clean(o[k]);
           }
        };
        clean(anonymizedVal);
      }

      results.snippets.push({
        key,
        path: currentPath,
        value: anonymizedVal
      });
    }
    
    recursiveSearch(obj[key], currentPath);
  }
}

payloads.forEach((payload, index) => {
  recursiveSearch(payload, `payload[${index}]`);
});

console.log(JSON.stringify(results, null, 2));
