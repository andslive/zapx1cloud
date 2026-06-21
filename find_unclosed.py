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
    
    line = 1
    col = 0
    
    i = 0
    while i < len(content):
        char = content[i]
        if char == '\n':
            line += 1
            col = 0
            in_single_line_comment = False
        else:
            col += 1
            
        if escaped:
            escaped = False
            i += 1
            continue
            
        if not in_string and not in_comment and not in_single_line_comment:
            if char in ('"', "'", '`'):
                in_string = True
                string_char = char
            elif char == '/' and i+1 < len(content) and content[i+1] == '/':
                in_single_line_comment = True
                i += 1
            elif char == '/' and i+1 < len(content) and content[i+1] == '*':
                in_comment = True
                i += 1
            elif char == '{':
                stack.append((line, col, content[max(0, i-10):i+50].replace('\n', ' ')))
            elif char == '}':
                if stack:
                    stack.pop()
        elif in_string:
            if char == '\\':
                escaped = True
            elif char == string_char:
                in_string = False
                string_char = None
        elif in_comment:
            if char == '*' and i+1 < len(content) and content[i+1] == '/':
                in_comment = False
                i += 1
        
        i += 1
        if line == 3052:
            print(f"Depth at 3052: {len(stack)}")
            for s in stack:
                print(f"  {s}")
            return

check_file('supabase/functions/uazapi-webhook/index.ts')
