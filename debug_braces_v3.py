import sys

def check_braces(filename):
    with open(filename, 'r') as f:
        content = f.read()

    stack = []
    in_string = False
    string_char = None
    escaped = False
    in_comment = False # track multi-line comments
    
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
            
        if not in_string and not in_comment:
            if char in ('"', "'", '`'):
                in_string = True
                string_char = char
            elif char == '/' and i+1 < len(content) and content[i+1] == '/':
                # Single line comment - skip to next newline
                # (Easiest way is to just let it run but we need to handle // inside strings)
                # Actually, skipping characters until \n is better.
                pass 
            elif char == '/' and i+1 < len(content) and content[i+1] == '*':
                in_comment = True
            elif char == '{':
                stack.append((line, col, content[max(0, i-20):i+50].replace('\n', ' ')))
            elif char == '}':
                if stack:
                    stack.pop()
                else:
                    print(f"Extra closing brace at line {line}, column {col}")
        elif in_string:
            if char == string_char:
                in_string = False
                string_char = None
        elif in_comment:
            if char == '*' and i+1 < len(content) and content[i+1] == '/':
                in_comment = False

    if stack:
        print(f"ERROR: {len(stack)} unclosed braces at end of file")
        for l, c, text in stack:
            print(f"  Line {l}, column {c}: {text}")
    else:
        print("Braces are balanced!")

check_braces('supabase/functions/uazapi-webhook/index.ts')
