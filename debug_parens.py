import sys

def check_parens(filename):
    with open(filename, 'r') as f:
        content = f.read()

    stack = []
    in_string = False
    string_char = None
    escaped = False
    in_comment = False
    
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
                # We need to skip to next newline
                pass
            elif char == '/' and i+1 < len(content) and content[i+1] == '*':
                in_comment = True
            elif char == '(':
                stack.append((line, col, content[max(0, i-20):i+50].replace('\n', ' ')))
            elif char == ')':
                if stack:
                    stack.pop()
                else:
                    print(f"Extra closing paren at line {line}, column {col}")
        elif in_string:
            if char == string_char:
                in_string = False
                string_char = None
        elif in_comment:
            if char == '*' and i+1 < len(content) and content[i+1] == '/':
                in_comment = False

    if stack:
        print(f"ERROR: {len(stack)} unclosed parens at end of file")
        for l, c, text in stack:
            print(f"  Line {l}, column {c}: {text}")
    else:
        print("Parens are balanced!")

check_parens('supabase/functions/uazapi-webhook/index.ts')
