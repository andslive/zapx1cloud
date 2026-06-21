
def analyze_depth(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    depth = 0
    lines = content.split('\n')
    for i, line in enumerate(lines):
        for char in line:
            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
        print(f"Line {i+1}: Depth {depth}")

analyze_depth('supabase/functions/uazapi-webhook/index.ts')
