import sys

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
                stack.append((line, col, content[max(0, i-20):i+50].replace('\n', ' ')))
            elif char == '}':
                if stack:
                    # if line >= 640 and line <= 645:
                    #     print(f"DEBUG: Closing brace at line {line}, col {col}. Closed: {stack[-1]}")
                    stack.pop()
                else:
                    print(f"Extra closing brace at line {line}, column {col}")
        else:
            if char == string_char:
                in_string = False
                string_char = None
        
        if line == 643 and col == 1:
             print(f"DEBUG: Depth at start of line 643: {len(stack)}")
             if stack:
                 print(f"  Last unclosed: {stack[-1]}")

    if stack:
        print("Unclosed braces at end of file:")
        for l, c, text in stack[-5:]:
            print(f"  Line {l}, column {c}: ...{text}...")

check_braces('supabase/functions/uazapi-webhook/index.ts')
