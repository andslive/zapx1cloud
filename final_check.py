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
                stack.append(('{', line, col))
            elif char == '}':
                if stack and stack[-1][0] == '{':
                    stack.pop()
                else:
                    print(f"Extra closing brace at line {line}, column {col}")
            elif char == '(':
                stack.append(('(', line, col))
            elif char == ')':
                if stack and stack[-1][0] == '(':
                    stack.pop()
                else:
                    print(f"Extra closing paren at line {line}, column {col}")
            elif char == '[':
                stack.append(('[', line, col))
            elif char == ']':
                if stack and stack[-1][0] == '[':
                    stack.pop()
                else:
                    print(f"Extra closing bracket at line {line}, column {col}")
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

    if stack:
        print(f"ERROR: {len(stack)} unclosed items at end of file")
        for type, l, c in stack:
            print(f"  {type} Line {l}, column {c}")
    else:
        print("Syntax (braces/parens/brackets) is balanced!")

check_file('supabase/functions/uazapi-webhook/index.ts')
