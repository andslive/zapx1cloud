def find_bug(filename, start, end):
    with open(filename, 'r') as f:
        content = f.read()
    
    lines = content.split('\n')
    
    stack = []
    in_string = False
    string_char = None
    escaped = False
    in_comment = False
    in_single_line_comment = False
    
    line_num = 1
    i = 0
    while i < len(content):
        char = content[i]
        if char == '\n':
            line_num += 1
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
                stack.append((line_num, content[max(0, i-10):i+30].replace('\n', ' ')))
            elif char == '}':
                if stack:
                    stack.pop()
                else:
                    print(f"Extra closing brace at line {line_num}")
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
        print(f"Unclosed braces at end of file ({len(stack)}):")
        for s in stack:
            print(f"  {s}")
    else:
        print("Braces are balanced!")

find_bug('supabase/functions/uazapi-webhook/index.ts', 1, 4345)
