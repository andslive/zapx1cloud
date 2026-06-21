def check_file(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    stack = []
    for i, line in enumerate(lines):
        ln = i + 1
        for j, char in enumerate(line):
            if char == '{':
                stack.append((ln, j + 1, line.strip()))
            elif char == '}':
                if not stack:
                    print(f"ERROR: Extra closing brace at line {ln}")
                else:
                    stack.pop()
        
        # Monitor level at interesting functions
        if "function normalizePayload" in line:
            print(f"DEBUG: normalizePayload start at line {ln}, stack depth={len(stack)}")
        if ln == 642:
            print(f"DEBUG: Line 642 stack depth={len(stack)}")
            if stack:
                print(f"  Last unclosed: {stack[-1]}")

    if stack:
        print(f"ERROR: {len(stack)} unclosed braces at end of file")
        for s in stack[-5:]:
            print(f"  {s}")

check_file('supabase/functions/uazapi-webhook/index.ts')
