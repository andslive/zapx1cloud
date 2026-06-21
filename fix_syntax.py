import sys

def check_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    stack = []
    in_string = False
    string_char = None
    escaped = False
    in_comment = False
    in_single_line_comment = False
    
    i = 0
    while i < len(content):
        char = content[i]
        if char == '\n':
            in_single_line_comment = False
        
        if escaped:
            escaped = False
            i += 1
            continue
            
        if not in_string and not in_comment and not in_single_line_comment:
            if char == '"' or char == "'" or char == "`":
                in_string = True
                string_char = char
            elif char == '/' and i+1 < len(content) and content[i+1] == '/':
                in_single_line_comment = True
                i += 1
            elif char == '/' and i+1 < len(content) and content[i+1] == '*':
                in_comment = True
                i += 1
            elif char in ('{', '(', '['):
                stack.append(char)
            elif char == '}':
                if stack and stack[-1] == '{': stack.pop()
                else: return i, '}'
            elif char == ')':
                if stack and stack[-1] == '(': stack.pop()
                else: return i, ')'
            elif char == ']':
                if stack and stack[-1] == '[': stack.pop()
                else: return i, ']'
        elif in_string:
            if char == '\\': escaped = True
            elif char == string_char: in_string = False
        elif in_comment:
            if char == '*' and i+1 < len(content) and content[i+1] == '/':
                in_comment = False
                i += 1
        
        i += 1
    return None, stack

res = check_file('supabase/functions/uazapi-webhook/index.ts')
if isinstance(res[0], int):
    pos, char = res
    # find line/col
    with open('supabase/functions/uazapi-webhook/index.ts', 'r') as f:
        content = f.read()
    line = content.count('\n', 0, pos) + 1
    col = pos - content.rfind('\n', 0, pos)
    print(f"ERROR: Unexpected {char} at line {line}, col {col}")
    print(f"Context: {content[max(0, pos-50):pos+50].replace('\n', ' ')}")
else:
    print(f"Unclosed: {res[1]}")

