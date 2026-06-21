with open('supabase/functions/uazapi-webhook/index.ts', 'r') as f:
    content = f.read()

in_s = None # ' " `
in_c = None # // /*
esc = False

i = 0
while i < len(content):
    c = content[i]
    
    if in_c == '//':
        if c == '\n':
            in_c = None
        i += 1
        continue
    if in_c == '/*':
        if content[i:i+2] == '*/':
            in_c = None
            i += 2
        else:
            i += 1
        continue
        
    if in_s:
        if esc:
            esc = False
        elif c == '\\':
            esc = True
        elif c == in_s:
            in_s = None
        i += 1
        continue
    
    if content[i:i+2] == '//':
        in_c = '//'
        i += 2
        continue
    if content[i:i+2] == '/*':
        in_c = '/*'
        i += 2
        continue
        
    if c in ["'", '"', '`']:
        in_s = c
        start_line = content.count('\n', 0, i) + 1
        i += 1
        continue
        
    i += 1

if in_s:
    print(f"Unclosed {in_s} starting at line {start_line}")
else:
    print("All quotes closed")
