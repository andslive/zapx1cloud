def check_braces(filename):
    with open(filename, 'r') as f:
        content = f.read()

    stack = []
    in_string = False
    string_char = None
    escaped = False
    
    line = 1
    col = 0
    
    for i, char in enumerate(content):
        if char == '\n':
            line += 1
            col = 0
        else:
            col += 1
            
        if escaped:
            escaped = False
            continue
            
        if char == '\\':
            escaped = True
            continue
            
        if not in_string:
            if char in ('"', "'", '`'):
                in_string = True
                string_char = char
            elif char == '{':
                stack.append((line, col, content[i:i+50].replace('\n', ' ')))
            elif char == '}':
                if stack:
                    stack.pop()
                else:
                    print(f"Extra closing brace at line {line}, column {col}")
        else:
            if char == string_char:
                in_string = False
                string_char = None
        
        if line >= 4320:
             # print(f"Line {line}, col {col}: {char}, level {len(stack)}")
             pass

    if stack:
        print("Unclosed braces at:")
        for l, c, text in stack:
            print(f"  Line {l}, column {c}: {text}")

check_braces('supabase/functions/uazapi-webhook/index.ts')
