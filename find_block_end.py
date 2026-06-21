import sys

def find_end(filename, start_line):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    content = "".join(lines)
    
    stack = []
    in_string = False
    string_char = None
    escaped = False
    in_comment = False
    in_single_line_comment = False
    
    current_line = 1
    target_found = False
    
    i = 0
    while i < len(content):
        char = content[i]
        if char == '\n':
            current_line += 1
            in_single_line_comment = False
        
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
                if current_line == start_line and not target_found:
                    target_found = True
                if target_found:
                    stack.append((current_line, i))
            elif char == '}':
                if target_found:
                    if stack:
                        start_l, start_i = stack.pop()
                        if not stack: # This was the closing brace for our block
                            print(f"Block starting at line {start_l} ends at line {current_line}")
                            return
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

find_end('supabase/functions/uazapi-webhook/index.ts', 1445)
