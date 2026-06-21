import sys

with open('supabase/functions/uazapi-webhook/index.ts', 'r') as f:
    content = f.read()

# Comment/string aware brace matching
in_s = None
in_c = None
esc = False
target_line = int(sys.argv[1])
target_offset = -1

lines = content.splitlines()
curr_offset = 0
for i, line in enumerate(lines):
    if i + 1 == target_line:
        idx = line.find('{')
        if idx != -1:
            target_offset = curr_offset + idx
    curr_offset += len(line) + 1

if target_offset == -1:
    print('Target line not found or no {')
    sys.exit(1)

depth = 0
i = 0
while i < len(content):
    c = content[i]
    if in_c == '//':
        if c == '\n': in_c = None
        i += 1; continue
    if in_c == '/*':
        if content[i:i+2] == '*/': in_c = None; i += 2
        else: i += 1
        continue
    if in_s:
        if esc: esc = False
        elif c == '\\': esc = True
        elif c == in_s: in_s = None
        i += 1; continue
    if content[i:i+2] == '//': in_c = '//'; i += 2; continue
    if content[i:i+2] == '/*': in_c = '/*'; i += 2; continue
    if c in ["'", '"', '`']: in_s = c; i += 1; continue
    
    if i == target_offset:
        depth = 1
    elif depth > 0:
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                line = content.count('\n', 0, i) + 1
                print(f'Matching brace for line {target_line} is at line {line}')
                sys.exit(0)
    i += 1
print('Matching brace not found')
