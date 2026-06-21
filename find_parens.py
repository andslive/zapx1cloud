import re

def check_parens(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # Remove single line comments
    content = re.sub(r'//.*', '', content)
    # Remove multi line comments
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)

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
            elif char == '(':
                stack.append((line, col))
            elif char == ')':
                if stack:
                    stack.pop()
                else:
                    print(f"Extra closing paren near line {line}")
                    start = max(0, i - 100)
                    end = min(len(content), i + 100)
                    print(f"Context: {content[start:end].replace('\\n', ' ')}")
                    return # Stop at first real error
        else:
            if char == string_char:
                in_string = False
                string_char = None

    if stack:
        print("Unclosed parens at:")
        for l, c in stack:
            print(f"  Line {l}, column {c}")

check_parens('supabase/functions/uazapi-webhook/index.ts')
