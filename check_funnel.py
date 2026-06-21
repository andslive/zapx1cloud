import json
import os
import subprocess

def get_funnel():
    cmd = ["psql", "-t", "-c", "SELECT flow_blocks FROM capture_funnels WHERE name ILIKE '%Anderson Silva%' LIMIT 1;"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return None
    
    try:
        blocks = json.loads(result.stdout.strip())
        return blocks
    except Exception as e:
        print(f"Failed to parse JSON: {e}")
        return None

blocks = get_funnel()
if blocks:
    for block in blocks:
        if block.get('type') == 'ai_receipt':
            print(json.dumps(block, indent=2))
        elif 'comprovante' in str(block).lower():
            print(f"Found block with 'comprovante' in it: {block.get('id')} ({block.get('type')})")
            # print(json.dumps(block, indent=2))
