import json
import sys

def find_documents(blocks):
    docs = []
    for block in blocks:
        if block.get('type') == 'document':
            data = block.get('data', {})
            docs.append({
                'id': block.get('id'),
                'name': data.get('file_name') or data.get('name'),
                'url': data.get('document_url') or (data.get('document_urls')[0]['url'] if data.get('document_urls') else None)
            })
    return docs

try:
    # Read from stdin
    data = sys.stdin.read()
    # The output from read_query is a list of maps, we need to extract the flow_blocks from the first one
    # Note: read_query output format might be weird in this env, let's try to parse it
    # Actually, let's just use the query to filter in SQL if possible, but JSON parsing in SQL is easier
    
    # Assuming the input is the JSON representation of the result
    # [{flow_blocks: [...]}]
    # But it looks like map[...] in the output, which is not standard JSON
    pass
