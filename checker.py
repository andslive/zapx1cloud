import sys

def check_structure(filename):
    with open(filename, 'r') as f:
        content = f.read()
    
    stack = []
    line = 1
    col = 1
    
    in_string = None
    in_comment = None
    in_regex = False
    
    i = 0
    while i < len(content):
        char = content[i]
        
        if in_comment == '//':
            if char == '\n':
                in_comment = None
        elif in_comment == '/*':
            if char == '*' and i + 1 < len(content) and content[i+1] == '/':
                in_comment = None
                i += 1
                col += 1
        elif in_string:
            if char == in_string:
                # Check for escape
                esc = False
                p = i - 1
                while p >= 0 and content[p] == '\\':
                    esc = not esc
                    p -= 1
                if not esc:
                    in_string = None
        elif in_regex:
            if char == '/':
                esc = False
                p = i - 1
                while p >= 0 and content[p] == '\\':
                    esc = not esc
                    p -= 1
                if not esc:
                    in_regex = False
        else:
            if char == '/' and i + 1 < len(content):
                if content[i+1] == '/':
                    in_comment = '//'
                    i += 1
                    col += 1
                elif content[i+1] == '*':
                    in_comment = '/*'
                    i += 1
                    col += 1
                else:
                    # Potential regex
                    # Heuristic: if previous non-whitespace was (, =, :, ,, or starts a line
                    p = i - 1
                    while p >= 0 and content[p].isspace():
                        p -= 1
                    if p < 0 or content[p] in '(=:,!&|[':
                        in_regex = True
            elif char in ('"', "'", '`'):
                in_string = char
            elif char in ('(', '{', '['):
                stack.append((char, line, col))
            elif char in (')', '}', ']'):
                if not stack:
                    print(f'Extra {char} at {line}:{col}')
                    return
                expected = {'(': ')', '{': '}', '[': ']'}.get(stack[-1][0])
                if expected == char:
                    stack.pop()
                else:
                    print(f'Mismatched {char} at {line}:{col}. Expected {expected} (from {stack[-1][0]} at {stack[-1][1]}:{stack[-1][2]})')
                    # Print context
                    start = max(0, i - 100)
                    end = min(len(content), i + 100)
                    print(f'Context: ...{content[start:end]}...')
                    return
        
        if char == '\n':
            line += 1
            col = 1
        else:
            col += 1
        i += 1

    if stack:
        char, l, c = stack[-1]
        print(f'Unclosed {char} starting at {l}:{c}')
    else:
        print("Balanced!")

check_structure(sys.argv[1])
